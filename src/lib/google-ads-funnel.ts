export const GOOGLE_ADS_ENTRY = "/discover";
export const GOOGLE_ADS_ONBOARDING = `${GOOGLE_ADS_ENTRY}/onboarding`;
export const GOOGLE_ADS_PAYWALL = `${GOOGLE_ADS_ONBOARDING}/bundle-pricing`;

// Questions and paywall have scoped URLs. Payment and everything after it remain shared.
export const GOOGLE_ADS_STEPS = [
  "", "birthday", "birth-time", "birthplace", "step-5", "step-6", "step-7",
  "step-8", "step-9", "step-10", "step-11", "step-12", "step-13", "step-14", "step-15",
] as const;
export type GoogleAdsStep = typeof GOOGLE_ADS_STEPS[number];

export function googleAdsStep(segments: string[] = []): GoogleAdsStep | null {
  if (segments.length > 1) return null;
  const step = segments[0] || "";
  return GOOGLE_ADS_STEPS.includes(step as GoogleAdsStep) ? step as GoogleAdsStep : null;
}

export function onboardingDestination(href: string, googleAds: boolean): string {
  if (!googleAds) return href;
  const [path] = href.split(/[?#]/);
  const step = path === "/onboarding" ? "" : path.startsWith("/onboarding/") ? path.slice("/onboarding/".length) : null;
  if (step === null || (step !== "bundle-pricing" && !GOOGLE_ADS_STEPS.includes(step as GoogleAdsStep))) return href;
  return GOOGLE_ADS_ONBOARDING + href.slice("/onboarding".length);
}

/** Only an exact known paywall may be used for a failed payment's checkout link. */
export function bundleCheckoutRetryPath(value: unknown): string {
  return value === GOOGLE_ADS_PAYWALL ? GOOGLE_ADS_PAYWALL : "/onboarding/bundle-pricing";
}

export function isGoogleAdsFunnelPath(path: string): boolean {
  return path === GOOGLE_ADS_ENTRY || path === GOOGLE_ADS_ONBOARDING || path.startsWith(`${GOOGLE_ADS_ONBOARDING}/`);
}
