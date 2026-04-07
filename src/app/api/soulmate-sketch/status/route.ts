import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

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

async function loadLayoutConfig() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "funnel_layout_b_config")
    .maybeSingle();

  return normalizeLayoutBConfig(data?.value || DEFAULT_LAYOUT_B_CONFIG);
}

export async function GET(request: NextRequest) {
  try {
    const userId = getSessionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const config = await loadLayoutConfig();

    const { data, error } = await supabase
      .from("soulmate_sketches")
      .select("id, user_id, status, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[soulmate-sketch/status] error", error);
      return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        status: "not_started",
        maxSketchPerUser: config.maxSketchPerUser,
      });
    }

    return NextResponse.json({
      ...data,
      maxSketchPerUser: config.maxSketchPerUser,
      remaining: Math.max(0, config.maxSketchPerUser - (data.generation_count || 0)),
    });
  } catch (error) {
    console.error("[soulmate-sketch/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
