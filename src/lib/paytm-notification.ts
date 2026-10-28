import { isPaytmOrderId } from "./paytm-order-id";
import { NextRequest, NextResponse } from "next/server";
import { verifyPaytmNotification } from "./paytm-api";
import { reconcilePaytmOrder } from "./paytm-reconciliation";
import { receiptCookie, receiptPath } from "./soulmate-payu";
import { paytmCallbackOrigin, paytmPreviewOrderId } from "./paytm-preview";
export async function paytmNotification(request: NextRequest, webhook: boolean) {
  let id = "";
  let verified = false;
  try {
    const fields: Record<string, string> = {};
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      for (const [key, value] of Object.entries(body)) if (typeof value === "string") fields[key] = value;
    } else {
      (await request.formData()).forEach((value, key) => { if (typeof value === "string") fields[key] = value; });
    }
    id = fields.ORDERID || "";
    if (!isPaytmOrderId(id)) throw new Error("Invalid reference");
    verified = verifyPaytmNotification(fields);
    if (id === paytmPreviewOrderId()) console.info("[paytm-preview] Notification received", { orderId: id, webhook, verified, status: fields.STATUS, code: fields.RESPCODE });
    if (!verified) throw new Error("Invalid notification signature");
    // Never grant access from a browser status field. Check the signed Status API.
    await reconcilePaytmOrder(id);
    if (webhook) return NextResponse.json({ success: true });
  } catch {
    if (webhook) return NextResponse.json({ error: "Payment notification could not be verified; retry required" }, { status: verified ? 503 : 400 });
  }
  if (!isPaytmOrderId(id)) return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
  const origin = paytmCallbackOrigin();
  const response = NextResponse.redirect(new URL(id.startsWith("sm_") ? receiptPath(id) : `/payment/processing?txnid=${encodeURIComponent(id)}`, origin), 303);
  // An unsigned browser return must not mint access to an arbitrary receipt.
  if (verified && id.startsWith("sm_")) response.cookies.set(receiptCookie(id));
  return response;
}
