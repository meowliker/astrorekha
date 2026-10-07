import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hydrateSpiritAnimalReport, isSpiritAnimalKey } from "@/lib/spirit-animal-report";

export const dynamic = "force-dynamic";

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) return accessCookie.trim();
  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;
  return request.nextUrl.searchParams.get("userId")?.trim() || null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getSessionUserId(request);
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("unlocked_features")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    if (!user.unlocked_features?.spiritAnimalReport) {
      return NextResponse.json({ error: "feature_locked" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("spirit_animal_reports")
      .select("status, animal_key, report_snapshot, trait_scores, scoring_version, generated_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[spirit-animal/status] fetch error", error);
      return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ status: "not_started" });
    if (!isSpiritAnimalKey(data.animal_key)) {
      return NextResponse.json({ error: "invalid_animal_result" }, { status: 500 });
    }

    return NextResponse.json({
      status: "complete",
      animal_key: data.animal_key,
      result: hydrateSpiritAnimalReport(data.animal_key, data.report_snapshot, data.generated_at, data.trait_scores),
      scoring_version: data.scoring_version,
      generated_at: data.generated_at,
      updated_at: data.updated_at,
    });
  } catch (error) {
    console.error("[spirit-animal/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
