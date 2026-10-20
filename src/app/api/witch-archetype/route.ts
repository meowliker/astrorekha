import { reportSessionUser } from "@/lib/report-session";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isWitchResult, scoreWitchAnswers, WITCH_QUESTIONS } from "@/lib/witch-archetype";
import { isWitchTemplate } from "@/lib/witch-archetype-template";

export const dynamic = "force-dynamic";

function reportJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "private, no-store" } });
}

async function getUser(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data, error } = await supabase.from("users").select("id, unlocked_features, is_dev_tester").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getTemplate(supabase: ReturnType<typeof getSupabaseAdmin>, key: Parameters<typeof isWitchTemplate>[1]) {
  const { data, error } = await supabase.from("witch_archetype_templates")
    .select("report_data").eq("id", key).eq("active", true).maybeSingle();
  if (error) throw error;
  if (!isWitchTemplate(data?.report_data, key)) throw new Error(`Missing or invalid witch archetype template: ${key}`);
  return data.report_data;
}

export async function GET(request: NextRequest) {
  try {
    const userId = reportSessionUser(request);
    if (!userId) return reportJson({ error: "unauthorized" }, { status: 401 });
    const supabase = getSupabaseAdmin();
    const user = await getUser(supabase, userId);
    if (!user) return reportJson({ error: "user_not_found" }, { status: 404 });
    if (user.is_dev_tester !== true && user.unlocked_features?.witchArchetypeReport !== true) {
      return reportJson({ error: "feature_locked" }, { status: 403 });
    }
    const { data, error } = await supabase.from("witch_archetype_results").select("result").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const result = isWitchResult(data?.result) ? data.result : null;
    const template = result ? await getTemplate(supabase, result.key) : null;
    return reportJson({ result, template, unlocked: true });
  } catch (error) {
    console.error("[witch-archetype] status failed", error);
    return reportJson({ error: "status_failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return reportJson({ error: "forbidden_origin" }, { status: 403 });
    }
    const userId = reportSessionUser(request);
    if (!userId) return reportJson({ error: "unauthorized" }, { status: 401 });
    const supabase = getSupabaseAdmin();
    const user = await getUser(supabase, userId);
    if (!user) return reportJson({ error: "user_not_found" }, { status: 404 });
    if (user.is_dev_tester !== true && user.unlocked_features?.witchArchetypeReport !== true) {
      return reportJson({ error: "feature_locked" }, { status: 403 });
    }
    const { data: existing, error: existingError } = await supabase.from("witch_archetype_results").select("result").eq("user_id", userId).maybeSingle();
    if (existingError) throw existingError;
    if (isWitchResult(existing?.result)) {
      return reportJson({ result: existing.result, template: await getTemplate(supabase, existing.result.key), unlocked: true });
    }
    const body = await request.json().catch(() => ({}));
    const answers = body?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return reportJson({ error: "invalid_answers" }, { status: 400 });
    }
    const cleanAnswers: Record<string, string> = {};
    for (const question of WITCH_QUESTIONS) {
      const value = answers[question.id];
      if (typeof value !== "string" || !question.options.some((option) => option.id === value)) {
        return reportJson({ error: "invalid_answers", message: "Please answer every question." }, { status: 400 });
      }
      cleanAnswers[question.id] = value;
    }
    const result = scoreWitchAnswers(cleanAnswers);
    const template = await getTemplate(supabase, result.key);
    const { error } = await supabase.from("witch_archetype_results").upsert({
      user_id: userId, answers: cleanAnswers, result, scoring_version: result.version,
      generated_at: result.generatedAt, updated_at: result.generatedAt,
    }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw error;
    // Concurrent submissions return the first saved result, never a second unsaved score.
    const { data: saved, error: savedError } = await supabase.from("witch_archetype_results").select("result").eq("user_id", userId).single();
    if (savedError || !isWitchResult(saved?.result)) throw savedError || new Error("Result was not saved");
    return reportJson({ result: saved.result, template: saved.result.key === result.key ? template : await getTemplate(supabase, saved.result.key), unlocked: true });
  } catch (error) {
    console.error("[witch-archetype] submit failed", error);
    return reportJson({ error: "submit_failed" }, { status: 500 });
  }
}
