import { NextRequest, NextResponse } from "next/server";
import {
  buildSpiritAnimalReport,
  computeSpiritAnimalResult,
  formatSpiritAnswersForStorage,
  hasSpiritAnimalTraitPercentages,
  hydrateSpiritAnimalReport,
  isSpiritAnimalKey,
  spiritTraitPercentagesFromScores,
  SPIRIT_ANIMAL_REPORT_TEMPLATES,
  type SpiritAnimalAnswer,
  type SpiritAnimalKey,
} from "@/lib/spirit-animal-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getSessionUserId(request: NextRequest, bodyUserId?: unknown): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) return accessCookie.trim();
  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;
  const fallback = String(bodyUserId || "").trim();
  return fallback || null;
}

async function fetchReportTemplate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  animalKey: SpiritAnimalKey
) {
  const fallback = SPIRIT_ANIMAL_REPORT_TEMPLATES[animalKey];
  const { data, error } = await supabase
    .from("spirit_animal_report_templates")
    .select("report_data")
    .eq("animal_key", animalKey)
    .eq("active", true)
    .maybeSingle();

  if (error) console.error("[spirit-animal/submit] template fetch error", error);
  return data?.report_data && typeof data.report_data === "object"
    ? { ...fallback, ...data.report_data }
    : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = getSessionUserId(request, body?.userId);
    const answers = Array.isArray(body?.answers) ? (body.answers as SpiritAnimalAnswer[]) : [];

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

    const { data: existing, error: existingError } = await supabase
      .from("spirit_animal_reports")
      .select("id, animal_key, report_snapshot, trait_scores, generated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("[spirit-animal/submit] existing result error", existingError);
      return NextResponse.json({ error: "submit_failed" }, { status: 500 });
    }

    if (existing) {
      if (!isSpiritAnimalKey(existing.animal_key)) {
        return NextResponse.json({ error: "invalid_animal_result" }, { status: 500 });
      }
      if (hasSpiritAnimalTraitPercentages(existing.report_snapshot?.traitPercentages)
        || spiritTraitPercentagesFromScores(existing.trait_scores)) {
        return NextResponse.json(
          {
            error: "already_completed",
            status: "complete",
            animal_key: existing.animal_key,
            result: hydrateSpiritAnimalReport(existing.animal_key, existing.report_snapshot, existing.generated_at, existing.trait_scores),
            generated_at: existing.generated_at,
          },
          { status: 409 }
        );
      }
    }

    let scored;
    try {
      scored = computeSpiritAnimalResult(answers);
    } catch (error: unknown) {
      return NextResponse.json(
        { error: "invalid_answers", message: error instanceof Error ? error.message : "Please answer every question." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const template = await fetchReportTemplate(supabase, scored.animalKey);
    const reportSnapshot = {
      ...buildSpiritAnimalReport(scored.animalKey, nowIso, scored),
      ...template,
      topTraits: scored.topTraits,
      traitPercentages: scored.traitPercentages,
      generatedAt: nowIso,
    };

    const reportRecord = {
        animal_key: scored.animalKey,
        status: "complete",
        answers: formatSpiritAnswersForStorage(answers),
        trait_scores: scored.traitScores,
        animal_scores: scored.animalScores,
        report_snapshot: reportSnapshot,
        scoring_version: scored.scoringVersion,
        generated_at: nowIso,
        updated_at: nowIso,
    };
    const { data: saved, error: saveError } = existing
      ? await supabase.from("spirit_animal_reports")
          .update(reportRecord)
          .eq("id", existing.id)
          .eq("user_id", userId)
          .select("animal_key, report_snapshot, generated_at")
          .single()
      : await supabase.from("spirit_animal_reports")
          .insert({ user_id: userId, ...reportRecord })
          .select("animal_key, report_snapshot, generated_at")
          .single();

    if (saveError || !saved) {
      // A simultaneous submission may have won the unique(user_id) race.
      const { data: winner } = await supabase
        .from("spirit_animal_reports")
        .select("animal_key, report_snapshot, trait_scores, generated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (winner && (hasSpiritAnimalTraitPercentages(winner.report_snapshot?.traitPercentages)
        || spiritTraitPercentagesFromScores(winner.trait_scores))) {
        if (!isSpiritAnimalKey(winner.animal_key)) {
          return NextResponse.json({ error: "invalid_animal_result" }, { status: 500 });
        }
        return NextResponse.json(
          { error: "already_completed", status: "complete", animal_key: winner.animal_key, result: hydrateSpiritAnimalReport(winner.animal_key, winner.report_snapshot, winner.generated_at, winner.trait_scores), generated_at: winner.generated_at },
          { status: 409 }
        );
      }
      console.error("[spirit-animal/submit] save error", saveError);
      return NextResponse.json({ error: "submit_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: "complete",
      animal_key: saved.animal_key,
      result: saved.report_snapshot,
      generated_at: saved.generated_at,
    });
  } catch (error) {
    console.error("[spirit-animal/submit] unexpected", error);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }
}
