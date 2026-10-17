import { NextRequest, NextResponse } from "next/server";
import { getSoulmateOrder, reconcileSoulmateOrder, verifyStripeSignature } from "@/lib/us-soulmate-stripe";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 1000000) return new NextResponse(null, { status: 413 });
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature") || "", process.env.US_SOULMATE_STRIPE_WEBHOOK_SECRET || "")) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  try {
    const event = JSON.parse(raw);
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return NextResponse.json({ received: true });
    const session = event.data?.object;
    if (session?.metadata?.funnel !== "us_soulmate_standalone") return NextResponse.json({ received: true });
    const order = await getSoulmateOrder(session.metadata.order_id);
    if (!order || order.stripe_session_id !== session.id) throw new Error("Order/session not ready");
    await reconcileSoulmateOrder(order);
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: "US payment verification will retry" }, { status: 503 }); }
}
