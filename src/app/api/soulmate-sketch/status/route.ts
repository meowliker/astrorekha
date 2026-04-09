import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";
import { getSoulmateSketchJobStatusFromKie } from "@/lib/soulmate-sketch";

const PROVIDER_POLL_COOLDOWN_MS = Number(process.env.KIE_STATUS_POLL_COOLDOWN_MS || 12000);

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
      .select("id, user_id, status, provider_job_id, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at")
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

    if (data.status === "generating" && data.provider_job_id && !data.sketch_image_url) {
      const updatedAtTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      const shouldPollProvider = !updatedAtTs || Date.now() - updatedAtTs >= PROVIDER_POLL_COOLDOWN_MS;
      if (!shouldPollProvider) {
        return NextResponse.json({
          ...data,
          maxSketchPerUser: config.maxSketchPerUser,
          remaining: Math.max(0, config.maxSketchPerUser - (data.generation_count || 0)),
        });
      }

      try {
        const job = await getSoulmateSketchJobStatusFromKie(String(data.provider_job_id));

        if (job.state === "success" && job.imageUrl) {
          const { data: completed } = await supabase
            .from("soulmate_sketches")
            .update({
              status: "complete",
              sketch_image_url: job.imageUrl,
              generated_at: new Date().toISOString(),
              generation_count: 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .select("id, user_id, status, provider_job_id, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at")
            .maybeSingle();

          if (completed) {
            return NextResponse.json({
              ...completed,
              maxSketchPerUser: config.maxSketchPerUser,
              remaining: Math.max(0, config.maxSketchPerUser - (completed.generation_count || 0)),
            });
          }
        }

        if (job.state === "fail" || job.state === "failed") {
          const { data: failed } = await supabase
            .from("soulmate_sketches")
            .update({
              status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .select("id, user_id, status, provider_job_id, sketch_image_url, question_answers, generated_at, generation_count, created_at, updated_at")
            .maybeSingle();

          return NextResponse.json({
            ...(failed || data),
            message: job.failMessage || "Sketch generation failed",
            maxSketchPerUser: config.maxSketchPerUser,
            remaining: Math.max(0, config.maxSketchPerUser - ((failed?.generation_count ?? data.generation_count) || 0)),
          });
        }

        await supabase
          .from("soulmate_sketches")
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      } catch (pollError) {
        console.error("[soulmate-sketch/status] provider poll error", pollError);
      }
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
