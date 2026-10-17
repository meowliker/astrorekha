import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { confirmSoulmatePurchase } from "./us-soulmate-invoice";
import { sendSoulmatePurchase, type SoulmateAttribution } from "./us-soulmate-purchase-tracking";
import type { SoulmateLineItem, SoulmateEntitlements } from "./us-soulmate-cart";
import { US_SOULMATE_FUNNEL, US_SOULMATE_ORDERS_TABLE } from "./us-soulmate-orders";
export type SoulmateOrder = {
  id: string; plan: "standard" | "express"; customer_name: string; customer_email: string; customer_phone: string | null;
  amount: number; base_amount: number; gst_amount: number; currency: string; product_info: string; delivery_hours: number;
  payment_status: string; payment_mode: "live" | "test"; paid_at: string | null; delivery_due_at: string | null;
  catalog_version?: number; line_items?: SoulmateLineItem[]; entitlements?: SoulmateEntitlements;
  review_status?: string; attribution?: SoulmateAttribution; checkout_fingerprint: string; last_verified_at: string | null;
  stripe_session_id: string | null; stripe_payment_id: string | null;
};
export function stripeConfig() {
  const key = process.env.US_SOULMATE_STRIPE_SECRET_KEY?.trim();
  const mode = process.env.US_SOULMATE_STRIPE_MODE;
  if (!key || !["live", "test"].includes(mode || "") || !key.startsWith(`sk_${mode}_`)) throw new Error("US Stripe configuration unavailable");
  return { key, mode: mode as "live" | "test" };
}
export function stripeCheckoutConfig() {
  const config = stripeConfig();
  const publicKey = process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publicKey?.startsWith(`pk_${config.mode}_`)) throw new Error("US Stripe publishable key unavailable");
  return config;
}
// Explicit Stripe API version and no credential fallback to either earlier funnel.
export async function stripeRequest(path: string, body?: URLSearchParams, idempotencyKey?: string) {
  const { key } = stripeConfig();
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Stripe path");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-03-25.dahlia", ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body ? { body } : {}),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error("Stripe request could not be completed");
  return data;
}
function receiptSecret() {
  const secret = process.env.US_SOULMATE_RECEIPT_SECRET;
  if (!secret || secret.length < 32) throw new Error("US receipt secret unavailable");
  return secret;
}
export const receiptToken = (id: string) => crypto.createHmac("sha256", receiptSecret()).update(`us-soulmate-receipt:v1:${id}`).digest("hex");
export function validReceiptToken(id: string, token: string) {
  return /^us_sm_[a-f0-9]{20}$/.test(id) && /^[a-f0-9]{64}$/.test(token) && crypto.timingSafeEqual(Buffer.from(receiptToken(id), "hex"), Buffer.from(token, "hex"));
}
export const receiptPath = (id: string) => `/us/soulmate/payment?order=${encodeURIComponent(id)}`;
export const receiptCookie = (id: string) => ({ name: `us_sm_receipt_${id}`, value: receiptToken(id), httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/us/soulmate/payment", maxAge: 30 * 24 * 3600 });
export async function getSoulmateOrder(id: string): Promise<SoulmateOrder | null> {
  if (!/^us_sm_[a-f0-9]{20}$/.test(id)) return null;
  const result = await getSupabaseAdmin({ fresh: true }).from(US_SOULMATE_ORDERS_TABLE).select("*").eq("id", id).eq("funnel", US_SOULMATE_FUNNEL).maybeSingle();
  if (result.error) throw new Error("Unable to read US order");
  return result.data;
}
function inlineCheckoutResponse(order: SoulmateOrder, session: Record<string, unknown>) {
  const metadata = session.metadata as Record<string, string> | undefined;
  if (typeof session.id !== "string" || (order.stripe_session_id && session.id !== order.stripe_session_id) ||
      session.ui_mode !== "elements" || session.mode !== "payment" || session.currency !== "usd" ||
      session.amount_total !== order.amount || session.client_reference_id !== order.id ||
      metadata?.order_id !== order.id || metadata?.funnel !== US_SOULMATE_FUNNEL ||
      session.livemode !== (order.payment_mode === "live") || typeof session.client_secret !== "string" || !session.client_secret) {
    throw new Error("Stripe checkout does not match US order");
  }
  return { clientSecret: session.client_secret, amount: order.amount, receiptUrl: receiptPath(order.id), orderId: order.id };
}
export async function createStripeCheckout(order: SoulmateOrder, origin: string) {
  if (order.payment_mode !== stripeConfig().mode) throw new Error("Payment environment changed");
  if (order.stripe_session_id) {
    const saved = await stripeRequest(`/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`);
    if (saved.status !== "open") return { checkStatus: true, receiptUrl: receiptPath(order.id) };
    return inlineCheckoutResponse(order, saved);
  }
  const params = new URLSearchParams({ mode: "payment", customer_email: order.customer_email, client_reference_id: order.id,
    ui_mode: "elements", return_url: `${origin}${receiptPath(order.id)}`,
    "payment_method_types[0]": "card", "phone_number_collection[enabled]": "false",
    "metadata[funnel]": US_SOULMATE_FUNNEL, "metadata[order_id]": order.id,
    "payment_intent_data[metadata][funnel]": US_SOULMATE_FUNNEL, "payment_intent_data[metadata][order_id]": order.id,
  });
  if (!order.line_items?.length || order.line_items.reduce((sum, item) => sum + item.amount_paise, 0) !== order.base_amount || order.base_amount + order.gst_amount !== order.amount || !Number.isSafeInteger(order.gst_amount) || order.gst_amount < 0) throw new Error("Invalid US basket");
  // Explicit tax amount preserves the exact local total and displays no percentage.
  // This is a separate charge line, not Stripe automatic-tax calculation/reporting.
  const checkoutItems = [...order.line_items, ...(order.gst_amount ? [{ name: "Tax", amount_paise: order.gst_amount }] : [])];
  params.set("locale", "en");
  params.set("submit_type", "pay");
  params.set("metadata[tax_amount_cents]", String(order.gst_amount));
  checkoutItems.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.amount_paise));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    params.set(`line_items[${index}][quantity]`, "1");
  });
  const session = await stripeRequest("/checkout/sessions", params, `us-soulmate-elements-${order.id}`);
  const result = inlineCheckoutResponse(order, session);
  const saved = await getSupabaseAdmin().from(US_SOULMATE_ORDERS_TABLE).update({ stripe_session_id: session.id }).eq("id", order.id).is("stripe_session_id", null);
  if (saved.error) throw new Error("Unable to save Stripe checkout");
  return result;
}
type StripeCharge = { id: string; created: number; paid: boolean; captured: boolean; currency: string; amount: number };
type StripeIntent = { id: string; status: string; currency: string; amount_received: number; metadata: Record<string, string>; livemode: boolean; latest_charge: StripeCharge | string | null; last_payment_error?: unknown };
type StripeSession = { id: string; mode: string; client_reference_id: string; metadata: Record<string, string>; currency: string; amount_total: number; livemode: boolean; payment_status: string; status: string; payment_intent: StripeIntent | string | null };
export function verifiedStripeUpdate(order: SoulmateOrder, session: StripeSession, now = new Date()) {
  if (session.id !== order.stripe_session_id || session.mode !== "payment" || session.client_reference_id !== order.id ||
      session.metadata?.order_id !== order.id || session.metadata?.funnel !== US_SOULMATE_FUNNEL || session.currency !== "usd" ||
      session.amount_total !== order.amount || session.livemode !== (order.payment_mode === "live")) throw new Error("Stripe session does not match US order");
  const update: Record<string, unknown> = { last_verified_at: now.toISOString(), updated_at: now.toISOString() };
  if (session.payment_status === "paid") {
    const intent = session.payment_intent;
    if (!intent || typeof intent !== "object" || intent.status !== "succeeded" || intent.currency !== "usd" || intent.amount_received !== order.amount || intent.metadata?.order_id !== order.id || intent.metadata?.funnel !== US_SOULMATE_FUNNEL || intent.livemode !== session.livemode) throw new Error("Stripe payment does not match US order");
    const charge = intent.latest_charge;
    if (!charge || typeof charge !== "object" || !Number.isFinite(charge.created) || charge.paid !== true || charge.captured !== true || charge.currency !== "usd" || charge.amount !== order.amount) throw new Error("Stripe charge is not confirmed");
    const paid = new Date(charge.created * 1000);
    if (paid > now || !Number.isFinite(paid.getTime())) throw new Error("Invalid Stripe payment time");
    Object.assign(update, { payment_status: "paid", stripe_payment_id: intent.id, stripe_charge_id: charge.id, paid_at: paid.toISOString(), delivery_due_at: new Date(paid.getTime() + order.delivery_hours * 3600000).toISOString(), fulfillment_status: "queued" });
  } else update.payment_status = session.status === "expired" || (session.status === "complete" && typeof session.payment_intent === "object" && session.payment_intent?.status === "requires_payment_method" && session.payment_intent.last_payment_error) ? "failed" : "pending";
  return update;
}
export async function reconcileSoulmateOrder(order: SoulmateOrder): Promise<SoulmateOrder> {
  if (order.payment_status !== "paid" && order.stripe_session_id) {
    if (order.payment_mode !== stripeConfig().mode) throw new Error("Order environment mismatch");
    const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}?expand[]=payment_intent.latest_charge`);
    const update = verifiedStripeUpdate(order, session);
    const saved = await getSupabaseAdmin().from(US_SOULMATE_ORDERS_TABLE).update(update).eq("id", order.id).neq("payment_status", "paid");
    if (saved.error) throw new Error("Unable to record Stripe verification");
    order = (await getSoulmateOrder(order.id))!;
  }
  if (order.payment_status === "paid") await Promise.all([sendSoulmatePurchase(order), confirmSoulmatePurchase(order)]);
  return order;
}
export function verifyStripeSignature(raw: string, signature: string, secret: string, now = Date.now()) {
  const fields = signature.split(",").map((part) => part.split("="));
  const timestamp = Number(fields.find(([key]) => key === "t")?.[1]);
  if (!secret || !Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return fields.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value || "") && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(value, "hex")));
}
