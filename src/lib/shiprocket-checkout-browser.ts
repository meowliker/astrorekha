/** Only the scoped checkout token is public; API credentials never reach the browser. */
export type ShiprocketBrowserCheckout = { token: string; ui: string; recoveryPath: string };
type SDK = { addToCart(event: Event, token: string, options: { fallbackUrl: string; isInitiatedFromApp: boolean }, callback?: (event: { event?: string }) => void): void };
const SDK_ORIGINS = ["https://checkout-ui.shiprocket.com", "https://customcheckoutfastrr.netlify.app"];
let loading: Promise<SDK> | undefined;
let loadedOrigin: string | undefined;
let opening: Promise<void> | undefined;

function loadSDK(ui: string): Promise<SDK> {
  if (loading && loadedOrigin === ui) return loading;
  loadedOrigin = ui;
  loading = new Promise<SDK>((resolve, reject) => {
    const style = document.createElement("link");
    style.rel = "stylesheet"; style.href = `${ui}/assets/styles/shopify.css`;
    const script = document.createElement("script");
    script.src = `${ui}/assets/js/channels/shopify.js`; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); style.remove(); loading = undefined; reject(new Error("Checkout could not load. Please check your payment status before retrying.")); };
    const timer = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      const sdk = (window as Window & { HeadlessCheckout?: SDK }).HeadlessCheckout;
      if (!sdk?.addToCart) { fail(); return; }
      clearTimeout(timer); resolve(sdk);
    };
    document.head.appendChild(style); document.head.appendChild(script);
  });
  return loading;
}

export async function openShiprocketCheckout(checkout: ShiprocketBrowserCheckout): Promise<void> {
  if (!SDK_ORIGINS.includes(checkout.ui) || !/^[A-Za-z0-9_-]{16,512}$/.test(checkout.token) ||
    !/^\/(?:payment\/processing\?txnid=src[a-f0-9]{24}|soulmate\/payment\?order=sm_[a-f0-9]{20})$/.test(checkout.recoveryPath)) {
    throw new Error("Invalid checkout destination");
  }
  // Double clicks must never mount multiple payment windows.
  if (opening) return opening;
  opening = (async () => {
    const sdk = await loadSDK(checkout.ui);
    const recoveryUrl = window.location.origin + checkout.recoveryPath;
    sdk.addToCart(new Event("click"), checkout.token, { fallbackUrl: recoveryUrl, isInitiatedFromApp: true }, event => {
      if (event.event === "sr-headless-close") window.location.assign(recoveryUrl);
    });
  })();
  try { await opening; } catch (error) { opening = undefined; throw error; }
}
