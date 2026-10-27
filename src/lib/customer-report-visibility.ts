import type { NormalizedUnlockedFeatures } from "@/lib/unlocked-features";

// Temporary customer merchandising pause. Keep the pricing catalog and admin data intact.
const HIDDEN_UNPURCHASED_REPORTS = new Set<string>([
  "pastLifeReport",
  "futurePartnerReport",
  "prediction2026",
  "vastuShastraGuide",
]);

export function isReportAvailableForPurchase(feature: string): boolean {
  return !HIDDEN_UNPURCHASED_REPORTS.has(feature);
}

export function isCustomerReportVisible(
  feature: keyof NormalizedUnlockedFeatures,
  unlockedFeatures: Partial<NormalizedUnlockedFeatures>,
): boolean {
  return unlockedFeatures[feature] === true || isReportAvailableForPurchase(feature);
}
