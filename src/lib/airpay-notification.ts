import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { airpayConfig, airpayDecrypt, airpayOrigin, isAirpayReference, readAirpayReturnToken, validAirpayNotification, type AirpayData } from "./airpay-api";
import { reconcileAirpayOrder } from "./airpay-reconciliation";
import { getSupabaseAdmin } from "./supabase-admin";
import { receiptCookie, receiptPath } from "./soulmate-payu";

async function readFields(request: NextRequest): Promise<AirpayData> {
  const raw = await request.text();
  if (raw.length > 100000) throw new Error("Notification too large");
  const body = request.headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  const decoded = typeof body.response === "string" ? airpayDecrypt(body.response, airpayConfig().encryptionKey) : body;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Invalid notification");
  const envelope = decoded as Record<string, unknown>;
  const data = envelope.data || envelope;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid notification");
  return data as AirpayData;
}
export async function processAirpayEvent(event: { event_id: string; order_id: string; payment_mode: string; event_type: string }) {
  const db = getSupabaseAdmin({ fresh: true });
  try {
    if (event.payment_mode !== airpayConfig().mode) throw new Error("Airpay event environment mismatch");
    // Refund/chargeback notifications are retained for review, never treated as purchases.
    if (event.event_type !== "payment") throw new Error("Airpay adjustment requires verified refund reconciliation");
    const order = await reconcileAirpayOrder(event.order_id);
    if (!["paid", "failed"].includes(order.payment_status) || (order.payment_status === "paid" && !order.id.startsWith("sm_") && !order.fulfilled_at)) throw new Error("Airpay payment still pending");
    const saved = await db.from("airpay_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", event.event_id);
    if (saved.error) throw new Error("Unable to acknowledge Airpay event");
  } finally {
    await db.from("airpay_webhook_events").update({ checked_at: new Date().toISOString() }).eq("event_id", event.event_id);
  }
}
export async function airpayWebhook(request: NextRequest) {
  let fields: AirpayData;
  try { fields = await readFields(request); } catch { return NextResponse.json({ error: "Invalid notification" }, { status: 400 }); }
  try {
    if (!validAirpayNotification(fields)) return NextResponse.json({ error: "Invalid Airpay checksum" }, { status: 400 });
    const id = String(fields.orderid), mode = airpayConfig().mode;
    const db = getSupabaseAdmin({ fresh: true });
    const known = await db.from(id.startsWith("sm_") ? "soulmate_orders" : "payments").select("id").eq("id", id).eq("gateway", "airpay").eq("payment_mode", mode).maybeSingle();
    if (known.error) throw new Error("Unable to read Airpay purchase");
    if (!known.data) return NextResponse.json({ ignored: true });
    const eventId = crypto.createHash("sha256").update(JSON.stringify([airpayConfig().merchantId, mode, id, String(fields.ap_transactionid), String(fields.transaction_status), String(fields.transaction_type), String(fields.transaction_payment_status), String(fields.refund_id || "")])).digest("hex");
    const event = { transaction_id: String(fields.ap_transactionid || ""), refund_id: String(fields.refund_id || ""), event_id: eventId, order_id: id, payment_mode: mode, event_type: ["340", "350", "360", "420"].includes(String(fields.transaction_type)) ? "adjustment" : "payment" };
    const saved = await db.from("airpay_webhook_events").upsert(event, { onConflict: "event_id", ignoreDuplicates: true });
    if (saved.error) throw new Error("Unable to persist Airpay event");
    const read = await db.from("airpay_webhook_events").select("*").eq("event_id", eventId).single();
    if (read.error) throw new Error("Unable to read Airpay event");
    if (event.event_type === "adjustment") return NextResponse.json({ accepted: true, reviewRequired: true });
    if (!read.data.processed_at) {
      try { await processAirpayEvent(event); } catch { return NextResponse.json({ accepted: true, queued: true }); }
    }
    return NextResponse.json({ accepted: true });
  } catch { return NextResponse.json({ error: "Unable to accept Airpay notification; retry required" }, { status: 503 }); }
}
export async function airpayCallback(request: NextRequest) {
  try {
    const fields = request.method === "POST" ? await readFields(request) : {};
    const states = request.nextUrl.searchParams.getAll("state");
    const state = states.length === 1 ? states[0] : states.length === 0 ? String(fields.customvar || fields.custom_var || "") : "";
    const id = readAirpayReturnToken(state);
    if (!id || !isAirpayReference(id)) return NextResponse.json({ error: "Invalid checkout return" }, { status: 400 });
    if (fields.orderid && fields.orderid !== id) return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
    const db = getSupabaseAdmin({ fresh: true });
    const known = await db.from(id.startsWith("sm_") ? "soulmate_orders" : "payments").select("id").eq("id", id).eq("gateway", "airpay").eq("payment_mode", airpayConfig().mode).maybeSingle();
    if (known.error || !known.data) throw new Error("Unknown Airpay return");
    // Browser contents can only trigger an authenticated status lookup, never grant access.
    try { await reconcileAirpayOrder(id); } catch { console.warn("[airpay] Payment return awaits recovery", { orderId: id }); }
    const response = NextResponse.redirect(new URL(id.startsWith("sm_") ? receiptPath(id) : `/payment/processing?txnid=${encodeURIComponent(id)}`, airpayOrigin()), 303);
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    if (id.startsWith("sm_")) response.cookies.set(receiptCookie(id));
    return response;
  } catch { return NextResponse.json({ error: "Payment verification unavailable. Return to checkout to check this payment; do not pay again." }, { status: 503 }); }
}
