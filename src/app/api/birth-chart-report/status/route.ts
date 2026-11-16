import { reportSessionUser } from "@/lib/report-session";
import {loadWesternAccountChart} from "@/lib/us-main/western-chart";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

import {customerMarket} from "@/lib/customer-market";
import {WESTERN_CHART_VERSION} from "@/lib/western-zodiac";



export async function GET(request: NextRequest) {
  const userId = reportSessionUser(request);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: latestReport, error } = await supabaseAdmin
    .from("birth_chart_reports")
    .select("id, status, generated_at, created_at, sections, birth_chart_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[birth-chart-report/status] error", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }

  if (!latestReport || (await customerMarket(userId) === "US" && (latestReport.sections?._zodiac_system !== WESTERN_CHART_VERSION || latestReport.birth_chart_id !== (await loadWesternAccountChart(userId)).id))) {
    return NextResponse.json({ status: "not_started" });
  }

  return NextResponse.json({
    report_id: latestReport.id,
    status: latestReport.status,
    generated_at: latestReport.generated_at,
  });
}
