import { soulmateItemName } from "./soulmate-product-names";
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import { SOULMATE_FUNNEL, SOULMATE_ORDERS_TABLE } from "./soulmate-orders";
import type { SoulmateOrder } from "./soulmate-payu";
import type { PaymentAttributionPayload } from "./attribution";

export type SoulmateAttribution = {
  gaClientId?: string | null; gaSessionId?: string | null;
  marketing?: PaymentAttributionPayload; sessionId?: string | null;
  trackingEnvironment?: string; userAgent?: string;
};
const hash = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
export function soulmatePurchasePayloads(order: SoulmateOrder) {
  const attribution = order.attribution || {};
  const marketing = attribution.marketing || {};
  const value = order.amount / 100;
  const itemId = `soulmate_${order.plan}`;
  const items = order.line_items?.length ? order.line_items.map((item) => ({ item_id: item.id, item_name: soulmateItemName(item), price: item.amount_paise / 100, quantity: item.quantity })) : [{ item_id: itemId, item_name: order.product_info, price: value, quantity: 1 }];
  const selections = order.entitlements ? { sketch_style: order.entitlements.sketch, delivery_type: order.entitlements.delivery, delivery_hours: order.entitlements.promised_hours, description_included: order.entitlements.description, timeline_included: order.entitlements.timeline } : {};
  return {
    meta: {
      event_name: "Purchase", event_id: order.id,
      event_time: Math.floor(Date.parse(order.paid_at!) / 1000), action_source: "website",
      event_source_url: "https://astrorekha.com/soulmate/payment",
      user_data: {
        em: [hash(order.customer_email.trim().toLowerCase())], ph: [hash(order.customer_phone.replace(/\D/g, ""))],
        ...(marketing.fbp ? { fbp: marketing.fbp } : {}), ...(marketing.fbc ? { fbc: marketing.fbc } : {}),
        ...(attribution.userAgent ? { client_user_agent: attribution.userAgent } : {}),
      },
      custom_data: { value, currency: "INR", content_ids: items.map((item) => item.item_id), contents: items.map((item) => ({ id: item.item_id, quantity: item.quantity, item_price: item.price })), ...selections, content_name: order.product_info, content_type: "product", order_id: order.id, funnel: SOULMATE_FUNNEL },
    },
    ga: {
      client_id: attribution.gaClientId,
      timestamp_micros: Date.parse(order.paid_at!) * 1000,
      events: [{ name: "purchase", params: {
        transaction_id: order.id, value, currency: "INR", funnel: SOULMATE_FUNNEL,
        ...(attribution.gaSessionId ? { session_id: attribution.gaSessionId } : {}), engagement_time_msec: 1,
        ...(marketing.utm_source ? { source: marketing.utm_source } : {}),
        ...(marketing.utm_medium ? { medium: marketing.utm_medium } : {}),
        ...(marketing.utm_campaign ? { campaign: marketing.utm_campaign } : {}),
        items, ...selections, tax: order.gst_amount / 100,
      } }],
    },
  };
}

/** Separate claims on soulmate_orders; never writes to the main payments ledger. */
export async function sendSoulmatePurchase(order: SoulmateOrder) {
  if (process.env.VERCEL_ENV !== "production" || order.attribution?.trackingEnvironment !== "production" ||
      order.payment_mode !== "live" || order.payment_status !== "paid" || !order.paid_at ||
      !Number.isFinite(Date.parse(order.paid_at)) || order.amount <= 0) return;
  const payloads = soulmatePurchasePayloads(order);
  await Promise.allSettled((["meta", "ga"] as const).map(async (provider) => {
    const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    const gaId = process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID;
    const gaSecret = process.env.GA4_API_SECRET;
    if (provider === "meta" ? !pixel || !token : !gaId || !gaSecret || !order.attribution?.gaClientId) return;
    const sent = `${provider}_purchase_sent_at`, claim = `${provider}_purchase_claimed_at`;
    const now = new Date().toISOString();
    const db = getSupabaseAdmin();
    const { data, error } = await db.from(SOULMATE_ORDERS_TABLE).update({ [claim]: now })
      .eq("id", order.id).eq("payment_status", "paid").eq("payment_mode", "live").is(sent, null)
      .or(`${claim}.is.null,${claim}.lt.${new Date(Date.now() - 5 * 60000).toISOString()}`).select("id").maybeSingle();
    if (error || !data) return;
    try {
      const url = provider === "meta"
        ? `https://graph.facebook.com/v26.0/${encodeURIComponent(pixel!)}/events`
        : `https://www.google-analytics.com/mp/collect?${new URLSearchParams({ measurement_id: gaId!, api_secret: gaSecret! })}`;
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", ...(provider === "meta" ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(provider === "meta" ? { data: [payloads.meta] } : payloads.ga), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Provider rejected event");
      if (provider === "meta" && (await response.json()).events_received !== 1) throw new Error("Meta did not accept event");
      const { error: stampError } = await db.from(SOULMATE_ORDERS_TABLE).update({ [sent]: new Date().toISOString(), [claim]: null }).eq("id", order.id).eq(claim, now);
      if (stampError) throw new Error("Unable to stamp event");
    } catch {
      console.warn("[soulmate-tracking] Purchase delivery will retry", { provider, orderId: order.id });
    } finally {
      await db.from(SOULMATE_ORDERS_TABLE).update({ [claim]: null }).eq("id", order.id).eq(claim, now).is(sent, null);
    }
  }));
}
