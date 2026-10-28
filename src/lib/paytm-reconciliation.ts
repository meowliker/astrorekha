import { isPaytmOrderId } from "./paytm-order-id";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchPaytmStatus, validatePaytmStatus } from "./paytm-api";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { sendSoulmatePurchase } from "./soulmate-purchase-tracking";
import { confirmSoulmatePurchase } from "./soulmate-invoice";

export function paytmPaidAt(value?: string, now = new Date()) {
  const date = value ? new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "+05:30") : now;
  return Number.isFinite(date.getTime()) && date <= now ? date.toISOString() : now.toISOString();
}
/** A DB lease coalesces browser polling, callbacks and cron across Vercel instances. */
export async function reconcilePaytmOrder(id: string) {
  if (!isPaytmOrderId(id)) throw new Error("Invalid payment reference");
  const db = getSupabaseAdmin({ fresh: true });
  const soulmate = id.startsWith("sm_");
  const table = soulmate ? "soulmate_orders" : "payments";
  const read = async () => {
    const result = await db.from(table).select("*").eq("id", id).eq("gateway", "paytm").maybeSingle();
    if (result.error || !result.data) throw new Error("Paytm order not found");
    return result.data;
  };
  let order = await read();
  if (order.payment_status === "paid" && (soulmate || order.fulfilled_at)) return order;
  const now = new Date();
  const lease = new Date(now.getTime() + 45000).toISOString();
  const claimed = await db.from(table).update({ gateway_check_until: lease }).eq("id", id).eq("gateway", "paytm")
    .or(`gateway_check_until.is.null,gateway_check_until.lt.${now.toISOString()}`).select("id").maybeSingle();
  if (claimed.error) throw new Error("Unable to claim payment verification");
  if (!claimed.data) return order;
  try {
    const result = await fetchPaytmStatus(id, order.payment_mode);
    const status = validatePaytmStatus(order, result);
    if (status === "paid") {
      const paidAt = paytmPaidAt(result.txnDate);
      if (soulmate) {
        const saved = await db.from(table).update({ payment_status: "paid", gateway_transaction_id: result.txnId,
          paid_at: paidAt, delivery_due_at: new Date(Date.parse(paidAt) + order.delivery_hours * 3600000).toISOString(),
          fulfillment_status: "queued", last_verified_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", id).neq("payment_status", "paid");
        if (saved.error) throw new Error("Unable to confirm Soulmate payment");
        order = await read();
        await Promise.allSettled([sendSoulmatePurchase(order), confirmSoulmatePurchase(order)]);
      } else {
        const fulfilled = await fulfillPayUPayment({ txnid: id, mihpayid: result.txnId, status: "success",
          amount: (order.amount / 100).toFixed(2), email: order.customer_email, phone: order.customer_phone,
          firstname: order.customer_name, productinfo: order.product_name }, { verifiedByPaytmApi: true, paidAt });
        if (!fulfilled.success) throw new Error("Unable to save report access");
      }
    } else {
      const saved = await db.from(table).update({ payment_status: status }).eq("id", id).neq("payment_status", "paid");
      if (saved.error) throw new Error("Unable to save payment state");
    }
    return await read();
  } finally {
    const saved = await db.from(table).update({ gateway_check_until: new Date(Date.now() + 10000).toISOString(),
      [soulmate ? "last_verified_at" : "gateway_checked_at"]: new Date().toISOString() }).eq("id", id).eq("gateway_check_until", lease);
    if (saved.error) console.warn("[paytm] Verification lease awaits expiry", { orderId: id });
  }
}
