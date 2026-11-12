import { NextRequest, NextResponse } from "next/server";
import { reportSessionUser } from "@/lib/report-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { customerMarket } from "@/lib/customer-market";
import { CouponError, couponSameOrigin, quoteInrCoupon } from "@/lib/inr-coupons";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const id = reportSessionUser(request);
  if (!id) return NextResponse.json({ account: null }, { headers });
  const { data, error } = await getSupabaseAdmin({ fresh: true }).from("users").select("id,email").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load your account." }, { status: 503, headers });
  return NextResponse.json({ account: data }, { headers });
}

export async function POST(request: NextRequest) {
  if (!couponSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  const userId = reportSessionUser(request);
  if (!userId) return NextResponse.json({ error: "Please sign in or create an account to use your coupon." }, { status: 401, headers });
  try {
    if (await customerMarket(userId) !== "IN") throw new CouponError("This coupon is only available for INR accounts.");
    const { couponId, hash, quote } = await quoteInrCoupon(await request.json());
    const { data, error } = await getSupabaseAdmin({ fresh: true }).rpc("redeem_inr_free_coupon", {
      p_coupon: couponId, p_hash: hash, p_user: userId, p_type: quote.type,
      p_product: [...quote.productIds].sort().join(","), p_name: quote.productName,
      p_original: quote.amount, p_features: quote.features, p_coins: quote.coins,
    });
    if (error || !data) throw new CouponError("Unable to finish the unlock. Please try again; your coupon will not be used twice.", 503);
    // A complimentary grant is never a paid payment, invoice, or advertising Purchase event.
    const response = NextResponse.json({ success: true, ...data }, { headers });
    response.cookies.set("ar_access", "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof CouponError ? error.message : "Coupons are temporarily unavailable." },
      { status: error instanceof CouponError ? error.status : 503, headers });
  }
}
