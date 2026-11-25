import crypto from "node:crypto";
import type { CheckoutOrder } from "./payments/types";

const API = "https://kraken.airpay.co.in/airpay/pay/v4/api";
export function airpayConfig() {
  const merchantId = process.env.AIRPAY_MERCHANT_ID || "";
  const username = process.env.AIRPAY_USERNAME || "", password = process.env.AIRPAY_PASSWORD || "";
  const apiKey = process.env.AIRPAY_API_KEY || "", clientId = process.env.AIRPAY_CLIENT_ID || "", clientSecret = process.env.AIRPAY_CLIENT_SECRET || "";
  const mode = process.env.AIRPAY_MODE;
  if (!/^\d{1,20}$/.test(merchantId) || !username || !password || !apiKey || !clientId || !clientSecret || !["live", "test"].includes(mode || "")) throw new Error("Airpay is not configured");
  return { merchantId, username, password, apiKey, clientId, clientSecret, mode: mode as "live" | "test",
    encryptionKey: crypto.createHash("md5").update(`${username}~:~${password}`).digest("hex"),
    privateKey: crypto.createHash("sha256").update(`${apiKey}@${username}:|:${password}`).digest("hex") };
}
export function airpayOrigin() {
  const url = new URL(process.env.AIRPAY_CALLBACK_ORIGIN || "https://astrorekha.com");
  const local = process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.LOCAL_PAYMENT_GATEWAY === "airpay";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || (local && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid Airpay callback origin");
  return url.origin;
}
export const isAirpayReportId = (id: string) => /^arp[a-f0-9]{24}$/.test(id);
export const isAirpayReference = (id: string) => isAirpayReportId(id) || /^sm_[a-f0-9]{20}$/.test(id);
export function airpayChecksum(data: Record<string, string>, date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return crypto.createHash("sha256").update(Object.keys(data).sort().map(k => data[k]).join("") + day).digest("hex");
}
/** Matches Airpay's PHP v4 kit: 16 ASCII hex IV characters followed by base64 ciphertext. */
export function airpayEncrypt(data: unknown, key: string) {
  const iv = crypto.randomBytes(8).toString("hex");
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), Buffer.from(iv));
  return iv + Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]).toString("base64");
}
export function airpayDecrypt(value: string, key: string): unknown {
  if (!/^[a-fA-F0-9]{16}[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 100000) throw new Error("Invalid Airpay encrypted response");
  try {
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), Buffer.from(value.slice(0, 16)));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.slice(16), "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new Error("Unable to decode Airpay response"); }
}
export type AirpayData = Record<string, string | number | undefined>;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Airpay response");
  return value as Record<string, unknown>;
}
async function apiRequest(path: string, data: Record<string, string>, token?: string) {
  const config = airpayConfig();
  const fields: Record<string, string> = { merchant_id: config.merchantId, encdata: airpayEncrypt(data, config.encryptionKey), checksum: airpayChecksum(data) };
  if (token) fields.privatekey = config.privateKey;
  let response: Response;
  try { response = await fetch(`${API}/${path}/${token ? `?token=${encodeURIComponent(token)}` : ""}`, { method: "POST", body: new URLSearchParams(fields), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("Airpay API unavailable"); }
  if (!response.ok) throw new Error(`Airpay API returned ${response.status}`);
  const raw = await response.text();
  if (raw.length > 100000) throw new Error("Airpay response too large");
  let envelope = object(JSON.parse(raw));
  if (typeof envelope.response === "string") envelope = object(airpayDecrypt(envelope.response, config.encryptionKey));
  return envelope;
}
let tokenCache: { key: string; token: string; until: number } | undefined;
let tokenFlight: { key: string; promise: Promise<string> } | undefined;
export async function airpayAccessToken(): Promise<string> {
  const c = airpayConfig();
  const key = crypto.createHash("sha256").update(JSON.stringify(c)).digest("hex");
  if (tokenCache?.key === key && tokenCache.until > Date.now()) return tokenCache.token;
  if (tokenFlight?.key === key) return tokenFlight.promise;
  const promise = (async () => {
    const result = await apiRequest("oauth2", { merchant_id: c.merchantId, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials" });
    const data = object(result.data);
    if (String(result.status_code) !== "200" || typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 30) throw new Error("Airpay authentication failed");
    tokenCache = { key, token: data.access_token, until: Date.now() + Math.min(Number(data.expires_in) - 30, 270) * 1000 };
    return data.access_token;
  })();
  tokenFlight = { key, promise };
  try { return await promise; } finally { if (tokenFlight?.promise === promise) tokenFlight = undefined; }
}
export function airpayReturnToken(id: string, issued = Math.floor(Date.now() / 1000)) {
  if (!isAirpayReference(id)) throw new Error("Invalid Airpay reference");
  const c = airpayConfig(), value = `${id}.${issued}`;
  return `${value}.${crypto.createHmac("sha256", c.apiKey).update(`airpay:v1:${c.merchantId}:${c.mode}:${airpayOrigin()}:${value}`).digest("hex")}`;
}
export function readAirpayReturnToken(value: string) {
  const [id, time] = value.split("."); const issued = Number(time), now = Date.now() / 1000;
  if (!isAirpayReference(id || "") || !Number.isInteger(issued) || issued > now + 60 || now - issued > 172800) return null;
  const expected = airpayReturnToken(id, issued);
  return value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected)) ? id : null;
}
export async function initiateAirpayCheckout(order: CheckoutOrder) {
  const c = airpayConfig();
  if (!isAirpayReference(order.id) || order.payment_mode !== c.mode || !Number.isSafeInteger(order.amount) || order.amount <= 0 || (order.currency && order.currency !== "INR")) throw new Error("Invalid Airpay purchase");
  const token = await airpayAccessToken();
  const data: Record<string, string> = { orderid: order.id, merchant_id: c.merchantId, amount: (order.amount / 100).toFixed(2), currency_code: "356", iso_currency: "INR",
    buyer_email: order.customer_email, buyer_firstname: order.customer_name || "Customer", buyer_phone: order.customer_phone || "",
    return_url: `${airpayOrigin()}/api/airpay/callback?state=${encodeURIComponent(airpayReturnToken(order.id))}`, customvar: airpayReturnToken(order.id), kittype: "server_side_sdk" };
  return { gateway: "airpay" as const, action: `https://payments.airpay.co.in/pay/v4/?token=${encodeURIComponent(token)}`,
    fields: { merchant_id: c.merchantId, privatekey: c.privateKey, encdata: airpayEncrypt(data, c.encryptionKey), checksum: airpayChecksum(data) } };
}
export async function fetchAirpayStatus(id: string, mode: string): Promise<AirpayData | null> {
  const c = airpayConfig();
  if (!isAirpayReference(id) || mode !== c.mode) throw new Error("Airpay reference or environment mismatch");
  if (mode !== "live") throw new Error("Airpay order verification requires a live merchant ID");
  const result = await apiRequest("verify", { orderid: id }, await airpayAccessToken());
  // No records is not proof of failure; a delayed payment may still arrive.
  if (String(result.response_code) === "503") return null;
  if (String(result.status_code) !== "200") throw new Error("Airpay verification unavailable");
  return object(result.data) as AirpayData;
}
export function airpayAmount(value: unknown) {
  const s = String(value ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid Airpay amount");
  const n = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(n)) throw new Error("Invalid Airpay amount");
  return n;
}
export function airpayPaidAt(value: unknown) {
  const s = String(value || ""), m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  const date = m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`) : new Date(s);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000) throw new Error("Invalid Airpay payment time");
  return date.toISOString();
}
export function validateAirpayStatus(order: CheckoutOrder & { gateway_transaction_id?: string }, remote: AirpayData | null) {
  if (!remote) return { status: "pending" as const };
  const c = airpayConfig();
  if (String(remote.orderid) !== order.id || String(remote.merchant_id) !== c.merchantId || String(remote.txn_mode).toLowerCase() !== order.payment_mode) throw new Error("Airpay payment identity mismatch");
  if (String(remote.currency_code) !== "356" || airpayAmount(remote.amount) !== order.amount) throw new Error("Airpay payment amount or currency mismatch");
  const transactionId = String(remote.ap_transactionid || "");
  if (order.gateway_transaction_id && order.gateway_transaction_id !== transactionId) throw new Error("Airpay transaction changed");
  const code = String(remote.transaction_status), status = String(remote.transaction_payment_status || "").toUpperCase();
  if (code === "200" && ["SUCCESS", "CAPTURE"].includes(status) && ["320", "330", "370"].includes(String(remote.transaction_type)) && String(remote.risk) === "0") {
    if (!/^\d{1,40}$/.test(transactionId)) throw new Error("Invalid Airpay transaction ID");
    return { status: "paid" as const, transactionId, paidAt: airpayPaidAt(remote.transaction_time) };
  }
  if (["400", "401", "405"].includes(code) && ["FAIL", "FAILED", "CANCEL", "CANCELLED", "DROPPED", "BOUNCED"].includes(status)) return { status: "failed" as const };
  return { status: "pending" as const };
}
/** CRC32 is Airpay's transport checksum, never the authority for granting access. */
export function airpayNotificationChecksum(data: AirpayData) {
  const c = airpayConfig();
  const values = [data.orderid, data.ap_transactionid, data.amount, data.transaction_status, data.message, c.merchantId, c.username];
  if (data.chmod === "upi") values.push(data.customer_vpa);
  let crc = 0xffffffff;
  for (const byte of Buffer.from(values.map(v => String(v ?? "")).join(":"))) {
    crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return String((crc ^ 0xffffffff) >>> 0);
}
export function validAirpayNotification(data: AirpayData) {
  const actual = String(data.ap_SecureHash ?? data.ap_securehash ?? "");
  return String(data.merchant_id) === airpayConfig().merchantId && isAirpayReference(String(data.orderid || "")) &&
    /^\d+$/.test(actual) && actual === airpayNotificationChecksum(data);
}
