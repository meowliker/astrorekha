import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sanitizePaymentAttribution, type PaymentAttributionPayload } from "@/lib/attribution";

export const META_TRACKING_URL_PARAMETERS =
  "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&meta_campaign_id={{campaign.id}}&meta_adset_id={{adset.id}}&meta_ad_id={{ad.id}}";

export type MarketingEventName =
  | "page_view"
  | "landing_page_view"
  | "checkout_started"
  | "purchase_success"
  | "payment_failed"
  | "upsell_view"
  | "custom";

export type MarketingEventInput = {
  eventName: MarketingEventName | string;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  email?: string | null;
  route?: string | null;
  path?: string | null;
  url?: string | null;
  referrerUrl?: string | null;
  productType?: string | null;
  productId?: string | null;
  productName?: string | null;
  paymentId?: string | null;
  payuTxnId?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  attribution?: PaymentAttributionPayload | null;
  createdAt?: string | null;
};

function cleanText(value: unknown, maxLength = 512): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function createEventId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `mkt_${Date.now()}_${random}`;
}

export async function recordMarketingEvent(input: MarketingEventInput): Promise<boolean> {
  try {
    const attribution = sanitizePaymentAttribution(input.attribution || {});
    const nowIso = input.createdAt || new Date().toISOString();
    const amount = typeof input.amount === "number" && Number.isFinite(input.amount) ? Math.round(input.amount) : null;

    const row = {
      id: createEventId(),
      event_name: cleanText(input.eventName, 96) || "custom",
      visitor_id: cleanText(input.visitorId, 160),
      session_id: cleanText(input.sessionId, 160),
      user_id: cleanText(input.userId, 160),
      email: cleanText(input.email, 256)?.toLowerCase() || null,
      route: cleanText(input.route, 512),
      path: cleanText(input.path, 512),
      url: cleanText(input.url, 2048),
      referrer_url: cleanText(input.referrerUrl, 2048) || attribution.referrer_url || null,
      product_type: cleanText(input.productType, 128),
      product_id: cleanText(input.productId, 256),
      product_name: cleanText(input.productName, 512),
      payment_id: cleanText(input.paymentId, 256),
      payu_txn_id: cleanText(input.payuTxnId, 256),
      amount,
      currency: cleanText(input.currency, 16) || "INR",
      metadata: input.metadata || {},
      fbclid: attribution.fbclid || null,
      fbc: attribution.fbc || null,
      fbp: attribution.fbp || null,
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_term: attribution.utm_term || null,
      utm_content: attribution.utm_content || null,
      utm_id: attribution.utm_id || null,
      click_id: attribution.click_id || null,
      meta_campaign_id: attribution.meta_campaign_id || null,
      meta_adset_id: attribution.meta_adset_id || null,
      meta_ad_id: attribution.meta_ad_id || null,
      landing_path: attribution.landing_path || null,
      landing_url: attribution.landing_url || null,
      attribution_captured_at: attribution.captured_at || nowIso,
      created_at: nowIso,
    };

    const { error } = await getSupabaseAdmin().from("marketing_events").insert(row);
    if (error) {
      console.warn("[marketing-events] insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[marketing-events] record failed", error);
    return false;
  }
}
