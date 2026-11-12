import {loadWesternAccountChart} from "@/lib/us-main/western-chart";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeFuturePartnerReportData } from "@/lib/future-partner-report-data";

import {customerMarket} from "@/lib/customer-market";
import {WESTERN_CHART_VERSION} from "@/lib/western-zodiac";

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  if (accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getSessionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("future_partner_reports")
      .select("status, report_data, generated_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[future-partner/status] error", error);
      return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
    }

    if (!data || (await customerMarket(userId) === "US" && data.status === "complete" && (data.report_data?._zodiac_system !== WESTERN_CHART_VERSION || data.report_data?._birth_chart_id !== (await loadWesternAccountChart(userId)).id))) {
      return NextResponse.json({ status: "not_started" });
    }

    const report = normalizeFuturePartnerReportData(data.report_data);
    const status = data.status === "complete" && !report ? "pending" : data.status;

    return NextResponse.json({
      status,
      report,
      generated_at: data.generated_at || null,
      updated_at: data.updated_at || null,
    });
  } catch (error) {
    console.error("[future-partner/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
