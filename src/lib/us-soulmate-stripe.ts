import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { confirmSoulmatePurchase } from "./us-soulmate-invoice";
import { sendSoulmatePurchase, type SoulmateAttribution } from "./us-soulmate-purchase-tracking";
import type { SoulmateLineItem, SoulmateEntitlements } from "./us-soulmate-cart";
import { US_SOULMATE_FUNNEL, US_SOULMATE_ORDERS_TABLE } from "./us-soulmate-orders";
export type SoulmateOrder = {
  id: string; plan: "standard" | "express"; customer_name: string; customer_email: string; customer_phone: string | null;
  discount_amount?: number; promotion_code?: string | null; promotion_snapshot?: unknown;
  amount: number; base_amount: number; gst_amount: number; currency: string; product_info: string; delivery_hours: number;
  payment_status: string; payment_mode: "live" | "test"; paid_at: string | null; delivery_due_at: string | null;
  catalog_version?: number; line_items?: SoulmateLineItem[]; entitlements?: SoulmateEntitlements;
  review_status?: string; attribution?: SoulmateAttribution; checkout_fingerprint: string; last_verified_at: string | null;
  stripe_session_id: string | null; stripe_payment_id: string | null;
};
export function stripeConfig() {
  const key = process.env.US_SOULMATE_STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith("sk_live_")) throw new Error("US Stripe live secret key unavailable");
  return { key, mode: "live" as const };
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
  if (!response.ok || data.error) {
    // Keep diagnostics actionable without logging keys, client secrets or customer details.
    console.error("[us-soulmate/stripe]", { status: response.status, type: data.error?.type, code: data.error?.code, param: data.error?.param, requestId: response.headers.get("request-id") });
    if (data.error?.type === "invalid_request_error" && /discount|promotion|coupon/.test(data.error?.param || data.error?.code || "")) throw new PromotionCodeError();
    throw new Error("Stripe request could not be completed");
  }
  return data;
}
export class PromotionCodeError extends Error {
  constructor(message = "This promo code is not valid for this order. Check the code or remove it to continue.") { super(message); }
}
export async function resolvePromotionCode(value: unknown): Promise<{ id: string; code: string } | undefined> {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) throw new PromotionCodeError();
  const code = value.trim();
  const result = await stripeRequest(`/promotion_codes?${new URLSearchParams({ code, active: "true", limit: "100" })}`);
  // Customer-restricted codes require an authenticated Stripe customer, which this guest checkout does not create.
  const match = result.data?.find((item: { id: string; code: string; active: boolean; customer?: unknown }) => item.active && !item.customer && item.code.toLowerCase() === code.toLowerCase());
  if (!match) throw new PromotionCodeError();
  return { id: match.id, code: match.code };
}
type StripeDiscountLine = { description: string; currency: string; quantity: number; amount_subtotal: number; amount_discount: number; amount_tax: number; amount_total: number };
export function verifiedPromotionQuote(order: SoulmateOrder, session: { mode: string; ui_mode: string; client_reference_id: string; metadata?: Record<string, string>; currency: string; livemode: boolean; amount_subtotal: number; amount_total: number; total_details?: { amount_discount: number } }, lines: { data: StripeDiscountLine[]; has_more: boolean }) {
  if (session.mode !== "payment" || session.ui_mode !== "elements" || session.client_reference_id !== order.id || session.metadata?.order_id !== order.id || session.metadata?.funnel !== US_SOULMATE_FUNNEL || session.currency !== "usd" || session.livemode !== (order.payment_mode === "live")) throw new Error("Stripe promotion identity mismatch");
  const expected = [...(order.line_items || []), ...(order.gst_amount ? [{ name: "Tax", amount_paise: order.gst_amount }] : [])];
  if (lines.has_more || lines.data.length !== expected.length || session.amount_subtotal !== order.base_amount + order.gst_amount) throw new Error("Stripe promotion basket mismatch");
  let discount = 0, tax = 0, total = 0, fullDiscount = 0;
  // Match by name rather than response ordering; each checkout line has a unique name.
  const remaining = [...expected];
  for (const line of lines.data) {
    const index = remaining.findIndex(item => item.name === line.description && item.amount_paise === line.amount_subtotal);
    if (index < 0 || line.quantity !== 1 || line.currency !== "usd" || line.amount_tax !== 0 || ![line.amount_subtotal,line.amount_discount,line.amount_total].every(Number.isSafeInteger) || line.amount_discount < 0 || line.amount_discount > line.amount_subtotal || line.amount_total !== line.amount_subtotal - line.amount_discount) throw new Error("Stripe promotion line mismatch");
    remaining.splice(index, 1);
    if (line.description === "Tax") tax = line.amount_total;
    else discount += line.amount_discount;
    total += line.amount_total; fullDiscount += line.amount_discount;
  }
  if (total !== session.amount_total || fullDiscount !== session.total_details?.amount_discount || total !== order.base_amount - discount + tax) throw new Error("Stripe promotion total mismatch");
  if (!discount || total < 50) throw new PromotionCodeError("This code cannot be used for this checkout. The total must be at least $0.50.");
  return { subtotal: order.base_amount, discount, tax, total };
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
  return { clientSecret: session.client_secret, amount: order.amount, quote: { subtotal: order.base_amount, discount: order.discount_amount || 0, tax: order.gst_amount, total: order.amount, code: order.promotion_code || null }, receiptUrl: receiptPath(order.id), orderId: order.id };
}
export async function createStripeCheckout(order: SoulmateOrder, origin: string, promotion?: { id: string; code: string }) {
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
  if (promotion) params.set("discounts[0][promotion_code]", promotion.id);
  if (!order.line_items?.length || order.line_items.reduce((sum, item) => sum + item.amount_paise, 0) !== order.base_amount || order.base_amount + order.gst_amount !== order.amount || !Number.isSafeInteger(order.gst_amount) || order.gst_amount < 0) throw new Error("Invalid US basket");
  // Explicit tax amount preserves the exact local total and displays no percentage.
  // This is a separate charge line, not Stripe automatic-tax calculation/reporting.
  const checkoutItems = [...order.line_items, ...(order.gst_amount ? [{ name: "Tax", amount_paise: order.gst_amount }] : [])];
  params.set("locale", "en");
  params.set("metadata[tax_amount_cents]", String(order.gst_amount));
  checkoutItems.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.amount_paise));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    params.set(`line_items[${index}][quantity]`, "1");
  });
  const session = await stripeRequest("/checkout/sessions", params, `us-soulmate-elements-v3-${order.id}`);
  if (promotion) {
    const lines = await stripeRequest(`/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=100`);
    const quote = verifiedPromotionQuote(order, session, lines);
    const snapshot = { promotionId: promotion.id, discountTotal: session.total_details.amount_discount, lines: lines.data.map((line: StripeDiscountLine) => ({ name: line.description, subtotal: line.amount_subtotal, discount: line.amount_discount, total: line.amount_total })) };
    const saved = await getSupabaseAdmin().rpc("finalize_us_soulmate_promotion", { p_order: order.id, p_session: session.id, p_discount: quote.discount, p_tax: quote.tax, p_total: quote.total, p_code: promotion.code, p_snapshot: snapshot });
    if (saved.error) throw new Error("Unable to save US discount");
    order = { ...order, stripe_session_id: session.id, amount: quote.total, gst_amount: quote.tax, discount_amount: quote.discount, promotion_code: promotion.code };
    return inlineCheckoutResponse(order, session);
  }
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
