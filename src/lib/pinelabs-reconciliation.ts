import { getSupabaseAdmin } from "./supabase-admin";
import { fetchPineLabsOrder, pineLabsConfig, isPineLabsReference, validatePineLabsOrder, type PineLabsOrder } from "./pinelabs-api";
import { fulfillPayUPayment } from "./payu-fulfillment";
import { sendSoulmatePurchase } from "./soulmate-purchase-tracking";
import { confirmSoulmatePurchase } from "./soulmate-invoice";

/** Saved gateway and server catalog snapshot remain authoritative after switching gateways. */
export async function reconcilePineLabsOrder(id: string, verifiedRemote?: PineLabsOrder) {
  if (!isPineLabsReference(id)) throw new Error("Invalid Pine Labs payment reference");
  const db = getSupabaseAdmin({ fresh: true });
  const soulmate = id.startsWith("sm_"), table = soulmate ? "soulmate_orders" : "payments";
  const read = async () => {
    const result = await db.from(table).select("*").eq("id", id).eq("gateway", "pinelabs").maybeSingle();
    if (result.error || !result.data) throw new Error("Pine Labs order not found");
    return result.data;
  };
  let order = await read();
  if (order.payment_mode !== pineLabsConfig().mode) throw new Error("Pine Labs order environment mismatch");
  if (order.payment_status === "paid" && (soulmate || order.fulfilled_at)) return order;
  const now = new Date(), lease = new Date(Date.now() + 90000).toISOString();
  const claim = await db.from(table).update({ gateway_check_until: lease }).eq("id", id).eq("gateway", "pinelabs")
    .or(`gateway_check_until.is.null,gateway_check_until.lt.${now.toISOString()}`).select("id").maybeSingle();
  if (claim.error) throw new Error("Unable to claim payment verification");
  if (!claim.data) return order;
  try {
    // Lookup by our persisted reference also recovers a timed-out checkout response.
    const remote = verifiedRemote || await fetchPineLabsOrder(id, order.payment_mode);
    const result = validatePineLabsOrder(order, remote);
    const bound = await db.from(table).update({ gateway_order_id: remote.order_id }).eq("id", id).eq("gateway", "pinelabs");
    if (bound.error) throw new Error("Unable to save payment reference");
    if (result.status === "paid") {
      if (soulmate) {
        const saved = await db.from(table).update({ payment_status: "paid", gateway_transaction_id: result.transactionId,
          paid_at: result.paidAt, delivery_due_at: new Date(Date.parse(result.paidAt!) + order.delivery_hours * 3600000).toISOString(),
          fulfillment_status: "queued", last_verified_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", id).neq("payment_status", "paid");
        if (saved.error) throw new Error("Unable to confirm Soulmate payment");
        order = await read();
        await Promise.allSettled([sendSoulmatePurchase(order), confirmSoulmatePurchase(order)]);
      } else {
        const fulfilled = await fulfillPayUPayment({ txnid: id, mihpayid: result.transactionId, status: "success",
          amount: (order.amount / 100).toFixed(2), email: order.customer_email, phone: order.customer_phone,
          firstname: order.customer_name, productinfo: order.product_name }, { verifiedByPineLabsApi: true, paidAt: result.paidAt });
        if (!fulfilled.success) throw new Error("Unable to save report access");
      }
    } else {
      const saved = await db.from(table).update({ payment_status: result.status }).eq("id", id).neq("payment_status", "paid");
      if (saved.error) throw new Error("Unable to save payment state");
    }
    return await read();
  } finally {
    const saved = await db.from(table).update({ gateway_check_until: new Date(Date.now() + 10000).toISOString(),
      [soulmate ? "last_verified_at" : "gateway_checked_at"]: new Date().toISOString() }).eq("id", id).eq("gateway_check_until", lease);
    if (saved.error) console.warn("[pinelabs] Verification lease awaits expiry", { orderId: id });
  }
}
