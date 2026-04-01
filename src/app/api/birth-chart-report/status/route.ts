import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getSessionUserId(request: NextRequest, fallbackUserId?: string | null): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  if (accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return fallbackUserId?.trim() || null;
}

export async function GET(request: NextRequest) {
  const userId = getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: latestReport, error } = await supabaseAdmin
    .from("birth_chart_reports")
    .select("id, status, generated_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[birth-chart-report/status] error", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }

  if (!latestReport) {
    return NextResponse.json({ status: "not_started" });
  }

  return NextResponse.json({
    report_id: latestReport.id,
    status: latestReport.status,
    generated_at: latestReport.generated_at,
  });
}
