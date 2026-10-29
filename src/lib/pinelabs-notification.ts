import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchPineLabsOrder, isPineLabsReference, isPineLabsProviderId, pineLabsCallbackOrigin, pineLabsConfig, readPineLabsReturnToken, validatePineLabsOrder, inspectPineLabsWebhookSignature } from "./pinelabs-api";
import { reconcilePineLabsOrder } from "./pinelabs-reconciliation";
import { recordPineLabsRefund } from "./pinelabs-refunds";
import { receiptCookie, receiptPath } from "./soulmate-payu";
import { diagnosePineLabsWebhook } from "./pinelabs-webhook-diagnostics";

/** A bad signature is never payment evidence. For an already bound checkout,
 * it may only prompt the same authenticated API reconciliation used by cron.
 * No event status, amount, customer, transaction ID or event ID is trusted here.
 */
async function recheckKnownPineLabsPayment(raw: string) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return null; }
  if (!["ORDER_PROCESSED", "ORDER_AUTHORIZED", "ORDER_FAILED", "ORDER_CANCELLED", "PAYMENT_FAILED"].includes(payload?.event_type)) return null;
  const providerId = payload?.data?.order_id;
  if (typeof providerId !== "string" || !isPineLabsProviderId(providerId)) return null;
  const db = getSupabaseAdmin({ fresh: true }), mode = pineLabsConfig().mode;
  // Only our immutable saved provider binding can select the order to check.
  // Never fetch an arbitrary provider order supplied by an unauthenticated caller.
  const candidates = await Promise.all(["payments", "soulmate_orders"].map(table => db.from(table).select("id")
    .eq("gateway", "pinelabs").eq("payment_mode", mode).eq("gateway_order_id", providerId).maybeSingle()));
  if (candidates.some(result => result.error)) throw new Error("Unable to locate saved Pine Labs payment");
  const known = candidates.flatMap(result => result.data ? [result.data] : []);
  if (known.length !== 1 || !isPineLabsReference(known[0].id)) return null;
  // This routine owns the DB lease/cooldown and uses our saved merchant reference
  // to call Pine Labs. It validates merchant, full amount, INR and transaction.
  const order = await reconcilePineLabsOrder(known[0].id);
  if (order.payment_status !== "paid" || (!order.id.startsWith("sm_") && !order.fulfilled_at)) {
    return NextResponse.json({ error: "Payment verification pending; retry required" }, { status: 503 });
  }
  // A deterministic, server-created audit record cannot be flooded with supplied
  // event IDs. It explicitly records API verification, not a signed webhook.
  const now = new Date().toISOString();
  const event = { event_id: `api-verified:${mode}:${order.id}`, event_type: "API_VERIFIED_PAYMENT",
    provider_order_id: providerId, payment_mode: mode, checked_at: now, processed_at: now };
  const stored = await db.from("pinelabs_webhook_events").upsert(event, { onConflict: "event_id", ignoreDuplicates: true });
  if (stored.error) throw new Error("Unable to record Pine Labs API verification");
  console.info("[pinelabs] Notification resolved by authenticated API", { orderId: order.id, providerOrderId: providerId });
  return NextResponse.json({ accepted: true, verification: "api" });
}

