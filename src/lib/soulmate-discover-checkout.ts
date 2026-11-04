const RETURN_KEY = "ar_discover_checkout_return_v1:";
const entries = ["/soulmate/discover", "/us/soulmate/discover"] as const;

/** Preserve presentation on a failed-payment retry; never choose a gateway or trust a payment status. */
export function rememberDiscoverCheckout(receiptUrl: unknown) {
  if (typeof window === "undefined" || typeof receiptUrl !== "string") return;
  const entry = entries.find(path => window.location.pathname === `${path}/checkout`);
  if (!entry) return;
  const us = entry.startsWith("/us/");
  const pattern = us ? /^\/us\/soulmate\/payment\?order=(us_sm_[a-f0-9]{20})$/ : /^\/soulmate\/payment\?order=(sm_[a-f0-9]{20})$/;
  const order = receiptUrl.match(pattern)?.[1];
  if (!order) return;
  try { sessionStorage.setItem(RETURN_KEY + order, JSON.stringify({ entry, at: Date.now() })); } catch { /* Existing canonical retry remains available. */ }
}

export function discoverRetryPath(orderId: string | undefined, fallback: string): string {
  if (!orderId || !/^(?:us_)?sm_[a-f0-9]{20}$/.test(orderId)) return fallback;
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY + orderId) || "null");
    const expected = orderId.startsWith("us_") ? entries[1] : entries[0];
    if (saved?.entry === expected && Number.isFinite(saved.at) && saved.at <= Date.now() && saved.at > Date.now() - 24 * 3600000) return `${expected}?checkout=retry`;
  } catch { /* Receipt access and retry do not depend on browser storage. */ }
  return fallback;
}
