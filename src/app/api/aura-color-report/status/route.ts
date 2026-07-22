import { NextRequest, NextResponse } from "next/server";
import {
  AURA_COLORS,
  buildAuraReportTemplate,
  getAuraTemplateKey,
  type AuraColor,
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
  row,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  row: Record<string, any>;
}): Promise<AuraReportResult | null> {
  const legacyResult = toPublicReportResult(row.result_data);
  const primaryColor = (row.primary_color || legacyResult?.primaryColor || null) as AuraColor | null;
  const secondaryColor = (row.secondary_color || legacyResult?.secondaryColor || null) as AuraColor | null;
  const templateId = row.template_id || (primaryColor ? getAuraTemplateKey(primaryColor, secondaryColor) : null);

  if (!templateId || !primaryColor) {
    return legacyResult;
  }

  const { data: templateRow, error: templateError } = await supabase
    .from("aura_color_report_templates")
    .select("report_data, archetype")
    .eq("id", templateId)
    .eq("active", true)
    .maybeSingle();

  if (templateError) {
    console.error("[aura-color/status] template fetch error", templateError);
  }

  const templateData =
    templateRow?.report_data && typeof templateRow.report_data === "object"
      ? toPublicReportResult(templateRow.report_data)
      : buildAuraReportTemplate(primaryColor, secondaryColor);

  if (!templateData) return null;

  return {
    ...templateData,
    auraArchetype: templateRow?.archetype || templateData.auraArchetype || AURA_COLORS[primaryColor]?.archetype || "",
    generatedAt: row.generated_at || legacyResult?.generatedAt || new Date().toISOString(),
  };
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
  try {
    const userId = getSessionUserId(request);
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

    const { data, error } = await supabase
      .from("aura_color_reports")
      .select(
        "status, answers, scores, template_id, dominant_color_id, primary_color, secondary_color, result_data, generated_at, updated_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[aura-color/status] error", error);
      return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ status: "not_started" });
    }

    const result = await fetchTemplateReport({ supabase, row: data });

    return NextResponse.json({
      status: data.status,
      answers: data.answers || [],
      template_id: data.template_id || null,
      dominant_color_id: data.dominant_color_id || null,
      primary_color: data.primary_color || null,
      secondary_color: data.secondary_color || null,
      result,
      generated_at: data.generated_at || null,
      updated_at: data.updated_at || null,
    });
  } catch (error) {
    console.error("[aura-color/status] unexpected", error);
    return NextResponse.json({ error: "status_fetch_failed" }, { status: 500 });
  }
}
