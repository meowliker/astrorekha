import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type PurchaseOrder = {
  id: string;
  amount: number;
  bundle_id?: string | null;
  feature?: string | null;
  type?: string | null;
  utm_campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  fb_campaign_id?: string | null;
  fb_adset_id?: string | null;
  fb_ad_id?: string | null;
  ga_client_id?: string | null;
  ga_session_id?: string | null;
  ga_purchase_sent_at?: string | null;
};

/** Claim first, then send and stamp. A stale claim can be retried after five minutes. */
export async function sendGa4Purchase(order: PurchaseOrder, productName?: string | null): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret || order.ga_purchase_sent_at) return;

  const supabase = getSupabaseAdmin();
  const claimTime = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("payments")
    .update({ ga_purchase_claimed_at: claimTime })
    .eq("id", order.id)
    .is("ga_purchase_sent_at", null)
    .or(`ga_purchase_claimed_at.is.null,ga_purchase_claimed_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  const debug = process.env.GA4_MP_DEBUG === "true";
  const endpoint = debug ? "debug/mp/collect" : "mp/collect";
  const params = new URLSearchParams({ measurement_id: measurementId, api_secret: apiSecret });
  const itemId = order.bundle_id || order.feature || order.type || "purchase";
  const value = Number((order.amount / 100).toFixed(2)); // payments.amount is paise.
  const eventParams = {
    transaction_id: order.id,
    value,
    currency: "INR",
    ...(order.ga_session_id ? { session_id: order.ga_session_id } : {}),
    engagement_time_msec: 1,
    ...(order.utm_campaign ? { campaign: order.utm_campaign } : {}),
    ...(order.utm_source ? { source: order.utm_source } : {}),
    ...(order.utm_medium ? { medium: order.utm_medium } : {}),
    ...(order.utm_term ? { term: order.utm_term } : {}),
    ...(order.utm_content ? { content: order.utm_content } : {}),
    ...(order.fb_campaign_id ? { campaign_id: order.fb_campaign_id } : {}),
    ...(order.fb_adset_id ? { adset_id: order.fb_adset_id } : {}),
    ...(order.fb_ad_id ? { ad_id: order.fb_ad_id } : {}),
    items: [{ item_id: itemId, item_name: productName || itemId, price: value, quantity: 1 }],
  };

  try {
    const response = await fetch(`https://www.google-analytics.com/${endpoint}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: order.ga_client_id || `${crypto.randomInt(1, 2 ** 31)}.${Math.floor(Date.now() / 1000)}`,
        events: [{ name: "purchase", params: eventParams }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GA4 Measurement Protocol returned ${response.status}`);
    if (debug) {
      const validation = await response.json();
      console.info("[ga4-purchase] validation response", { orderId: order.id, validation });
      return; // The debug endpoint validates but does not collect a purchase.
    }
    const { error: stampError } = await supabase.from("payments")
      .update({ ga_purchase_sent_at: new Date().toISOString(), ga_purchase_claimed_at: null })
      .eq("id", order.id)
      .eq("ga_purchase_claimed_at", claimTime);
    if (stampError) throw stampError;
  } catch (error) {
    console.error("[ga4-purchase] Failed to send purchase", { orderId: order.id, error });
    throw error;
  } finally {
    // Release failed/debug attempts so the next verified callback can retry.
    await supabase.from("payments")
      .update({ ga_purchase_claimed_at: null })
      .eq("id", order.id)
      .eq("ga_purchase_claimed_at", claimTime)
      .is("ga_purchase_sent_at", null);
  }
}
