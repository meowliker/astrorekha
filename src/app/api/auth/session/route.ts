import { NextRequest, NextResponse } from "next/server";
import { reportSessionUser, setReportSession } from "@/lib/report-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const userId = reportSessionUser(request);
  const headers = { "Cache-Control": "no-store" };
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const { data: user, error } = await getSupabaseAdmin().from("users")
    .select("id,email,name,coins,unlocked_features,bundle_purchased,onboarding_flow,purchase_type,timezone,is_dev_tester")
    .eq("id", userId).maybeSingle();
  if (error) return NextResponse.json({ error: "session_unavailable" }, { status: 503, headers });
  if (!user) return NextResponse.json({ error: "account_not_found" }, { status: 401, headers });
  // Repair the legacy page-access cookie only after verifying the signed session.
  const response = setReportSession(NextResponse.json({ user }, { headers }), userId);
  response.cookies.set("ar_access", "1", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400,
  });
  return response;
}
