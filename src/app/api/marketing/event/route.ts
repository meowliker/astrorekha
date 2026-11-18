import { NextRequest, NextResponse } from "next/server";
import { recordMarketingEvent } from "@/lib/marketing-events";
import { captureCheckoutAdTouch } from "@/lib/checkout-attribution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body?.eventName || typeof body.eventName !== "string") {
      return NextResponse.json({ success: false, error: "eventName is required" }, { status: 400 });
    }

    // A signed checkout cookie (not body.userId/paymentId) binds late ad clicks to an existing order.
    // Failure is isolated from normal analytics and checkout.
    if (body.eventName === "page_view") {
      try { await captureCheckoutAdTouch(request, body.url); }
      catch { console.warn("[checkout-attribution] Unable to save checkout ad touch"); }
    }
    const success = await recordMarketingEvent({
      eventName: body.eventName,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      userId: body.userId,
      email: body.email,
      route: body.route,
      path: body.path,
      url: body.url,
      referrerUrl: body.referrerUrl,
      productType: body.productType,
      productId: body.productId,
      productName: body.productName,
      paymentId: body.paymentId,
      payuTxnId: body.payuTxnId,
      amount: body.amount,
      currency: body.currency,
      metadata: body.metadata,
      attribution: body.attribution,
    });

    return NextResponse.json({ success });
  } catch (error) {
    console.error("[marketing/event] failed", error);
    return NextResponse.json({ success: false, error: "Failed to track marketing event" }, { status: 200 });
  }
}
