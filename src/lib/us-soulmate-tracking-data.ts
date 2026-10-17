import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaAccountCredentialsFromSettings, getMetaAdAccountIdsFromEnv, type MetaAdAccountCredentialRange } from "./meta-ad-accounts";
import { loadSoulmateProfitSettings } from "./us-soulmate-profit-settings";
import type { TrackingPayment as BaseTrackingPayment } from "./tracking-dashboard";
import { parseTrackedUtmVisit, type TrackingUtmVisit } from "./tracking-utm-visits";
import type { PaymentAttributionPayload } from "./attribution";

type TrackingPayment = BaseTrackingPayment & { taxAmount: number };

export type SoulmateTrackingOrder = {
  id: string; customer_email: string; plan: string; product_info: string;
  amount: number; gst_amount?: number; payment_status: string; payment_mode: string; funnel: string;
  created_at: string; paid_at: string | null;
  attribution: { trackingEnvironment?: string; marketing?: PaymentAttributionPayload } | null;
};
const FIELDS = "id,customer_email,plan,product_info,amount,gst_amount,payment_status,payment_mode,funnel,created_at,paid_at,attribution";

export function trackingPayment(order: SoulmateTrackingOrder): TrackingPayment {
  const tags = order.attribution?.marketing || {};
  return {
    taxAmount: order.gst_amount || 0,
    id: order.id, payu_txn_id: order.id, customer_email: order.customer_email,
    type: order.plan === "express" ? "Bundle" : "Sketch", bundle_id: null,
    feature: order.product_info, coins: null, amount: order.amount,
    payment_status: order.payment_status, created_at: order.created_at, fulfilled_at: order.paid_at,
    utm_source: tags.utm_source || null, utm_medium: tags.utm_medium || null,
    utm_campaign: tags.utm_campaign || null, utm_term: tags.utm_term || null, utm_content: tags.utm_content || null,
    meta_campaign_id: tags.meta_campaign_id || null, meta_adset_id: tags.meta_adset_id || null, meta_ad_id: tags.meta_ad_id || null,
    fb_campaign_id: null, fb_adset_id: null, fb_ad_id: null,
  };
}

function productionOrders(db: SupabaseClient) {
  return db.from("us_soulmate_orders").select(FIELDS).eq("funnel", "us_soulmate_standalone")
    .eq("payment_mode", "live").eq("attribution->>trackingEnvironment", "production");
}

export async function soulmatePaidPayments(db: SupabaseClient, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await productionOrders(db).eq("payment_status", "paid")
      .gte("paid_at", start).lt("paid_at", end).order("paid_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read Soulmate paid orders.");
    rows.push(...(data as SoulmateTrackingOrder[]).map(trackingPayment));
    if (data.length < 500) return rows;
  }
  throw new Error("Too many Soulmate orders. Choose fewer days.");
}

export async function soulmateTrackingParents(db: SupabaseClient, ids: string[]) {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await productionOrders(db).in("id", ids.slice(offset, offset + 200)).not("paid_at", "is", null);
    if (error) throw new Error("Unable to read refunded Soulmate orders.");
    rows.push(...(data as SoulmateTrackingOrder[]).map(trackingPayment));
  }
  return rows;
}

/** Use the isolated reconciled refund ledger, never the main payments table. */
export async function soulmateRefundPayments(db: SupabaseClient, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await db.from("us_soulmate_refund_events").select("event_id,order_id,date,amount_paise,gst_paise,occurred_at")
      .gte("date", new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10))
      .lte("date", end.slice(0, 10)).order("date").order("event_id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read Soulmate refunds.");
    const parents = new Map((await soulmateTrackingParents(db, data.map((row) => row.order_id))).map((row) => [row.id, row]));
    for (const row of data) {
      // Legacy ledger stores the business day, not the gateway event timestamp.
      // Keep this approximation explicit in the dashboard warning.
      const at = row.occurred_at ? new Date(row.occurred_at).toISOString() : `${row.date}T06:00:00.000Z`;
      const parent = parents.get(row.order_id);
      if (parent && at >= start && at < end) rows.push({ ...parent, id: row.event_id,
        taxAmount: row.gst_paise || 0, payu_txn_id: row.order_id, amount: row.amount_paise, payment_status: "refund", created_at: at, fulfilled_at: row.occurred_at || null });
    }
    if (data.length < 500) return rows;
  }
  throw new Error("Too many refunds. Choose fewer days.");
}

