import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return response;
}

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return null;
}

export async function GET(request: NextRequest) {
  noStore();

  try {
    const userId = getSessionUserId(request);
    if (!userId) {
      return jsonNoStore({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("unlocked_features")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return jsonNoStore({ error: "user_not_found" }, { status: 404 });
    }

    if (!user.unlocked_features?.astrocartographyReport) {
      return jsonNoStore({ error: "feature_locked" }, { status: 403 });
    }

    const { data: report, error: reportError } = await supabase
      .from("astrocartography_reports")
      .select("id, status, birth_data, report_data, generated_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (reportError) {
      console.error("[astrocartography/status] report fetch error", reportError);
      return jsonNoStore({ error: "status_fetch_failed" }, { status: 500 });
    }

    if (!report) {
      return jsonNoStore({ status: "not_started" });
    }

    return jsonNoStore({
      id: report.id,
      status: report.status,
      birthData: report.birth_data || null,
      report: report.report_data || null,
      generated_at: report.generated_at || null,
      updated_at: report.updated_at || null,
    });
  } catch (error) {
    console.error("[astrocartography/status] unexpected", error);
    return jsonNoStore({ error: "status_fetch_failed" }, { status: 500 });
  }
}
