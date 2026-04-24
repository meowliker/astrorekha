import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { toPartnerInitial } from "@/lib/future-partner-format";

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

    if (!data) {
      return NextResponse.json({ status: "not_started" });
    }

    const report =
      data.report_data && typeof data.report_data === "object"
        ? {
            ...data.report_data,
            partnerName: toPartnerInitial((data.report_data as Record<string, unknown>).partnerName),
          }
        : data.report_data || null;

    return NextResponse.json({
      status: data.status,
      report,
      generated_at: data.generated_at || null,
      updated_at: data.updated_at || null,
    });
  } catch (error) {
    console.error("[future-partner/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
