import { bundleCheckoutRetryPath, GOOGLE_ADS_PAYWALL } from "./google-ads-funnel";

const KEY = "astrorekha_discover_bundle_checkout";
const MAX_AGE = 24 * 60 * 60 * 1000;

/** A failed popup may clear pending state before the processing screen mounts. */
export function rememberDiscoverBundleCheckout(txnid: string) {
  if (typeof window === "undefined" || window.location.pathname !== GOOGLE_ADS_PAYWALL) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ txnid, checkoutPath: GOOGLE_ADS_PAYWALL, createdAt: Date.now() }));
  } catch { /* Optional retry presentation must never block a payment. */ }
}

/** This selects presentation only; it cannot verify a payment or grant access. */
export function discoverBundleRetryPath(txnid: string, pending: { txnid: string; checkoutPath?: string } | null): string {
  if (pending?.txnid === txnid && pending.checkoutPath === GOOGLE_ADS_PAYWALL) return GOOGLE_ADS_PAYWALL;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    const age = Date.now() - saved?.createdAt;
    if (saved?.txnid === txnid && Number.isFinite(age) && age >= 0 && age <= MAX_AGE) {
      return bundleCheckoutRetryPath(saved.checkoutPath);
    }
  } catch { /* Missing or corrupt context retains the original checkout destination. */ }
  return bundleCheckoutRetryPath(undefined);
}
