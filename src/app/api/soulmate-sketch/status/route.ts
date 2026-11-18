import { isPrivateSketchImage, resolveSketchImage } from "@/lib/sketch-image";
import { reportSessionUser } from "@/lib/report-session";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";
import { reconcileSoulmateSketch, type SavedSketch } from "@/lib/soulmate-sketch-reconcile";

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
    const userId = reportSessionUser(request);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const config = await loadLayoutConfig();

    const { data: saved, error } = await supabase
      .from("soulmate_sketches")
      .select("id, user_id, status, provider_job_id, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at, support_recovery_action_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[soulmate-sketch/status] error", error);
      return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
    }

    let data: SavedSketch | null = saved;
    if (!data) {
      return NextResponse.json({
        status: "not_started",
        maxSketchPerUser: config.maxSketchPerUser,
      });
    }

    let providerState: string | null = null;
    let providerDelayed = false;
    let statusCheckUnavailable = false;
    try {
      const reconciled = await reconcileSoulmateSketch(data);
      data = reconciled.sketch;
      providerState = reconciled.providerState;
      providerDelayed = reconciled.providerDelayed;
    } catch {
      // Retain the existing job on provider/network errors. Do not create a replacement.
      statusCheckUnavailable = true;
    }

    const privateImage = data.sketch_image_url && isPrivateSketchImage(data.sketch_image_url);
    if (privateImage && reportSessionUser(request) !== userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      ...data,
      providerState, providerDelayed, statusCheckUnavailable,
      sketch_image_url: privateImage && data.sketch_image_url ? await resolveSketchImage(data.sketch_image_url, userId) : data.sketch_image_url,
      maxSketchPerUser: config.maxSketchPerUser,
      remaining: Math.max(0, config.maxSketchPerUser - (data.generation_count || 0)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[soulmate-sketch/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
