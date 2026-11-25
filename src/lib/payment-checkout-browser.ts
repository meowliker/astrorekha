import { openShiprocketCheckout, type ShiprocketBrowserCheckout } from "./shiprocket-checkout-browser";
import { pineLabsCheckoutUrl } from "./pinelabs-checkout-url";
/** Hosted backup checkout; preserves the existing recovery state saved by each caller. */
export function openPaytmCheckout(data: { gateway?: string; action?: string; fields?: Record<string, string>; shiprocket?: ShiprocketBrowserCheckout }): boolean | Promise<boolean> {
  if (data.gateway === "shiprocket") {
    const url = new URL(data.action || "", window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/api/shiprocket/checkout" || url.username || url.password || !url.searchParams.get("state")) throw new Error("Invalid checkout destination");
    if (data.shiprocket) return openShiprocketCheckout(data.shiprocket).then(() => true);
    window.location.assign(url.toString()); // Previously created checkout links remain recoverable.
    return true;
  }
  if (data.gateway === "pinelabs") { window.location.assign(pineLabsCheckoutUrl(data.action || "")); return true; }
  if (data.gateway !== "paytm" && data.gateway !== "airpay") return false;
  const url = new URL(data.action || "");
  if (data.gateway === "airpay") {
    if (url.origin !== "https://payments.airpay.co.in" || url.pathname !== "/pay/v4/" || url.username || url.password || !url.searchParams.get("token") || !data.fields?.encdata || !data.fields?.privatekey || !data.fields?.checksum || !data.fields?.merchant_id) throw new Error("Invalid checkout destination");
  } else if (!["https://secure.paytmpayments.com", "https://securestage.paytmpayments.com"].includes(url.origin) || url.pathname !== "/theia/api/v1/showPaymentPage" || !data.fields?.txnToken) throw new Error("Invalid checkout destination");
  const form = document.createElement("form");
  form.method = "POST"; form.action = url.toString();
  for (const [name, value] of Object.entries(data.fields)) {
    const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.appendChild(input);
  }
  document.body.appendChild(form); form.submit();
  return true;
}
