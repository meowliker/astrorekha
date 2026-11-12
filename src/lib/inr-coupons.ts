import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizePricing } from "@/lib/pricing";
import { quotePaymentOrder } from "@/lib/payment-quote";

export class CouponError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function couponSameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return origin.host === request.headers.get("host") &&
      (origin.protocol === "https:" || (process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)));
  } catch { return false; }
}

/** Always resolve entitlements and original value from the server catalogue. */
export async function quoteInrCoupon(input: Record<string, unknown>) {
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  if (!code || code.length > 80) throw new CouponError("Please enter a valid coupon code.");
  if (!["bundle", "report", "upsell"].includes(String(input.type)))
    throw new CouponError("This coupon is for INR bundles and individual reports only.");
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!productId || productId.length > 500) throw new CouponError("Please select a report or bundle.");
  const db = getSupabaseAdmin({ fresh: true });
  const hash = createHash("sha256").update(code).digest("hex");
  const coupon = await db.from("inr_free_coupons").select("id,enabled").eq("code_hash", hash).maybeSingle();
  if (coupon.error) throw new CouponError("Coupons are temporarily unavailable. Please try again later.", 503);
  if (!coupon.data?.enabled) throw new CouponError("This coupon is invalid or no longer active.");
  const pricing = await db.from("settings").select("value").eq("key", "pricing").maybeSingle();
  if (pricing.error) throw new CouponError("Prices could not be loaded. Please try again.", 503);
  let quote;
  try {
    const catalogue = normalizePricing(pricing.data?.value);
    // The normal B paywall also offers Cosmic Bundle even though it is hidden in A.
    const couponCatalogue = { ...catalogue, bundles: catalogue.bundles.map(plan =>
      plan.id === "palm-birth-sketch-aura-astro" ? { ...plan, active: true } : plan) };
    quote = quotePaymentOrder(couponCatalogue, {
      type: String(input.type), bundleId: productId, packageId: productId,
    });
  } catch { throw new CouponError("This report or bundle is not currently available."); }
  return { couponId: coupon.data.id as string, hash, quote };
}
