import Checksum from "paytmchecksum";
import { getSupabaseAdmin } from "./supabase-admin";
import { localPaymentGateway } from "./local-payment-gateway";
import { paytmCallbackOrigin } from "./paytm-preview";
import { isPaytmOrderId } from "./paytm-order-id";

export function paytmConfig() {
  const mid = process.env.PAYTM_MID?.trim();
  const key = process.env.PAYTM_MERCHANT_KEY?.trim();
  const environment = process.env.PAYTM_ENVIRONMENT?.trim();
  if (!mid || !key || !["production", "staging"].includes(environment || "")) throw new Error("Paytm is not configured");
  const mode = environment === "production" ? "live" : "test";
  return { mid, key, mode, website: process.env.PAYTM_WEBSITE_NAME || (mode === "live" ? "DEFAULT" : "WEBSTAGING"),
    host: mode === "live" ? "https://secure.paytmpayments.com" : "https://securestage.paytmpayments.com" };
}
export type PaytmStatus = {
  resultInfo: { resultStatus: string; resultCode: string; resultMsg: string };
  mid?: string; orderId?: string; txnId?: string; txnAmount?: string; currency?: string;
  txnDate?: string; refundAmt?: string;
};

/** Count attempts without recording credentials, signatures, payloads or customer details. */
async function recordRequest(operation: string, orderId: string, status: number | null, outcome: string) {
  try {
    const { error } = await getSupabaseAdmin().from("payment_gateway_requests").insert({
      gateway: "paytm", operation, order_id: orderId, http_status: status, outcome,
      environment: process.env.PAYTM_ENVIRONMENT,
    }).abortSignal(AbortSignal.timeout(2000));
    if (error) console.warn("[paytm] Request counter unavailable");
  } catch { console.warn("[paytm] Request counter unavailable"); }
}
async function signedRequest<T>(path: string, body: Record<string, unknown>, operation: string): Promise<T> {
  const { host, key } = paytmConfig();
  const signature = await Checksum.generateSignature(JSON.stringify(body), key);
  let httpStatus: number | null = null;
  let outcome = "network_error";
  try {
    const response = await fetch(`${host}${path}`, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, head: { signature } }), signal: AbortSignal.timeout(12000) });
    httpStatus = response.status;
    if (!response.ok) throw new Error("Paytm is temporarily unavailable");
    const result = await response.json();
    if (!result.body || !validChecksum(result.head?.signature) || !Checksum.verifySignature(JSON.stringify(result.body), key, result.head.signature)) {
      outcome = "invalid_signature";
      throw new Error("Paytm response could not be verified");
    }
    outcome = String(result.body.resultInfo?.resultCode || "unknown");
    return result.body as T;
  } finally { await recordRequest(operation, String(body.orderId || ""), httpStatus, outcome); }
}
export async function initiatePaytmCheckout(order: { id: string; amount: number; customer_email: string; customer_name?: string; customer_phone?: string; payment_mode: string }) {
  if (!isPaytmOrderId(order.id) || order.id.length > 35) throw new Error("Paytm checkout reference must fit the UPI 35-character limit");
  const config = paytmConfig();
  if (config.mode !== order.payment_mode || !Number.isSafeInteger(order.amount) || order.amount <= 0) throw new Error("Invalid Paytm order");
  const callbackOrigin = paytmCallbackOrigin();
  const origin = new URL(callbackOrigin);
  const localCallback = localPaymentGateway() === "paytm" && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if ((!localCallback && origin.protocol !== "https:") || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) throw new Error("Invalid Paytm callback origin");
  const body = { requestType: "Payment", mid: config.mid, websiteName: config.website, orderId: order.id,
    txnAmount: { value: (order.amount / 100).toFixed(2), currency: "INR" },
    userInfo: { custId: order.id, email: order.customer_email, ...(order.customer_phone ? { mobile: order.customer_phone.replace(/^91(?=\d{10}$)/, "") } : {}) },
    callbackUrl: `${origin.origin}/api/paytm/callback` };
  const result = await signedRequest<{ resultInfo: PaytmStatus["resultInfo"]; txnToken?: string }>(
    `/theia/api/v1/initiateTransaction?${new URLSearchParams({ mid: config.mid, orderId: order.id })}`, body, "initiate");
  if (result.resultInfo?.resultStatus !== "S" || !result.txnToken) throw new Error(`Paytm checkout unavailable (${result.resultInfo?.resultCode || "unknown"})`);
  return { gateway: "paytm" as const, action: `${config.host}/theia/api/v1/showPaymentPage?${new URLSearchParams({ mid: config.mid, orderId: order.id })}`,
    fields: { mid: config.mid, orderId: order.id, txnToken: result.txnToken } };
}
export async function fetchPaytmStatus(orderId: string, mode: string): Promise<PaytmStatus> {
  const { mid, mode: currentMode } = paytmConfig();
  if (mode !== currentMode) throw new Error("Paytm payment environment differs from this order");
  return signedRequest<PaytmStatus>("/v3/order/status", { mid, orderId }, "status");
}
export function validatePaytmStatus(order: { id: string; amount: number; currency?: string }, result: PaytmStatus) {
  const status = result.resultInfo?.resultStatus;
  if (status === "NO_RECORD_FOUND") return "pending" as const;
  if (!["TXN_SUCCESS", "TXN_FAILURE", "PENDING"].includes(status)) throw new Error("Paytm returned an unknown payment state");
  // Auth/config failures can use TXN_FAILURE without an order. They are never payment failures.
  if (result.mid !== paytmConfig().mid || result.orderId !== order.id) throw new Error("Paytm order identity mismatch");
  if (status === "PENDING") return "pending" as const;
  if (!/^\d+(\.\d{1,2})?$/.test(result.txnAmount || "") || Math.round(Number(result.txnAmount) * 100) !== order.amount ||
      (result.currency && result.currency !== "INR") || (order.currency && order.currency !== "INR")) throw new Error("Paytm amount or currency mismatch");
  if (status === "TXN_SUCCESS" && !result.txnId) throw new Error("Paytm transaction reference missing");
  return status === "TXN_SUCCESS" ? "paid" as const : "failed" as const;
}
function validChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]{107}=$/.test(value);
}
export function verifyPaytmNotification(fields: Record<string, string>) {
  const { CHECKSUMHASH, ...body } = fields;
  return validChecksum(CHECKSUMHASH) && body.MID === paytmConfig().mid && Checksum.verifySignature(body, paytmConfig().key, CHECKSUMHASH);
}

