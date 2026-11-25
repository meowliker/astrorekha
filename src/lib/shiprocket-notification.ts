import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { shiprocketConfig, shiprocketOrigin, readShiprocketState } from "./shiprocket-checkout-api";
import { shiprocketSession } from "./shiprocket-checkout";
import { reconcileShiprocketOrder } from "./shiprocket-reconciliation";
import { getSupabaseAdmin } from "./supabase-admin";
import { receiptCookie, receiptPath } from "./soulmate-payu";
export async function shiprocketCallback(request: NextRequest) {
  try {
    const states = request.nextUrl.searchParams.getAll("state"), ids = request.nextUrl.searchParams.getAll("oid");
    const id = states.length === 1 ? readShiprocketState(states[0]) : null;
    if (!id || ids.length !== 1) return NextResponse.json({ error: "Invalid checkout return" }, { status: 400 });
    const session = await shiprocketSession(id);
    if (!session || session.provider_order_id !== ids[0]) return NextResponse.json({ error: "Checkout reference mismatch" }, { status: 400 });
    // ost is deliberately ignored. Only authenticated order details can confirm payment.
    try { await reconcileShiprocketOrder(id); } catch { console.warn("[fastrr] Return awaits verification", { orderId: id }); }
    const response = NextResponse.redirect(new URL(id.startsWith("sm_") ? receiptPath(id) : `/payment/processing?txnid=${id}`, shiprocketOrigin()), 303);
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    if (id.startsWith("sm_")) response.cookies.set(receiptCookie(id));
    return response;
  } catch { return NextResponse.json({ error: "Payment verification unavailable. Please check this order before paying again." }, { status: 503 }); }
}
export function validShiprocketWebhookAuthorization(header: string | null) {
  const secret = process.env.SHIPROCKET_CHECKOUT_WEBHOOK_SECRET || "";
  if (secret.length < 32) return false;
  const expected = `Bearer ${secret}`, actual = header || "";
  return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
export async function shiprocketWebhook(request: NextRequest) {
  if (!validShiprocketWebhookAuthorization(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 200000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const body = JSON.parse(raw), providerId = body?.order_id;
    if (typeof providerId !== "string" || !/^[a-f0-9]{24}$/.test(providerId)) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
    const found = await getSupabaseAdmin({ fresh: true }).from("shiprocket_checkout_sessions").select("order_id").eq("provider_order_id", providerId).eq("payment_mode", shiprocketConfig().mode).maybeSingle();
    if (found.error) throw new Error("Unable to read order");
    if (!found.data) return NextResponse.json({ ignored: true });
    // No customer data, amount or status from a webhook is trusted. Saved pending orders
    // remain the durable recovery queue if a webhook never arrives or verification fails.
    await reconcileShiprocketOrder(found.data.order_id);
    return NextResponse.json({ accepted: true });
  } catch { return NextResponse.json({ error: "Verification unavailable; retry required" }, { status: 503 }); }
}
