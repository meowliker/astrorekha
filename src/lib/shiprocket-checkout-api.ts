import crypto from "node:crypto";
import type { CheckoutOrder } from "./payments/types";
import type { VerifiedPayment } from "./payments/reconcile";

export function shiprocketConfig() {
  const apiKey = process.env.SHIPROCKET_CHECKOUT_API_KEY || "";
  const secret = process.env.SHIPROCKET_CHECKOUT_API_SECRET || "";
  const environment = process.env.SHIPROCKET_CHECKOUT_ENVIRONMENT;
  if (!apiKey || !secret || !["production", "staging"].includes(environment || "")) throw new Error("Fastrr is not configured");
  return { apiKey, secret, mode: environment === "production" ? "live" : "test",
    api: environment === "production" ? "https://checkout-api.shiprocket.com" : "https://fastrr-api-dev.pickrr.com",
    ui: environment === "production" ? "https://checkout-ui.shiprocket.com" : "https://customcheckoutfastrr.netlify.app" };
}
export function shiprocketOrigin() {
  const url = new URL(process.env.SHIPROCKET_CHECKOUT_ORIGIN || "https://astrorekha.com");
  const local = process.env.NODE_ENV === "development" && !process.env.VERCEL;
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || (local && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid Fastrr origin");
  return url.origin;
}
export const isShiprocketReportId = (id: string) => /^src[a-f0-9]{24}$/.test(id);
export const isShiprocketReference = (id: string) => isShiprocketReportId(id) || /^sm_[a-f0-9]{20}$/.test(id);
export function shiprocketHmac(body: string) { return crypto.createHmac("sha256", shiprocketConfig().secret).update(body).digest("base64"); }
export async function shiprocketRequest(path: "/api/v1/access-token/checkout" | "/api/v1/custom-platform-order/details", payload: Record<string, unknown>) {
  const c = shiprocketConfig(), body = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });
  let response: Response;
  try { response = await fetch(c.api + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": c.apiKey, "X-Api-HMAC-SHA256": shiprocketHmac(body) }, body,
    signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" }); }
  catch { throw new Error("Fastrr API unavailable; check this order before retrying"); }
  if (!response.ok) throw new Error(`Fastrr API returned ${response.status}`);
  const raw = await response.text();
  if (raw.length > 200000) throw new Error("Fastrr response too large");
  const data = JSON.parse(raw);
  if (data?.ok !== true || !data.result || typeof data.result !== "object" || Array.isArray(data.result)) throw new Error("Fastrr API did not confirm the request");
  return data.result as Record<string, unknown>;
}
export function shiprocketState(id: string, issued = Math.floor(Date.now() / 1000)) {
  if (!isShiprocketReference(id)) throw new Error("Invalid Fastrr reference");
  const value = `${id}.${issued}`, c = shiprocketConfig();
  return `${value}.${crypto.createHmac("sha256", c.secret).update(`fastrr-return:v1:${c.apiKey}:${c.mode}:${shiprocketOrigin()}:${value}`).digest("hex")}`;
}
export function readShiprocketState(value: string) {
  const [id, time] = value.split("."), issued = Number(time), now = Date.now() / 1000;
  if (!isShiprocketReference(id || "") || !Number.isInteger(issued) || issued > now + 60 || now - issued > 172800) return null;
  const expected = shiprocketState(id, issued);
  return value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected)) ? id : null;
}
const tokenKey = () => crypto.createHash("sha256").update(`fastrr-token:v1:${shiprocketConfig().secret}`).digest();
export function sealShiprocketToken(token: string) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function openShiprocketToken(token: string) {
  const data = Buffer.from(token, "base64"), decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
export function shiprocketVariant(type: string, productId: string) {
  return String(crypto.createHash("sha256").update(`astrorekha:variant:${type}:${productId}`).digest().readUIntBE(0, 6));
}
export function shiprocketCheckoutPayload(order: CheckoutOrder, variantId: string, state: string) {
  if (!isShiprocketReference(order.id) || order.payment_mode !== shiprocketConfig().mode || !Number.isSafeInteger(order.amount) || order.amount <= 0 || (order.currency && order.currency !== "INR") || !/^\d+$/.test(variantId)) throw new Error("Invalid Fastrr purchase");
  return { cart_data: { items: [{ variant_id: variantId, quantity: 1, catalog_data: { price: order.amount / 100,
    name: order.product_name || order.product_info || "AstroRekha reports", image_url: "https://astrorekha.com/palm.png" } }],
    custom_attributes: { astrorekha_order_id: order.id }, mobile_app: false },
    redirect_url: `${shiprocketOrigin()}/api/shiprocket/callback?state=${encodeURIComponent(state)}` };
}
export async function fetchShiprocketOrder(providerId: string, mode: string) {
  if (!/^[a-f0-9]{24}$/.test(providerId) || mode !== shiprocketConfig().mode) throw new Error("Fastrr reference or environment mismatch");
  return shiprocketRequest("/api/v1/custom-platform-order/details", { order_id: providerId });
}
function amount(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || !/^\d+(\.\d+)?$/.test(String(value))) throw new Error("Invalid Fastrr amount");
  const raw = Number(value) * 100, rounded = Math.round(raw);
  // The documented API returns floating point artefacts, e.g. 1586.6800000000003.
  if (!Number.isSafeInteger(rounded) || Math.abs(raw - rounded) > 0.00001) throw new Error("Invalid Fastrr amount precision");
  return rounded;
}
export function validateShiprocketOrder(order: CheckoutOrder & { gateway_order_id?: string; gateway_transaction_id?: string }, remote: Record<string, unknown>, variantId: string): VerifiedPayment {
  if (order.payment_mode !== shiprocketConfig().mode || remote.order_id !== order.gateway_order_id) throw new Error("Fastrr order identity mismatch");
  const cart = remote.cart_data as { items?: { variant_id: string; quantity: number }[] } | undefined;
  if (cart?.items?.length !== 1 || String(cart.items[0].variant_id) !== variantId || cart.items[0].quantity !== 1) throw new Error("Fastrr cart mismatch");
  // The custom checkout contract is India/INR-only. Reject any explicit different currency.
  if ((order.currency && order.currency !== "INR") || [remote.currency, remote.currency_code].some(c => c != null && c !== "INR")) throw new Error("Fastrr currency mismatch");
  if (remote.status !== "SUCCESS" || remote.payment_status !== "Success") return { status: "pending" };
  if (remote.payment_type !== "PREPAID" || amount(remote.total_amount_payable) !== order.amount || amount(remote.shipping_charges ?? 0) !== 0 || amount(remote.cod_charges ?? 0) !== 0) throw new Error("Fastrr payment type or amount mismatch");
  const payments = remote.payments as Record<string, unknown>[];
  if (!Array.isArray(payments)) throw new Error("Fastrr payment evidence missing");
  const successes = payments.filter(p => p.payment_status === "Success");
  // Multiple captures, partial payments and other gateways require review, never guess.
  if (successes.length !== 1) throw new Error("Ambiguous Fastrr payment");
  const p = successes[0];
  if (String(p.gateway).toLowerCase() !== "airpay" || amount(p.amount) !== order.amount || amount(p.amount_received) !== order.amount ||
    [p.currency, p.currency_code].some(c => c != null && c !== "INR")) throw new Error("Fastrr capture mismatch");
  const transactionId = typeof p.txn_id === "string" ? p.txn_id : "";
  if (!transactionId || transactionId.length > 150 || !p.pg_transaction_id || (order.gateway_transaction_id && order.gateway_transaction_id !== transactionId)) throw new Error("Invalid Fastrr transaction");
  const time = String(p.created_at || "");
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now() + 300000) throw new Error("Invalid Fastrr payment time");
  return { status: "paid", transactionId, paidAt: new Date(time).toISOString() };
}
