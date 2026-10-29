/** Only provider-owned HTTPS checkout pages may receive a browser redirect. */
export function pineLabsCheckoutUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["api.pluralpay.in", "api.pluralonline.com", "api.pinelabsonline.com", "pluraluat.v2.pinepg.in", "checkout.pinelabsonline.com", "checkout-staging.pinelabsonline.com"].includes(url.hostname)) {
    throw new Error("Invalid Pine Labs checkout destination");
  }
  return url.toString();
}