export async function processPineLabsEvent(event: { event_id: string; event_type?: string; provider_order_id: string; payment_mode: string }) {
  const db = getSupabaseAdmin({ fresh: true });
  try {
    const remote = await fetchPineLabsOrder(event.provider_order_id, event.payment_mode, true);
    if (remote.order_id !== event.provider_order_id || String(remote.merchant_id) !== pineLabsConfig().merchantId) throw new Error("Pine Labs event identity mismatch");
    if (remote.type === "REFUND") {
      if (!["FAILED", "CANCELLED"].includes(remote.status)) await recordPineLabsRefund(remote, event.payment_mode);
    }
    else if (isPineLabsReference(remote.merchant_order_reference)) {
      const order = await reconcilePineLabsOrder(remote.merchant_order_reference, remote);
      if (order.payment_status !== "paid" && !["PAYMENT_FAILED", "ORDER_AUTHORIZED"].includes(event.event_type || "") && !["FAILED", "CANCELLED"].includes(remote.status)) throw new Error("Pine Labs payment confirmation pending");
      if (order.payment_status === "paid" && !order.id.startsWith("sm_") && !order.fulfilled_at) throw new Error("Pine Labs fulfillment pending");
    }
    const saved = await db.from("pinelabs_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", event.event_id);
    if (saved.error) throw new Error("Unable to acknowledge Pine Labs event");
  } finally {
    await db.from("pinelabs_webhook_events").update({ checked_at: new Date().toISOString() }).eq("event_id", event.event_id);
  }
}
export async function pineLabsWebhook(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > 1000000) return NextResponse.json({ error: "Notification too large" }, { status: 400 });
    const verification = inspectPineLabsWebhookSignature(raw, request.headers);
    if (!verification.valid) {
      // Never log signatures, secrets, raw payloads or customer data.
      const deliveryId = request.headers.get("webhook-id") || request.headers.get("svix-id") || "";
      console.warn("[pinelabs] Webhook signature rejected", { reason: verification.reason, bodyBytes: Buffer.byteLength(raw),
        diagnosticMatches: verification.reason === "signature_mismatch" ? diagnosePineLabsWebhook(raw, request.headers) : [],
        deliveryId: /^[a-zA-Z0-9_-]{1,100}$/.test(deliveryId) ? deliveryId : undefined,
        webhookIdPresent: request.headers.has("webhook-id"), webhookTimestampPresent: request.headers.has("webhook-timestamp"), webhookSignaturePresent: request.headers.has("webhook-signature"),
        svixIdPresent: request.headers.has("svix-id"), svixTimestampPresent: request.headers.has("svix-timestamp"), svixSignaturePresent: request.headers.has("svix-signature") });
      if (verification.reason === "signature_mismatch") {
        const rechecked = await recheckKnownPineLabsPayment(raw);
        if (rechecked) return rechecked;
      }
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }
    const payload = JSON.parse(raw);
    if (!["ORDER_PROCESSED", "ORDER_AUTHORIZED", "ORDER_FAILED", "ORDER_CANCELLED", "PAYMENT_FAILED", "REFUND_PROCESSED", "REFUND_FAILED"].includes(payload.event_type)) return NextResponse.json({ ignored: true });
    const providerId = payload.data?.order_id;
    if (typeof providerId !== "string" || !isPineLabsProviderId(providerId)) {
      console.warn("[pinelabs] Webhook rejected", { reason: "invalid_order_reference", dataPresent: Boolean(payload.data), orderIdType: typeof providerId });
      return NextResponse.json({ error: "Invalid order reference" }, { status: 400 });
    }
    const event = { event_id: request.headers.get("webhook-id")!, event_type: String(payload.event_type), provider_order_id: providerId, payment_mode: pineLabsConfig().mode };
    const db = getSupabaseAdmin({ fresh: true });
    const stored = await db.from("pinelabs_webhook_events").upsert(event, { onConflict: "event_id", ignoreDuplicates: true });
    if (stored.error) throw new Error("Webhook persistence failed");
    const saved = await db.from("pinelabs_webhook_events").select("*").eq("event_id", event.event_id).single();
    if (saved.error) throw new Error("Webhook read failed");
    if (!saved.data.processed_at) {
      try { await processPineLabsEvent(saved.data); } catch { return NextResponse.json({ accepted: true, queued: true }); }
    }
    console.info("[pinelabs] Webhook processed", { eventId: event.event_id, providerOrderId: providerId, eventType: event.event_type });
    return NextResponse.json({ accepted: true });
  } catch { return NextResponse.json({ error: "Unable to accept notification; retry required" }, { status: 503 }); }
}
export async function pineLabsCallback(request: NextRequest) {
  try {
    // This token is created by our checkout, not a provider callback-signing key.
    // It binds the browser return to its original order, including guest receipts.
    const states = request.nextUrl.searchParams.getAll("state");
    const id = states.length === 1 ? readPineLabsReturnToken(states[0]) : null;
    if (!id) return NextResponse.json({ error: "Invalid checkout return" }, { status: 400 });
    const fields: Record<string, string> = {};
    if (request.method === "GET") request.nextUrl.searchParams.forEach((v, k) => { fields[k] = v; });
    else if (request.headers.get("content-type")?.includes("application/json")) {
      for (const [k, v] of Object.entries(await request.json())) if (typeof v === "string") fields[k] = v;
    } else (await request.formData()).forEach((v, k) => { if (typeof v === "string") fields[k] = v; });
    if (!isPineLabsProviderId(fields.order_id || "")) return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    const db = getSupabaseAdmin({ fresh: true });
    const mode = pineLabsConfig().mode;
    const { data: order, error } = await db.from(id.startsWith("sm_") ? "soulmate_orders" : "payments")
      .select("*").eq("id", id).eq("gateway", "pinelabs").eq("payment_mode", mode).maybeSingle();
    if (error || !order) throw new Error("Unknown checkout return");
    if (order.gateway_order_id && order.gateway_order_id !== fields.order_id) return NextResponse.json({ error: "Payment reference mismatch" }, { status: 400 });
    let remote;
    try {
      remote = await fetchPineLabsOrder(fields.order_id, mode, true);
    } catch {
      // Token proves ownership, but API outage never proves payment success.
      // The existing status page and reconciliation job retry the same order.
      console.warn("[pinelabs] Return awaits status API", { orderId: id });
    }
    if (remote) {
      if (remote.order_id !== fields.order_id) throw new Error("Provider order mismatch");
      validatePineLabsOrder(order, remote);
      try { await reconcilePineLabsOrder(id, remote); }
      catch { console.warn("[pinelabs] Verified return awaits fulfillment retry", { orderId: id }); }
      console.info("[pinelabs] Return verified by API", { orderId: id, providerOrderId: remote.order_id, status: remote.status });
    }
    const response = NextResponse.redirect(new URL(id.startsWith("sm_") ? receiptPath(id) : `/payment/processing?txnid=${encodeURIComponent(id)}`, pineLabsCallbackOrigin()), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (id.startsWith("sm_")) response.cookies.set(receiptCookie(id));
    return response;
  } catch { return NextResponse.json({ error: "Payment verification unavailable. Return to your checkout to check this payment; do not pay again." }, { status: 503 }); }
}
