import { getSupabaseAdmin } from "../supabase-admin";
import { sendSoulmatePurchase } from "../soulmate-purchase-tracking";
import { confirmSoulmatePurchase } from "../soulmate-invoice";
import type { SoulmateOrder } from "../soulmate-payu";
import type { CheckoutOrder, PaymentGateway } from "./types";

export type SavedPayment = CheckoutOrder & {
  gateway: PaymentGateway; payment_status: string; fulfilled_at?: string | null;
  gateway_order_id?: string; gateway_transaction_id?: string; delivery_hours?: number;
};
export type VerifiedPayment = {
  status: "paid" | "pending" | "failed"; transactionId?: string; paidAt?: string;
  providerOrderId?: string;
};
/** verify must authenticate with the provider AND bind reference, merchant, amount and currency. */
export interface RecoveryAdapter {
  id: PaymentGateway;
  label: string;
  leaseMs: number;
  validReference(id: string): boolean;
  assertOrder?(order: SavedPayment): void;
  verify(order: SavedPayment): Promise<VerifiedPayment>;
  fulfillReports(order: SavedPayment, result: VerifiedPayment): Promise<void>;
}

/** One lease and commit path for callbacks, browser polls and background recovery. */
export async function reconcileGatewayOrder(id: string, provider: RecoveryAdapter) {
  if (!provider.validReference(id)) throw new Error("Invalid payment reference");
  const db = getSupabaseAdmin({ fresh: true });
  const soulmate = id.startsWith("sm_"), table = soulmate ? "soulmate_orders" : "payments";
  const read = async () => {
    const result = await db.from(table).select("*").eq("id", id).eq("gateway", provider.id).maybeSingle();
    if (result.error || !result.data) throw new Error(`${provider.label} order not found`);
    return result.data;
  };
  let order = await read();
  provider.assertOrder?.(order);
  if (order.payment_status === "paid" && (soulmate || order.fulfilled_at)) return order;
  const now = new Date(), lease = new Date(now.getTime() + provider.leaseMs).toISOString();
  const claim = await db.from(table).update({ gateway_check_until: lease }).eq("id", id).eq("gateway", provider.id)
    .or(`gateway_check_until.is.null,gateway_check_until.lt.${now.toISOString()}`).select("id").maybeSingle();
  if (claim.error) throw new Error("Unable to claim payment verification");
  if (!claim.data) return order;
  try {
    const result = await provider.verify(order);
    if (!["paid", "pending", "failed"].includes(result.status)) throw new Error("Unknown verified payment state");
    if (result.status === "paid" && (!result.transactionId || !result.paidAt || !Number.isFinite(Date.parse(result.paidAt)))) throw new Error("Incomplete verified payment");
    if (result.providerOrderId) {
      const bound = await db.from(table).update({ gateway_order_id: result.providerOrderId }).eq("id", id).eq("gateway", provider.id);
      if (bound.error) throw new Error("Unable to save payment reference");
    }
    if (result.status === "paid") {
      if (soulmate) {
        const saved = await db.from(table).update({ payment_status: "paid", gateway_transaction_id: result.transactionId,
          paid_at: result.paidAt, delivery_due_at: new Date(Date.parse(result.paidAt!) + order.delivery_hours * 3600000).toISOString(),
          fulfillment_status: "queued", last_verified_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", id).neq("payment_status", "paid");
        if (saved.error) throw new Error("Unable to confirm Soulmate payment");
        order = await read();
        await Promise.allSettled([sendSoulmatePurchase(order as SoulmateOrder), confirmSoulmatePurchase(order as SoulmateOrder)]);
      } else {
        await provider.fulfillReports(order, result);
      }
    } else {
      const saved = await db.from(table).update({ payment_status: result.status }).eq("id", id).neq("payment_status", "paid");
      if (saved.error) throw new Error("Unable to save payment state");
    }
    return await read();
  } finally {
    const saved = await db.from(table).update({ gateway_check_until: new Date(Date.now() + 10000).toISOString(),
      [soulmate ? "last_verified_at" : "gateway_checked_at"]: new Date().toISOString() }).eq("id", id).eq("gateway_check_until", lease);
    if (saved.error) console.warn(`[${provider.id}] Verification lease awaits expiry`, { orderId: id });
  }
}
