import { reconcilePineLabsOrder } from "./pinelabs-reconciliation";
import { reconcilePaytmOrder } from "./paytm-reconciliation";
import { confirmSoulmatePurchase } from "./soulmate-invoice";
import type { SoulmateLineItem, SoulmateEntitlements } from "./soulmate-cart";
import crypto from "crypto";
import { sendSoulmatePurchase, type SoulmateAttribution } from "./soulmate-purchase-tracking";
import { getSupabaseAdmin } from "./supabase-admin";
import { SOULMATE_FUNNEL, SOULMATE_ORDERS_TABLE } from "./soulmate-orders";
import { verifyPayUResponseHash, type SignedPayUResponse } from "./payu-response-hash";

export type SoulmateOrder = {
  gateway?: "payu" | "paytm" | "pinelabs"; gateway_transaction_id?: string | null;
  id: string; plan: "standard" | "express"; customer_name: string; customer_email: string;
  customer_phone: string; amount: number; base_amount: number; gst_amount: number;
  product_info: string; delivery_hours: number; payment_status: string;
  payment_mode: "live" | "test"; paid_at: string | null; delivery_due_at: string | null;
  catalog_version?: number; line_items?: SoulmateLineItem[]; entitlements?: SoulmateEntitlements;
  review_status?: string; attribution?: SoulmateAttribution;
  checkout_fingerprint: string; last_verified_at: string | null;
};

export function payuConfig() {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  const mode = process.env.PAYU_MODE;
  if (!key || !salt || (mode !== "live" && mode !== "test")) throw new Error("Payment configuration unavailable");
  return { key, salt, mode };
}

