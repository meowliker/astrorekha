import { NextRequest, NextResponse } from "next/server";
import {
  AURA_COLORS,
  buildAuraReportTemplate,
  computeAuraResult,
  formatAuraAnswersForStorage,
  getAuraTemplateKey,
  type AuraColor,
  type AuraAnswer,
  type AuraReportResult,
} from "@/lib/aura-color-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function toPublicReportResult(value: unknown): AuraReportResult | null {
  if (!value || typeof value !== "object") return null;
  const { scores: _scores, confidence: _confidence, ...publicResult } = value as Record<string, unknown>;
  const primaryColor = publicResult.primaryColor as AuraColor | undefined;
  const secondaryColor = (publicResult.secondaryColor || null) as AuraColor | null;

  if (primaryColor) {
    return {
      ...buildAuraReportTemplate(primaryColor, secondaryColor),
      ...publicResult,
      auraArchetype: String(publicResult.auraArchetype || AURA_COLORS[primaryColor]?.archetype || ""),
      generatedAt: String(publicResult.generatedAt || new Date().toISOString()),
    };
  }

  return publicResult as unknown as AuraReportResult;
}

async function fetchTemplateReport({
  supabase,
  templateId,
  primaryColor,
  secondaryColor,
  generatedAt,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  templateId: string;
  primaryColor: AuraColor;
  secondaryColor: AuraColor | null;
  generatedAt?: string | null;
}): Promise<AuraReportResult> {
  const { data: templateRow, error: templateError } = await supabase
    .from("aura_color_report_templates")
    .select("report_data, archetype")
    .eq("id", templateId)
    .eq("active", true)
    .maybeSingle();

  if (templateError) {
    console.error("[aura-color/submit] template fetch error", templateError);
  }

  const templateData =
    templateRow?.report_data && typeof templateRow.report_data === "object"
      ? toPublicReportResult(templateRow.report_data)
      : buildAuraReportTemplate(primaryColor, secondaryColor);

  return {
    ...buildAuraReportTemplate(primaryColor, secondaryColor),
    ...(templateData || {}),
    auraArchetype: templateRow?.archetype || templateData?.auraArchetype || AURA_COLORS[primaryColor]?.archetype || "",
    generatedAt: generatedAt || new Date().toISOString(),
  };
}

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = getSessionUserId(request) || String(body?.userId || "").trim();
    const answers = Array.isArray(body?.answers) ? (body.answers as AuraAnswer[]) : [];

    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("unlocked_features")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    if (!user.unlocked_features?.auraColorReport) {
      return NextResponse.json({ error: "feature_locked" }, { status: 403 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("aura_color_reports")
      .select("status, template_id, dominant_color_id, primary_color, secondary_color, result_data, generated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("[aura-color/submit] existing row error", existingError);
      return NextResponse.json({ error: "submit_failed" }, { status: 500 });
    }

    if (existing?.status === "complete") {
      const legacyResult = toPublicReportResult(existing.result_data);
      const primaryColor = (existing.primary_color || legacyResult?.primaryColor || null) as AuraColor | null;
      const secondaryColor = (existing.secondary_color || legacyResult?.secondaryColor || null) as AuraColor | null;
      const templateId =
        existing.template_id || (primaryColor ? getAuraTemplateKey(primaryColor, secondaryColor) : null);
      const result =
        templateId && primaryColor
          ? await fetchTemplateReport({
              supabase,
              templateId,
              primaryColor,
              secondaryColor,
              generatedAt: existing.generated_at,
            })
          : legacyResult;

      return NextResponse.json(
        {
          error: "already_completed",
          template_id: templateId,
          dominant_color_id: existing.dominant_color_id || (primaryColor ? primaryColor.toLowerCase() : null),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          result,
          generated_at: existing.generated_at,
        },
        { status: 409 }
      );
    }

    let scoredResult;
    try {
      scoredResult = computeAuraResult(answers);
    } catch (error: any) {
      return NextResponse.json(
        { error: "invalid_answers", message: error?.message || "Please answer every question." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const templateKey = getAuraTemplateKey(scoredResult.primaryColor, scoredResult.secondaryColor);
    const result = await fetchTemplateReport({
      supabase,
      templateId: templateKey,
      primaryColor: scoredResult.primaryColor,
      secondaryColor: scoredResult.secondaryColor,
      generatedAt: nowIso,
    });

    const { data: saved, error: saveError } = await supabase
      .from("aura_color_reports")
      .upsert(
        {
          user_id: userId,
          status: "complete",
          answers: formatAuraAnswersForStorage(answers),
          scores: scoredResult.scores || {},
          template_id: templateKey,
          dominant_color_id: scoredResult.primaryColor.toLowerCase(),
          primary_color: scoredResult.primaryColor,
          secondary_color: scoredResult.secondaryColor,
          result_data: {},
          generated_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      )
      .select("template_id, dominant_color_id, primary_color, secondary_color, generated_at")
      .maybeSingle();

    if (saveError || !saved) {
      console.error("[aura-color/submit] save error", saveError);
      return NextResponse.json({ error: "submit_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: "complete",
      template_id: saved.template_id,
      dominant_color_id: saved.dominant_color_id,
      primary_color: saved.primary_color,
      secondary_color: saved.secondary_color,
      result,
      generated_at: saved.generated_at,
    });
  } catch (error) {
    console.error("[aura-color/submit] unexpected", error);
    return NextResponse.json({ error: "submit_failed" }, { status: 500 });
  }
}
