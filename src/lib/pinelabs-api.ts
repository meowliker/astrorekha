import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { localPaymentGateway } from "./local-payment-gateway";
import { pineLabsCheckoutUrl } from "./pinelabs-checkout-url";

export function pineLabsConfig() {
  const clientId = process.env.PINELABS_CLIENT_ID?.trim();
  const clientSecret = process.env.PINELABS_CLIENT_SECRET?.trim();
  const merchantId = process.env.PINELABS_MERCHANT_ID?.trim();
  const environment = process.env.PINELABS_ENVIRONMENT?.trim();
  if (!clientId || !clientSecret || !merchantId || !["production", "uat"].includes(environment || "")) throw new Error("Pine Labs is not configured");
  return { clientId, clientSecret, merchantId, environment: environment!, mode: environment === "production" ? "live" : "test",
    host: environment === "production" ? "https://api.pluralpay.in" : "https://pluraluat.v2.pinepg.in" };
}
export function pineLabsSigningConfigured() {
  return Boolean(process.env.PINELABS_CLIENT_SECRET?.trim());
}
export function pineLabsCallbackOrigin() {
  if (localPaymentGateway() === "pinelabs" && !process.env.PINELABS_CALLBACK_ORIGIN) throw new Error("Set the local Pine Labs callback origin before testing");
  const url = new URL(process.env.PINELABS_CALLBACK_ORIGIN || "https://astrorekha.com");
  const local = localPaymentGateway() === "pinelabs" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Invalid Pine Labs callback origin");
  return url.origin;
}
export const isPineLabsReportId = (id: string) => /^pnl[a-f0-9]{24}$/.test(id);
export const isPineLabsReference = (id: string) => isPineLabsReportId(id) || /^sm_[a-f0-9]{20}$/.test(id);
export const isPineLabsProviderId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
type Amount = { value: number; currency: string };
export type PineLabsPayment = { id: string; status: string; payment_amount: Amount; created_at?: string; updated_at?: string };
export type PineLabsOrder = { order_id: string; merchant_order_reference: string; merchant_id: string; type: string; status: string;
  order_amount: Amount; payments?: PineLabsPayment[]; pre_auth?: boolean; part_payment?: boolean; parent_order_id?: string; created_at?: string; updated_at?: string };

