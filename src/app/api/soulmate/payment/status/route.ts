export const maxDuration = 60;
import { deliveryPlans } from "@/app/soulmate/chat-data";
import { NextRequest, NextResponse } from "next/server";
import { getSoulmateOrder, reconcileSoulmateOrder, validReceiptToken } from "@/lib/soulmate-payu";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("order") || "";
  const token = request.cookies.get(`sm_receipt_${id}`)?.value || "";
  try {
    if (!validReceiptToken(id, token)) return NextResponse.json({ error: "Invalid order link" }, { status: 403 });
    let order = await getSoulmateOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.payment_status !== "paid" && (!order.last_verified_at || Date.now() - Date.parse(order.last_verified_at) >= 10000)) {
      order = await reconcileSoulmateOrder(order);
    }
    // Use the delivery promise captured for the purchased basket.
    const displayHours = order.entitlements?.promised_hours || deliveryPlans.find((plan) => plan.id === order.plan)!.displayHours;
    const trackingAllowed = order.payment_mode === "live" && order.attribution?.trackingEnvironment === "production";
    return NextResponse.json({
      trackingAllowed,
      // Never expose contact data for an unpaid/test order or without its private receipt cookie.
      ...(order.payment_status === "paid" && trackingAllowed ? { adsPurchase: {
        transactionId: order.id, amountPaise: order.amount, currency: "INR", email: order.customer_email,
      } } : {}),
      items: order.line_items || [], entitlements: order.entitlements || null,
      status: order.payment_status, plan: order.plan, amount: order.amount,
      deliveryHours: displayHours, deliveryDueAt: order.paid_at ? new Date(Date.parse(order.paid_at) + displayHours * 3600000).toISOString() : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment confirmation is temporarily unavailable. Please check again; do not pay again yet." }, { status: 503 });
  }
}
