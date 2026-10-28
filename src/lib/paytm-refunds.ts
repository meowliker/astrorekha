import { isPaytmOrderId } from "./paytm-order-id";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { fetchPaytmRefundStatus, listPaytmRefunds, paytmConfig, validatePaytmRefund } from "./paytm-api";
import { profitDay } from "./soulmate-profit";

/** Read-only at Paytm: records confirmed refunds issued from the merchant dashboard. */
export async function syncPaytmRefunds() {
  const db = getSupabaseAdmin({ fresh: true });
  const { mid, mode } = paytmConfig();
  const end = new Date(), start = new Date(end.getTime() - 29 * 86400000);
  let saved = 0;
  for (let page = 1; page <= 400; page++) {
    const candidates = await listPaytmRefunds(start, end, page);
    for (const candidate of candidates) {
      if (Date.now() - end.getTime() > 80000) return { saved, complete: false };
      if (candidate.mid !== mid || !isPaytmOrderId(candidate.orderId)) continue;
      const soulmate = candidate.orderId.startsWith("sm_");
      const orderResult = await db.from(soulmate ? "soulmate_orders" : "payments").select("*")
        .eq("id", candidate.orderId).eq("gateway", "paytm").eq("payment_mode", mode).eq("payment_status", "paid").maybeSingle();
      if (orderResult.error) throw new Error("Unable to read refund's original order");
      const order = orderResult.data;
      if (!order) continue;
      const eventId = createHash("sha256").update(`paytm:${mid}:${candidate.refundId}`).digest("hex");
      const table = soulmate ? "soulmate_refund_events" : "payments";
      const idKey = soulmate ? "event_id" : "id", id = soulmate ? eventId : `pay_refund_ptm_${eventId}`;
      const existing = await db.from(table).select(idKey).eq(idKey, id).maybeSingle();
      if (existing.error) throw new Error("Unable to check saved refund");
      if (existing.data) continue;
      const refund = validatePaytmRefund(order, candidate.refId, await fetchPaytmRefundStatus(order.id, candidate.refId));
      if (!refund) continue;
      if (refund.refundId !== candidate.refundId) throw new Error("Refund discovery reference mismatch");
      if (soulmate && (mode !== "live" || order.attribution?.trackingEnvironment !== "production")) continue;
      const attribution = Object.fromEntries(["first_touch", "last_touch", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "meta_campaign_id", "meta_adset_id", "meta_ad_id", "fb_campaign_id", "fb_adset_id", "fb_ad_id"].filter(key => order[key] !== undefined).map(key => [key, order[key]]));
      const row = soulmate ? { event_id: id, order_id: order.id, date: profitDay(Date.parse(refund.occurredAt)),
        occurred_at: refund.occurredAt, amount_paise: refund.amount, gst_paise: Math.round(refund.amount * order.gst_amount / order.amount) } : {
        id, ...attribution, user_id: order.user_id, customer_email: order.customer_email, amount: -refund.amount, currency: "INR",
        payment_status: "refunded", type: order.type, bundle_id: order.bundle_id, feature: order.feature,
        gateway: "paytm", gateway_order_id: `refund_${refund.refundId}`, gateway_transaction_id: refund.refundId,
        payment_mode: mode, product_name: order.product_name, created_at: refund.occurredAt, paid_at: refund.occurredAt,
      };
      const stored = await db.from(table).upsert(row, { onConflict: idKey, ignoreDuplicates: true });
      if (stored.error) throw new Error("Unable to save verified refund");
      saved++;
    }
    if (candidates.length < 50) return { saved, complete: true };
  }
  throw new Error("Paytm refund list exceeds the supported reporting range");
}
