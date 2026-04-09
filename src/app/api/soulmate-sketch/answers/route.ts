import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SketchAnswers } from "@/lib/soulmate-sketch";

function resolveUserId(request: NextRequest, body: any): string | null {
  const cookieValue = request.cookies.get("ar_access")?.value?.trim();
  if (cookieValue && cookieValue !== "1") {
    return cookieValue;
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (bodyUserId) return bodyUserId;

  return null;
}

function normalizeAnswers(raw: any): SketchAnswers {
  if (!raw || typeof raw !== "object") return {};
  const result: SketchAnswers = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = resolveUserId(request, body);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const incomingAnswers = normalizeAnswers(body?.answers);
    if (Object.keys(incomingAnswers).length === 0) {
      return NextResponse.json({ success: true, saved: false });
    }

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    // Ensure a lightweight user row exists so FK constraint can be satisfied for anonymous users.
    await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          onboarding_flow: "flow-b",
          updated_at: nowIso,
        },
        { onConflict: "id" }
      );

    const { data: existingRow, error: existingError } = await supabase
      .from("soulmate_sketches")
      .select("question_answers, status, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("[soulmate-sketch/answers] read error", existingError);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    const existingAnswers = normalizeAnswers(existingRow?.question_answers || {});
    const mergedAnswers = { ...existingAnswers, ...incomingAnswers };

    const { data: savedRow, error: saveError } = await supabase
      .from("soulmate_sketches")
      .upsert(
        {
          user_id: userId,
          status: existingRow?.status || "pending",
          question_answers: mergedAnswers,
          created_at: existingRow?.created_at || nowIso,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      )
      .select("question_answers, status, updated_at")
      .maybeSingle();

    if (saveError) {
      console.error("[soulmate-sketch/answers] save error", saveError);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      saved: true,
      question_answers: normalizeAnswers(savedRow?.question_answers || mergedAnswers),
      status: savedRow?.status || existingRow?.status || "pending",
    });
  } catch (error) {
    console.error("[soulmate-sketch/answers] unexpected", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