export type PaytmRefund = {
  resultInfo: PaytmStatus["resultInfo"]; mid?: string; orderId?: string; txnId?: string;
  refId?: string; refundId?: string; txnAmount?: string; refundAmount?: string;
  acceptRefundTimestamp?: string;
};
export async function fetchPaytmRefundStatus(orderId: string, refId: string) {
  return signedRequest<PaytmRefund>("/v2/refund/status", { mid: paytmConfig().mid, orderId, refId }, "refund_status");
}
/** The passbook endpoint returns unsigned discovery data. Each refund is separately verified. */
export async function listPaytmRefunds(start: Date, end: Date, page: number) {
  const { mid, key, host } = paytmConfig();
  const format = (date: Date) => date.toISOString().slice(0, 19) + "+00:00";
  const body = { mid, startDate: format(start), endDate: format(end), pageSize: 50, pageNum: page };
  let status: number | null = null, outcome = "network_error";
  try {
    const response = await fetch(`${host}/merchant-passbook/api/v1/refundList`, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ head: { tokenType: "CHECKSUM", signature: await Checksum.generateSignature(JSON.stringify(body), key) }, body }) });
    status = response.status;
    if (!response.ok) throw new Error("Paytm refund list unavailable");
    const data = await response.json();
    outcome = String(data.resultCode || "unknown");
    if (data.resultCode !== "00000000" || !Array.isArray(data.orders)) throw new Error("Unable to read Paytm refunds");
    return data.orders as { mid: string; orderId: string; refId: string; refundId: string }[];
  } finally { await recordRequest("refund_list", "", status, outcome); }
}
export function validatePaytmRefund(order: { id: string; amount: number; gateway_transaction_id?: string }, refId: string, refund: PaytmRefund) {
  if (refund.resultInfo?.resultStatus !== "TXN_SUCCESS") return null;
  if (refund.mid !== paytmConfig().mid || refund.orderId !== order.id || refund.refId !== refId || !refund.refundId || refund.txnId !== order.gateway_transaction_id) throw new Error("Refund identity mismatch");
  const amount = Math.round(Number(refund.refundAmount) * 100);
  if (!/^\d+(\.\d{1,2})?$/.test(refund.refundAmount || "") || !/^\d+(\.\d{1,2})?$/.test(refund.txnAmount || "") || amount <= 0 || amount > order.amount || Math.round(Number(refund.txnAmount) * 100) !== order.amount) throw new Error("Refund amount mismatch");
  // Never assign a missing/invalid refund date to today: that would corrupt daily revenue.
  const value = refund.acceptRefundTimestamp || "";
  const at = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "+05:30");
  if (!Number.isFinite(at) || at > Date.now() + 60000) throw new Error("Refund date unavailable");
  return { amount, occurredAt: new Date(at).toISOString(), refundId: refund.refundId };
}

/** Only for the deliberately nonexistent monitoring reference, never for customer confirmation. */
export function isExpectedPaytmProbe(result: PaytmStatus) {
  return (result.resultInfo?.resultStatus === "NO_RECORD_FOUND" && result.resultInfo.resultCode === "331") ||
    (result.resultInfo?.resultStatus === "TXN_FAILURE" && result.resultInfo.resultCode === "334");
}
