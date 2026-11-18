import { GOOGLE_ADS_STEPS, googleAdsStep } from '@/lib/google-ads-funnel';
export { GOOGLE_ADS_STEPS, googleAdsStep };
export const GOOGLE_ADS_ENTRY = '/us/discover';
export const GOOGLE_ADS_ONBOARDING = '/us/discover/onboarding';
export const GOOGLE_ADS_PAYWALL = '/us/discover/onboarding/bundle-pricing';
export function isUSMainGooglePath(path: string): boolean {
  return path === GOOGLE_ADS_ENTRY || path === GOOGLE_ADS_ONBOARDING || path.startsWith(`${GOOGLE_ADS_ONBOARDING}/`);
}
export function isUSMainPath(path: string): boolean {
  return path === '/us' || path === '/us/payment' || path === '/us/onboarding' || path.startsWith('/us/onboarding/') || isUSMainGooglePath(path);
}
export function onboardingDestination(href: string, googleAds: boolean): string {
  if (!googleAds) return href;
  const [path] = href.split(/[?#]/);
  if (path === '/us') return GOOGLE_ADS_ENTRY + href.slice(3);
  const step = path === '/us/onboarding' ? '' : path.startsWith('/us/onboarding/') ? path.slice('/us/onboarding/'.length) : null;
  if (step === null || (step !== 'bundle-pricing' && googleAdsStep([step]) === null)) return href;
  return GOOGLE_ADS_ONBOARDING + href.slice('/us/onboarding'.length);
}
/** Shared post-payment screens retain the entry journey within this browser tab. */
export function isUSGoogleJourney(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  if (isUSMainGooglePath(path)) {
    try { window.sessionStorage.setItem('ar_us_main_journey', 'google'); } catch { /* Storage is optional. */ }
    return true;
  }
  const prepayment = path === '/us' || path === '/us/onboarding' || (path.startsWith('/us/onboarding/') && googleAdsStep([path.slice('/us/onboarding/'.length)]) !== null) || path === '/us/onboarding/bundle-pricing';
  if (prepayment) {
    try { window.sessionStorage.setItem('ar_us_main_journey', 'normal'); } catch { /* Storage is optional. */ }
    return false;
  }
  try { return window.sessionStorage.getItem('ar_us_main_journey') === 'google'; } catch { return false; }
}
export function usBundleRetryPath(marketing: { landing_path?: unknown; landing_url?: unknown } | undefined): string {
  try {
    const url = new URL(String(marketing?.landing_path || marketing?.landing_url || ''), 'https://astrorekha.com');
    if (['astrorekha.com', 'www.astrorekha.com', 'localhost', '127.0.0.1'].includes(url.hostname) && isUSMainGooglePath(url.pathname)) return GOOGLE_ADS_PAYWALL;
  } catch { /* Untrusted or missing URLs use the default checkout. */ }
  return '/us/onboarding/bundle-pricing';
}
