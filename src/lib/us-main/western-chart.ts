import { createHash } from "node:crypto";
import { getBirthDateParts, getBirthTime24, type BirthDetailsInput } from "@/lib/birth-details";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { westernChart, WESTERN_CHART_VERSION, type WesternChart } from "@/lib/western-zodiac";

export async function calculateWesternChart(input: BirthDetailsInput): Promise<{ id: string; data: WesternChart }> {
  const date = getBirthDateParts(input);
  const place = typeof input.birthPlace === "string" ? input.birthPlace.trim() : "";
  const knowsTime = input.knowsBirthTime !== false;
  const time = knowsTime ? getBirthTime24(input) : "12:00";
  if (!date || !place || !time) throw new Error("A valid birth date, birthplace and known birth time are required");
  const id = `${WESTERN_CHART_VERSION}_${createHash("sha256").update(JSON.stringify({date,place,time,knowsTime})).digest("hex")}`;
  const db = getSupabaseAdmin();
  const { data: cached } = await db.from("birth_charts").select("data").eq("id", id).maybeSingle();
  if (cached?.data?.zodiacSystem === WESTERN_CHART_VERSION && Number.isFinite(cached.data.birthDetails?.julianDay)) return {id,data:cached.data as WesternChart};
  const [hour, minute] = time.split(":").map(Number);
  // Engine resolves the birthplace's historical timezone and DST, not today's UTC offset.
  const result = await fetchFromAstroEngine("/calculate", {...date,hour,minute,second:0,place},15000);
  const data = westernChart(result.chart, knowsTime);
  const {error} = await db.from("birth_charts").upsert({id,data,cached_at:new Date().toISOString()},{onConflict:"id"});
  if(error) throw new Error("Unable to save Western birth chart");
  return {id,data};
}
export async function loadWesternAccountChart(userId: string) {
  const db = getSupabaseAdmin();
  const [{data:profile,error:pe},{data:user,error:ue}] = await Promise.all([
    db.from("user_profiles").select("*").eq("id",userId).maybeSingle(),
    db.from("users").select("*").eq("id",userId).maybeSingle(),
  ]);
  if(pe || ue) throw new Error("Unable to load saved birth details");
  // A complete profile snapshot is authoritative. Do not combine a new date with an old time.
  const p = profile?.birth_year && profile?.birth_month && profile?.birth_day ? profile : user || {};
  const place = p.birth_place || user?.birth_place;
  return calculateWesternChart({birthMonth:p.birth_month,birthDay:p.birth_day,birthYear:p.birth_year,
    birthHour:p.birth_hour,birthMinute:p.birth_minute,birthPeriod:p.birth_period,birthPlace:place,
    knowsBirthTime:p.knows_birth_time ?? Boolean(p.birth_hour != null && p.birth_period)});
}
