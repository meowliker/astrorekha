import { NextRequest, NextResponse } from "next/server";
import { reportSessionUser, setReportSession } from "@/lib/report-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const userId = reportSessionUser(request);
  const headers = { "Cache-Control": "no-store" };
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const { data: storedUser, error } = await getSupabaseAdmin().from("users")
    .select("*")
    .eq("id", userId).maybeSingle();
  if (error) return NextResponse.json({ error: "session_unavailable" }, { status: 503, headers });
  if (!storedUser) return NextResponse.json({ error: "account_not_found" }, { status: 401, headers });
  const fields = ["id","email","name","coins","unlocked_features","bundle_purchased","onboarding_flow","purchase_type","timezone","is_dev_tester",
    "gender","relationship_status","birth_month","birth_day","birth_year","birth_hour","birth_minute","birth_period","birth_place","knows_birth_time","sun_sign","moon_sign","ascendant_sign",
    "palm_reading","birth_chart","compatibility_test","prediction_2026","soulmate_sketch","future_partner_report","vastu_shastra_guide","aura_color_report","past_life_report","numerology_report","spirit_animal_report","birth_chart_timer_active","birth_chart_timer_started_at"];
  const user = Object.fromEntries(fields.filter(key => key in storedUser).map(key => [key,storedUser[key]]));
  // Repair the legacy page-access cookie only after verifying the signed session.
  const response = setReportSession(NextResponse.json({ user }, { headers }), userId);
  response.cookies.set("ar_access", "1", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400,
  });
  return response;
}
