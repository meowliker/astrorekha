import { NextRequest, NextResponse } from "next/server";
import { CouponError, couponSameOrigin, quoteInrCoupon } from "@/lib/inr-coupons";

export async function POST(request: NextRequest) {
  if (!couponSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { quote } = await quoteInrCoupon(await request.json());
    return NextResponse.json({ success: true, name: quote.productName, originalAmount: quote.amount,
      amount: 0, currency: "INR", coins: quote.coins }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CouponError ? error.message : "Could not check this coupon." },
      { status: error instanceof CouponError ? error.status : 503 });
  }
}
