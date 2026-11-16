import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { birthSnapshotToDbFields, normalizeBirthDetailsSnapshot, getBirthMonthNumber } from "@/lib/birth-details";
import type { StoredProfile } from "@/lib/stored-profile-types";
import { validCheckoutPalm } from "@/lib/report-input-snapshot";

type Profile = StoredProfile & { palm_image?: string | null };
const hasDate = (p: Profile) => Boolean(p.birth_year && p.birth_month && p.birth_day);
/** Read saved inputs only from this authenticated account's fulfilled orders. No financial writes. */
export async function loadPaidReportProfile(userId: string, needPalm = false): Promise<Profile> {
  const db = getSupabaseAdmin();
  const {data, error} = await db.from("user_profiles").select("*").eq("id",userId).maybeSingle();
  if(error) throw new Error("Unable to load saved report details");
  const profile: Profile = {...(data || {})};
  // Legacy accounts may keep their edited birth details on users rather than user_profiles.
  if(!profile.birth_year && !profile.birth_month && !profile.birth_day) {
    const legacy=await db.from("users").select("*").eq("id",userId).maybeSingle();
    if(legacy.error) throw new Error("Unable to load saved account details");
    if(legacy.data?.birth_year && legacy.data?.birth_month && legacy.data?.birth_day) {
      for(const key of ["birth_year","birth_month","birth_day","birth_hour","birth_minute","birth_period","birth_place","knows_birth_time"])
        if(legacy.data[key] != null) profile[key]=legacy.data[key];
      if(!profile.gender && legacy.data.gender) profile.gender=legacy.data.gender;
    }
  }
  if(hasDate(profile) && (!needPalm || profile.palm_image)) return profile;
  const results = await Promise.all([
    db.from("payments").select("id,birth_details_snapshot,created_at").eq("user_id",userId).eq("payment_status","paid").not("fulfilled_at","is",null).order("created_at",{ascending:false}).limit(10),
    db.from("us_main_orders").select("id,birth_details,created_at").eq("user_id",userId).eq("payment_status","paid").not("fulfilled_at","is",null).order("created_at",{ascending:false}).limit(10),
  ]);
  if(results.some(r => r.error)) throw new Error("Unable to recover saved report details. Please retry.");
  const orders = [...(results[0].data || []).map(o => ({id:o.id,market:"IN",created_at:o.created_at,snapshot:o.birth_details_snapshot})), ...(results[1].data || []).map(o => ({id:o.id,market:"US",created_at:o.created_at,snapshot:o.birth_details}))].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  for(const order of orders) {
    const raw = order.snapshot;
    if(!raw || typeof raw !== "object") continue;
    const snapshot = normalizeBirthDetailsSnapshot(raw,"paid_report_recovery");
    // Do not mix dates/times belonging to different profiles or overwrite edited details.
    if(!profile.birth_year && !profile.birth_month && !profile.birth_day && snapshot?.hasBirthDate) {
      Object.assign(profile,birthSnapshotToDbFields(snapshot));
    }
    const sameDate = snapshot && String(profile.birth_year) === String(snapshot.birthYear)
      && Number(profile.birth_day) === Number(snapshot.birthDay)
      && getBirthMonthNumber(profile.birth_month) === getBirthMonthNumber(snapshot.birthMonth);
    if(needPalm && !profile.palm_image && sameDate) {
      const input=await db.from("checkout_report_inputs").select("palm_image").eq("market",order.market).eq("order_id",order.id).maybeSingle();
      if(input.error) throw new Error("Unable to load saved palm input. Please retry.");
      if(validCheckoutPalm(input.data?.palm_image)) profile.palm_image=input.data.palm_image;
    }
    if(hasDate(profile) && (!needPalm || profile.palm_image)) break;
  }
  return profile;
}
