import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";
import {
  buildSoulmateSketchPrompt,
  generateSoulmateSketchFromKie,
  KieTimeoutError,
  type SketchAnswers,
} from "@/lib/soulmate-sketch";

export const maxDuration = 60;

function normalizeAnswers(raw: any): SketchAnswers {
  if (!raw || typeof raw !== "object") return {};
  const normalized: SketchAnswers = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[key] = trimmed;
  }

  return normalized;
}

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

export async function POST(request: NextRequest) {
  const userId = getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const incomingAnswers = normalizeAnswers(body?.answers || {});

  const supabase = getSupabaseAdmin();
  const config = await loadLayoutConfig();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name, sun_sign, unlocked_features")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const unlocked = user.unlocked_features || {};
  if (!unlocked.soulmateSketch) {
    return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("soulmate_sketches")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    console.error("[soulmate-sketch/generate] existing row error", existingError);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  if ((existingRow?.generation_count || 0) >= config.maxSketchPerUser) {
    return NextResponse.json(
      {
        error: "generation_limit_reached",
        message: "Only one sketch can be generated per user.",
        sketch: existingRow,
      },
      { status: 409 }
    );
  }

  if (existingRow?.sketch_image_url) {
    return NextResponse.json({
      success: true,
      sketch: existingRow,
      cached: true,
    });
  }

  const storedAnswers = normalizeAnswers(existingRow?.question_answers || {});
  const answers = { ...storedAnswers, ...incomingAnswers };
  const prompt = buildSoulmateSketchPrompt(answers, user);
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    user_id: userId,
    status: "generating",
    question_answers: answers,
    prompt,
    provider: "kie-nano-banana-2",
    updated_at: nowIso,
    created_at: existingRow?.created_at || nowIso,
  };

  const { error: upsertError } = await supabase
    .from("soulmate_sketches")
    .upsert(upsertPayload, { onConflict: "user_id" });

  if (upsertError) {
    console.error("[soulmate-sketch/generate] upsert generating error", upsertError);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  try {
    const generated = await generateSoulmateSketchFromKie({ prompt, config });

    const { data: completed, error: completeError } = await supabase
      .from("soulmate_sketches")
      .update({
        status: "complete",
        sketch_image_url: generated.imageUrl,
        provider_job_id: generated.providerJobId || null,
        generated_at: new Date().toISOString(),
        generation_count: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (completeError) {
      console.error("[soulmate-sketch/generate] complete update error", completeError);
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sketch: completed,
    });
  } catch (error: any) {
    if (error instanceof KieTimeoutError) {
      const { data: pendingRow } = await supabase
        .from("soulmate_sketches")
        .update({
          status: "generating",
          provider_job_id: error.jobId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      console.warn("[soulmate-sketch/generate] still generating, handing off to status polling", {
        userId,
        jobId: error.jobId,
      });

      return NextResponse.json({
        success: true,
        sketch: pendingRow || {
          user_id: userId,
          status: "generating",
          provider_job_id: error.jobId,
        },
        pending: true,
        message: "Sketch is still generating. Please wait...",
      });
    }

    const rawMessage = typeof error?.message === "string" ? error.message.trim() : "";
    const safeMessage =
      rawMessage && rawMessage.toLowerCase() !== "no message available"
        ? rawMessage
        : "Sketch generation failed at provider. Please try again in a minute.";

    console.error("[soulmate-sketch/generate] provider error", {
      name: error?.name,
      message: rawMessage || null,
      stack: error?.stack || null,
      cause: error?.cause || null,
    });
    await supabase
      .from("soulmate_sketches")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json(
      {
        error: "generation_failed",
        message: safeMessage,
      },
      { status: 500 }
    );
  }
}
