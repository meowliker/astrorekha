import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchPineLabsOrder, pineLabsConfig, pineLabsTimestamp, type PineLabsOrder } from "./pinelabs-api";
import { profitDay } from "./soulmate-profit";

export function validatePineLabsRefund(order: { gateway_order_id: string; amount: number }, refund: PineLabsOrder) {
  if (refund.type !== "REFUND" || refund.parent_order_id !== order.gateway_order_id || String(refund.merchant_id) !== pineLabsConfig().merchantId) throw new Error("Pine Labs refund identity mismatch");
  if (refund.status !== "PROCESSED") throw new Error("Pine Labs refund is not complete");
  const amount = refund.order_amount?.value;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > order.amount || refund.order_amount.currency !== "INR") throw new Error("Pine Labs refund amount mismatch");
  return { amount, occurredAt: pineLabsTimestamp(refund.updated_at), refundId: refund.order_id };
}
/** Refunds originate in the gateway dashboard. Only API-verified refunds reach finance. */
export async function recordPineLabsRefund(refund: PineLabsOrder, mode: string) {
  const db = getSupabaseAdmin({ fresh: true });
  const parent = await fetchPineLabsOrder(refund.parent_order_id || "", mode, true);
  if (String(parent.merchant_id) !== pineLabsConfig().merchantId || parent.type !== "CHARGE") throw new Error("Pine Labs refund parent mismatch");
  const soulmate = parent.merchant_order_reference.startsWith("sm_");
  const found = await db.from(soulmate ? "soulmate_orders" : "payments").select("*").eq("id", parent.merchant_order_reference).eq("gateway", "pinelabs").eq("payment_mode", mode).maybeSingle();
  if (found.error) throw new Error("Unable to read refund purchase");
  if (!found.data) return; // External payment links have no app entitlements or app revenue.
  const order = found.data;
  if (order.payment_status !== "paid") throw new Error("Original payment needs reconciliation before refund");
  const verified = validatePineLabsRefund(order, refund);
  const eventId = createHash("sha256").update(`pinelabs:${pineLabsConfig().merchantId}:${refund.order_id}`).digest("hex");
  if (soulmate && (mode !== "live" || order.attribution?.trackingEnvironment !== "production")) return;
  const attribution = Object.fromEntries(["first_touch", "last_touch", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "meta_campaign_id", "meta_adset_id", "meta_ad_id", "fb_campaign_id", "fb_adset_id", "fb_ad_id"].filter(key => order[key] !== undefined).map(key => [key, order[key]]));
  const row = soulmate ? { event_id: eventId, order_id: order.id, date: profitDay(Date.parse(verified.occurredAt)), occurred_at: verified.occurredAt,
    amount_paise: verified.amount, gst_paise: Math.round(verified.amount * order.gst_amount / order.amount) } : {
    id: `pay_refund_pnl_${eventId}`, ...attribution, user_id: order.user_id, customer_email: order.customer_email, amount: -verified.amount, currency: "INR",
    payment_status: "refunded", type: order.type, bundle_id: order.bundle_id, feature: order.feature, gateway: "pinelabs",
    gateway_order_id: refund.order_id, gateway_transaction_id: refund.order_id, payment_mode: mode, product_name: order.product_name,
    created_at: verified.occurredAt, paid_at: verified.occurredAt,
  };
  const saved = await db.from(soulmate ? "soulmate_refund_events" : "payments").upsert(row, { onConflict: soulmate ? "event_id" : "id", ignoreDuplicates: true });
  if (saved.error) throw new Error("Unable to save verified Pine Labs refund");
}
