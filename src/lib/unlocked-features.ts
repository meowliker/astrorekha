export interface NormalizedUnlockedFeatures {
  palmReading: boolean;
  prediction2026: boolean;
  birthChart: boolean;
  compatibilityTest: boolean;
  soulmateSketch: boolean;
  futurePartnerReport: boolean;
}

const DEFAULT_UNLOCKED_FEATURES: NormalizedUnlockedFeatures = {
  palmReading: false,
  prediction2026: false,
  birthChart: false,
  compatibilityTest: false,
  soulmateSketch: false,
  futurePartnerReport: false,
};

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

export function normalizeUnlockedFeatures(raw: unknown): NormalizedUnlockedFeatures {
  if (!raw) return { ...DEFAULT_UNLOCKED_FEATURES };

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_UNLOCKED_FEATURES };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_UNLOCKED_FEATURES };
  }

  const source = parsed as Record<string, unknown>;

  return {
    palmReading: toBoolean(source.palmReading),
    prediction2026: toBoolean(source.prediction2026),
    birthChart: toBoolean(source.birthChart),
    compatibilityTest: toBoolean(source.compatibilityTest),
    soulmateSketch: toBoolean(source.soulmateSketch),
    futurePartnerReport: toBoolean(source.futurePartnerReport),
  };
}