async function recordRequest(operation: string, id: string, status: number | null) {
  try { await getSupabaseAdmin().from("payment_gateway_requests").insert({ gateway: "pinelabs", operation, order_id: id,
    environment: process.env.PINELABS_ENVIRONMENT, http_status: status, outcome: status === null ? "network_error" : String(status) }).abortSignal(AbortSignal.timeout(2000)); }
  catch { console.warn("[pinelabs] Request counter unavailable"); }
}
async function request<T>(path: string, operation: string, id: string, token?: string, body?: object): Promise<T> {
  let status: number | null = null;
  try {
    const response = await fetch(pineLabsConfig().host + path, { method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Request-ID": randomUUID(), "Request-Timestamp": new Date().toISOString(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
    status = response.status;
    if (!response.ok) throw new Error(`Pine Labs ${operation} unavailable (HTTP ${status})`);
    return await response.json() as T;
  } finally { await recordRequest(operation, id, status); }
}
export async function pineLabsAccessToken() {
  const config = pineLabsConfig();
  const result = await request<{ access_token: string }>("/api/auth/v1/token", "auth", "", undefined,
    { client_id: config.clientId, client_secret: config.clientSecret, grant_type: "client_credentials" });
  if (!result.access_token || typeof result.access_token !== "string") throw new Error("Pine Labs authentication failed");
  return result.access_token;
}
export async function fetchPineLabsOrder(reference: string, mode: string, providerId = false): Promise<PineLabsOrder> {
  if ((providerId ? !isPineLabsProviderId(reference) : !isPineLabsReference(reference)) || mode !== pineLabsConfig().mode) throw new Error("Invalid Pine Labs order or environment");
  const result = await request<{ data: PineLabsOrder }>(`/api/pay/v1/orders/${providerId ? "" : "reference/"}${encodeURIComponent(reference)}`, "status", reference, await pineLabsAccessToken());
  if (!result.data) throw new Error("Pine Labs order response missing");
  return result.data;
}
export async function initiatePineLabsCheckout(order: { id: string; amount: number; currency?: string; customer_email: string; customer_name?: string; customer_phone?: string; payment_mode: string; product_name?: string; product_info?: string }) {
  if (!isPineLabsReference(order.id) || order.payment_mode !== pineLabsConfig().mode || !Number.isSafeInteger(order.amount) || order.amount < 100 || (order.currency && order.currency !== "INR")) throw new Error("Invalid Pine Labs order");
  const callback = `${pineLabsCallbackOrigin()}/api/pinelabs/callback?state=${encodeURIComponent(pineLabsReturnToken(order.id))}`;
  const result = await request<{ order_id: string; redirect_url: string }>("/api/checkout/v1/orders", "initiate", order.id, await pineLabsAccessToken(), {
    merchant_order_reference: order.id, order_amount: { value: order.amount, currency: "INR" }, integration_mode: "REDIRECT", pre_auth: false,
    allowed_payment_methods: ["CARD", "UPI", "NETBANKING"], callback_url: callback, failure_callback_url: callback,
    notes: (order.product_name || order.product_info || "AstroRekha purchase").slice(0, 255),
    purchase_details: { customer: { email_id: order.customer_email, first_name: order.customer_name || "Customer",
      ...(order.customer_phone ? { mobile_number: order.customer_phone.replace(/^91(?=\d{10}$)/, ""), country_code: "91" } : {}) } },
  });
  if (!isPineLabsProviderId(result.order_id || "")) throw new Error("Pine Labs order ID missing");
  const db = getSupabaseAdmin({ fresh: true });
  const saved = await db.from(order.id.startsWith("sm_") ? "soulmate_orders" : "payments")
    .update({ gateway_order_id: result.order_id }).eq("id", order.id).eq("gateway", "pinelabs");
  if (saved.error) throw new Error("Unable to save Pine Labs checkout reference");
  const action = pineLabsCheckoutUrl(result.redirect_url);
  return { gateway: "pinelabs" as const, action };
}
export function validatePineLabsOrder(order: { id: string; amount: number; currency?: string; gateway_order_id?: string; gateway_transaction_id?: string }, result: PineLabsOrder) {
  if (String(result.merchant_id) !== pineLabsConfig().merchantId || result.merchant_order_reference !== order.id || result.type !== "CHARGE" ||
    !isPineLabsProviderId(result.order_id || "") || (order.gateway_order_id && result.order_id !== order.gateway_order_id) ||
    !Number.isSafeInteger(result.order_amount?.value) || result.order_amount.value !== order.amount || result.order_amount.currency !== "INR" ||
    (order.currency && order.currency !== "INR") || result.pre_auth || result.part_payment) throw new Error("Pine Labs order identity or amount mismatch");
  if (["PROCESSED", "PARTIALLY_REFUNDED", "FULLY_REFUNDED"].includes(result.status)) {
    const paid = result.payments?.filter(p => p.status === "PROCESSED" && p.payment_amount?.value === order.amount && p.payment_amount.currency === "INR");
    if (paid?.length !== 1 || !isPineLabsProviderId(paid[0].id || "") || (order.gateway_transaction_id && order.gateway_transaction_id !== paid[0].id)) throw new Error("Pine Labs successful payment evidence missing");
    return { status: "paid" as const, transactionId: paid[0].id, paidAt: pineLabsTimestamp(paid[0].updated_at) };
  }
  if (["FAILED", "CANCELLED"].includes(result.status)) return { status: "failed" as const };
  if (["CREATED", "PENDING", "ATTEMPTED", "AUTHORIZED"].includes(result.status)) return { status: "pending" as const };
  throw new Error("Unknown Pine Labs order state");
}
export function pineLabsTimestamp(value?: string) {
  if (!value || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now() + 60000) throw new Error("Pine Labs payment timestamp missing");
  return new Date(value).toISOString();
}
function equalSignature(actual: string, expected: Buffer, encoding: "hex" | "base64") {
  const bytes = Buffer.from(actual, encoding);
  return bytes.length === expected.length && timingSafeEqual(bytes, expected);
}
/** Checkout ownership token, independent of Pine Labs' claimed payment status.
 * Bound to this merchant, environment, origin and order. Does not authorize fulfillment.
 */
export function pineLabsReturnToken(id: string, issuedAt = Math.floor(Date.now() / 1000)) {
  if (!isPineLabsReference(id) || !Number.isSafeInteger(issuedAt)) throw new Error("Invalid checkout return reference");
  const config = pineLabsConfig();
  const message = `astrorekha:pinelabs:return:v1:${config.merchantId}:${config.mode}:${pineLabsCallbackOrigin()}:${id}:${issuedAt}`;
  return `${id}.${issuedAt}.${createHmac("sha256", config.clientSecret).update(message).digest("hex")}`;
}
export function readPineLabsReturnToken(token: string | null, now = Date.now()): string | null {
  if (!token || token.length > 200) return null;
  const [id, timestamp, signature, extra] = token.split(".");
  if (extra !== undefined || !isPineLabsReference(id || "") || !/^\d+$/.test(timestamp || "") || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || now / 1000 - issuedAt > 86400 || issuedAt - now / 1000 > 300) return null;
  const expected = pineLabsReturnToken(id, issuedAt).split(".")[2];
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")) ? id : null;
}
export function inspectPineLabsWebhookSignature(raw: string, headers: Headers, now = Date.now()) {
  // Pine Labs' official WooCommerce plugin uses the API client secret as the
  // merchant webhook key. Its Base64 encode/decode steps preserve these UTF-8
  // bytes; decoding the client secret itself would produce a different key.
  // https://github.com/plural-pinelabs/woocommerce-plugin/blob/main/woocommerce-pinepg-gateway/index.php
  const secret = process.env.PINELABS_CLIENT_SECRET?.trim();
  const id = headers.get("webhook-id"), timestamp = headers.get("webhook-timestamp"), signature = headers.get("webhook-signature");
  if (!secret) return { valid: false, reason: "missing_configuration" } as const;
  if (!id || !timestamp || !signature) return { valid: false, reason: "missing_headers" } as const;
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp))) return { valid: false, reason: "invalid_timestamp" } as const;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return { valid: false, reason: "timestamp_outside_window" } as const;
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.${raw}`).digest();
  const candidates = signature.split(" ").map(part => part.startsWith("v1,") ? part.slice(3) : part).filter(value => /^[A-Za-z0-9+/]{43}=$/.test(value));
  if (!candidates.length) return { valid: false, reason: "unsupported_signature_format" } as const;
  return candidates.some(value => equalSignature(value, expected, "base64"))
    ? { valid: true, reason: "verified" } as const
    : { valid: false, reason: "signature_mismatch" } as const;
}
export function verifyPineLabsWebhook(raw: string, headers: Headers, now = Date.now()) {
  return inspectPineLabsWebhookSignature(raw, headers, now).valid;
}