export function receiptToken(id: string) {
  return crypto.createHmac("sha256", payuConfig().salt).update(`soulmate-receipt:v1:${id}`).digest("hex");
}
export function validReceiptToken(id: string, token: string) {
  if (!/^sm_[a-f0-9]{20}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return false;
  return crypto.timingSafeEqual(Buffer.from(receiptToken(id), "hex"), Buffer.from(token, "hex"));
}
export function receiptPath(id: string) {
  return `/soulmate/payment?order=${encodeURIComponent(id)}`;
}

export function checkoutParameters(order: SoulmateOrder, origin: string) {
  const { key, salt, mode } = payuConfig();
  if (order.payment_mode !== mode) throw new Error("Payment environment changed; please start a new checkout");
  const fields: Record<string, string> = {
    key, txnid: order.id, amount: (order.amount / 100).toFixed(2),
    productinfo: order.product_info, firstname: order.customer_name,
    email: order.customer_email, phone: order.customer_phone,
    udf1: "", udf2: SOULMATE_FUNNEL, udf3: order.plan, udf4: order.id, udf5: "",
    surl: `${origin}/api/soulmate/payment/callback`,
    furl: `${origin}/api/soulmate/payment/callback`,
  };
  const sequence = [key, fields.txnid, fields.amount, fields.productinfo, fields.firstname,
    fields.email, fields.udf1, fields.udf2, fields.udf3, fields.udf4, fields.udf5,
    "", "", "", "", "", salt].join("|");
  fields.hash = crypto.createHash("sha512").update(sequence).digest("hex");
  return { action: mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment", fields };
}

export async function getSoulmateOrder(id: string): Promise<SoulmateOrder | null> {
  const { data, error } = await getSupabaseAdmin().from(SOULMATE_ORDERS_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to read order");
  return data as SoulmateOrder | null;
}

/** Keep gateway metadata punctuation-free; full display names stay in line_items. */
export function soulmatePayUProductInfo(value: string) {
  return value.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/ +/g, " ").trim();
}

/** PayU replaced each colon/plus with a space on the observed legacy transaction. */
export function matchesSoulmatePayUProduct(expected: string, actual: string | undefined) {
  return actual === expected || actual === expected.replace(/[:+]/g, " ");
}

export function validOrderCallback(order: SoulmateOrder, payload: SignedPayUResponse) {
  if (order.gateway && order.gateway !== "payu") return false;
  const { key, salt } = payuConfig();
  return payload.txnid === order.id && payload.udf2 === SOULMATE_FUNNEL &&
    payload.udf3 === order.plan && payload.udf4 === order.id &&
    matchesSoulmatePayUProduct(order.product_info, payload.productinfo) && payload.email === order.customer_email &&
    payload.firstname === order.customer_name && Math.round(Number(payload.amount) * 100) === order.amount &&
    (verifyPayUResponseHash(payload, key, salt) ||
      // Some returns echo sanitized text but hash the original submitted value.
      verifyPayUResponseHash({ ...payload, productinfo: order.product_info }, key, salt));
}

type VerifiedTransaction = {
  txnid?: string; status?: string; unmappedstatus?: string; amt?: string;
  transaction_amount?: string; amount?: string; mihpayid?: string;
  productinfo?: string; udf2?: string; udf3?: string; udf4?: string; addedon?: string;
};

/** Called only with the transaction fetched from PayU's authenticated verify_payment API. */
export function verifiedOrderUpdate(order: SoulmateOrder, txn: VerifiedTransaction, now = new Date()) {
  if (txn.txnid !== order.id || Math.round(Number(txn.transaction_amount ?? txn.amt ?? txn.amount) * 100) !== order.amount ||
      !matchesSoulmatePayUProduct(order.product_info, txn.productinfo) || txn.udf2 !== SOULMATE_FUNNEL || txn.udf3 !== order.plan || txn.udf4 !== order.id) {
    throw new Error("Payment details do not match the order");
  }
  const status = String(txn.status || "").toLowerCase();
  const state = String(txn.unmappedstatus || "").toLowerCase();
  const paid = status === "success" && state === "captured";
  const failed = ["failure", "failed"].includes(status) || ["failed", "bounced", "dropped", "usercancelled"].includes(state);
  const paymentStatus = paid ? "paid" : failed ? "failed" : "pending";
  const update: Record<string, unknown> = {
    payment_status: paymentStatus, last_verified_at: now.toISOString(), updated_at: now.toISOString(),
  };
  if (paid) {
    if (!txn.mihpayid || !/^\d+$/.test(txn.mihpayid)) throw new Error("Missing PayU payment reference");
    const payuDate = txn.addedon ? new Date(txn.addedon.replace(" ", "T") + "+05:30") : now;
    const paidAt = Number.isFinite(payuDate.getTime()) && payuDate <= now ? payuDate : now;
    update.payu_payment_id = txn.mihpayid;
    update.paid_at = paidAt.toISOString();
    update.delivery_due_at = new Date(paidAt.getTime() + order.delivery_hours * 3600000).toISOString();
    update.fulfillment_status = "queued";
  }
  return update;
}

export async function reconcileSoulmateOrder(order: SoulmateOrder): Promise<SoulmateOrder> {
  if (order.gateway === "pinelabs") return reconcilePineLabsOrder(order.id) as Promise<SoulmateOrder>;
  if (order.gateway === "paytm") return reconcilePaytmOrder(order.id) as Promise<SoulmateOrder>;
  if (order.payment_status === "paid") { await Promise.all([sendSoulmatePurchase(order), confirmSoulmatePurchase(order)]); return order; }
  const { key, salt, mode } = payuConfig();
  if (order.payment_mode !== mode) throw new Error("Order belongs to a different payment environment");
  const command = "verify_payment";
  const hash = crypto.createHash("sha512").update(`${key}|${command}|${order.id}|${salt}`).digest("hex");
  const url = mode === "live" ? "https://info.payu.in/merchant/postservice.php?form=2" : "https://test.payu.in/merchant/postservice.php?form=2";
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key, command, var1: order.id, hash }),
    cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Payment verification temporarily unavailable");
  const result = await response.json();
  const txn = result.transaction_details?.[order.id] as VerifiedTransaction | undefined;
  if (!txn || txn.status === "Not Found") {
    if (!txn) throw new Error("Payment verification returned no transaction");
    const { error } = await getSupabaseAdmin().from(SOULMATE_ORDERS_TABLE)
      .update({ last_verified_at: new Date().toISOString() }).eq("id", order.id).neq("payment_status", "paid");
    if (error) throw new Error("Unable to save verification time");
    return (await getSoulmateOrder(order.id))!;
  }
  if (Number(result.status) !== 1) throw new Error("Payment verification temporarily unavailable");
  const update = verifiedOrderUpdate(order, txn);
  // Atomic guard: delayed failure/pending responses can never overwrite a paid order.
  const { error } = await getSupabaseAdmin().from(SOULMATE_ORDERS_TABLE).update(update).eq("id", order.id).neq("payment_status", "paid");
  if (error) throw new Error("Unable to save payment status");
  const confirmed = (await getSoulmateOrder(order.id))!;
  await Promise.all([sendSoulmatePurchase(confirmed), confirmSoulmatePurchase(confirmed)]);
  return confirmed;
}

export function receiptCookie(id: string) {
  return { name: `sm_receipt_${id}`, value: receiptToken(id), httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/soulmate/payment", maxAge: 30 * 24 * 3600 };
}
