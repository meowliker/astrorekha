import { toPartnerDisplayName } from "@/lib/future-partner-format";

export interface FuturePartnerReportData {
  partnerName: string;
  marriageYear: string;
  partnerAgeAtMarriage: string;
  relationshipTheme: string;
  compatibilityScore: number;
  compatibilitySummary: string;
  marriageOutlook: string;
  strengths: string[];
  growthAreas: string[];
  guidance: string;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

export function normalizeFuturePartnerReportData(value: unknown): FuturePartnerReportData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const partnerName = normalizeText(raw.partnerName);
  const strengths = normalizeTextList(raw.strengths);
  const growthAreas = normalizeTextList(raw.growthAreas);
  const scoreRaw = Number(raw.compatibilityScore);

  const report: FuturePartnerReportData = {
    partnerName: toPartnerDisplayName(partnerName),
    marriageYear: normalizeText(raw.marriageYear),
    partnerAgeAtMarriage: normalizeText(raw.partnerAgeAtMarriage),
    relationshipTheme: normalizeText(raw.relationshipTheme),
    compatibilityScore: Number.isFinite(scoreRaw)
      ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
      : NaN,
    compatibilitySummary: normalizeText(raw.compatibilitySummary),
    marriageOutlook: normalizeText(raw.marriageOutlook),
    strengths,
    growthAreas,
    guidance: normalizeText(raw.guidance),
  };

  if (
    !partnerName ||
    !report.marriageYear ||
    !report.partnerAgeAtMarriage ||
    !report.relationshipTheme ||
    !Number.isFinite(report.compatibilityScore) ||
    !report.compatibilitySummary ||
    !report.marriageOutlook ||
    report.strengths.length === 0 ||
    report.growthAreas.length === 0 ||
    !report.guidance
  ) {
    return null;
  }

  return report;
}

export function isFuturePartnerReportData(value: unknown): value is FuturePartnerReportData {
  return normalizeFuturePartnerReportData(value) !== null;
}
