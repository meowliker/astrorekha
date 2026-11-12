"use client";
export const INR_COUPON_INTENT_KEY = "astrorekha_inr_coupon_intent";
export type InrCouponIntent = { code: string; type: "bundle" | "report" | "upsell"; productId: string };
export async function beginInrCouponCheckout(intent: InrCouponIntent) {
  const response = await fetch("/api/coupons/quote", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Unable to apply this coupon.");
  sessionStorage.setItem(INR_COUPON_INTENT_KEY, JSON.stringify(intent));
  // The code stays out of URLs, analytics page locations and referrers.
  window.location.assign("/coupon-checkout");
}