export async function soulmateTrackingRate(db: SupabaseClient) {
  await loadSoulmateProfitSettings(db);
  return { rate: 1, source: "US Soulmate USD reporting" };
}

/** No normal-flow account/token fallback. Reject shared accounts rather than mix metrics or permit shared ad edits. */
export async function soulmateTrackingCredentials(db: SupabaseClient, range: MetaAdAccountCredentialRange) {
  const settings = await loadSoulmateProfitSettings(db);
  if (!settings.accounts.length) return [];
  const { data, error } = await db.from("settings").select("value").eq("key", "meta_ad_accounts").maybeSingle();
  if (error) throw new Error("Unable to verify ad-account isolation.");
  const mainIds = new Set(getMetaAdAccountIdsFromEnv());
  const india = await db.from("soulmate_admin_settings").select("accounts").eq("id", true).single();
  if (india.error) throw new Error("Unable to verify India Soulmate account isolation.");
  for (const account of india.data?.accounts || []) mainIds.add(String(account.accountId || "").replace(/^act_/i, ""));
  for (const account of data?.value?.accounts || []) mainIds.add(String(account.accountId || "").replace(/^act_/i, ""));
  if (settings.accounts.some((account) => mainIds.has(account.accountId))) {
    throw new Error("A US Soulmate ad account is also connected to the main or India Soulmate flow. Connect separate US accounts to keep tracking and ad edits isolated.");
  }
  return getMetaAccountCredentialsFromSettings({ accounts: settings.accounts }, range);
}

type SoulmateLanding = {
  created_at: string; session_id: string | null; url: string | null; landing_url: string | null;
  utm_source: string | null; utm_campaign: string | null; utm_term: string | null; utm_content: string | null;
  meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null;
};
export function soulmateLandingVisit(row: SoulmateLanding): TrackingUtmVisit | null {
  if (row.url) return parseTrackedUtmVisit(row);
  // Historical events did not store the arrival URL. Only use their saved attribution
  // if its landing was inside this funnel, never a normal-flow landing cookie.
  try {
    const landing = new URL(row.landing_url || "");
    if (!["astrorekha.com", "www.astrorekha.com"].includes(landing.hostname) || !/^\/us\/soulmate(?:\/|$)/.test(landing.pathname)) return null;
    return parseTrackedUtmVisit({ created_at: row.created_at, url: landing.href });
  } catch { return null; }
}

export async function readSoulmateUtmVisits(db: SupabaseClient, start: string, end: string): Promise<TrackingUtmVisit[]> {
  const visits: TrackingUtmVisit[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db.from("us_soulmate_marketing_events")
      .select("created_at,session_id,url,landing_url,utm_source,utm_campaign,utm_term,utm_content,meta_campaign_id,meta_adset_id,meta_ad_id")
      .eq("product_type", "us_soulmate_standalone").eq("event_name", "us_soulmate_landing_view")
      .gte("created_at", start).lt("created_at", end).order("created_at").order("id").range(offset, offset + 999);
    if (error) throw new Error("Unable to read Soulmate UTM visits.");
    for (const row of data as SoulmateLanding[]) {
      const visit = soulmateLandingVisit(row);
      if (!visit) continue;
      const key = `${row.session_id || row.created_at}:${visit.campaignId}:${visit.campaignName}:${visit.adsetId}:${visit.adId}`;
      if (seen.has(key)) continue;
      seen.add(key); visits.push(visit);
    }
    if (data.length < 1000) return visits;
  }
  throw new Error("Too many Soulmate UTM visits. Choose fewer days.");
}
