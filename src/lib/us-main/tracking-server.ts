import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ORDER_TABLE, type UsOrder } from './server';
export function purchasePayloads(order:UsOrder){const a=order.attribution,m=a.marketing||{},value=(order.paid_amount_cents ?? order.amount_cents)/100,items=order.line_items.map((p,i)=>{const total=order.paid_amount_cents ?? order.amount_cents;const before=order.line_items.slice(0,i).reduce((sum,x)=>sum+x.cents,0);const cents=Math.round((before+p.cents)*total/order.amount_cents)-Math.round(before*total/order.amount_cents);return {item_id:p.id,item_name:p.name,price:cents/100,discount:(p.cents-cents)/100,quantity:1};});return {
 meta:{event_name:'Purchase',event_id:order.id,event_time:Math.floor(Date.parse(order.paid_at!)/1000),action_source:'website',event_source_url:'https://astrorekha.com/us/payment',user_data:{em:[crypto.createHash('sha256').update(order.customer_email).digest('hex')],...(m.fbc?{fbc:m.fbc}:{}),...(m.fbp?{fbp:m.fbp}:{}),...(a.userAgent?{client_user_agent:a.userAgent}:{})},custom_data:{value,currency:'USD',order_id:order.id,funnel:'us_main',content_ids:items.map(p=>p.item_id),content_type:'product'}},
 ga:{client_id:a.gaClientId,timestamp_micros:Date.parse(order.paid_at!)*1000,events:[{name:'purchase',params:{transaction_id:order.id,value,currency:'USD',funnel:'us_main',items,...(a.gaSessionId?{session_id:a.gaSessionId}:{}),engagement_time_msec:1}}]}
};}
/** Separate claims on us_main_orders; never writes to the main payments ledger. */
export async function sendUsPurchase(order: UsOrder) {
  if (process.env.US_MAIN_TRACKING_ENABLED !== "true" || process.env.VERCEL_ENV !== "production" || order.attribution?.trackingEnvironment !== "production" ||
      order.payment_mode !== "live" || order.payment_status !== "paid" || !order.paid_at ||
      !Number.isFinite(Date.parse(order.paid_at)) || order.amount_cents <= 0) return;
  const payloads = purchasePayloads(order);
  await Promise.allSettled((["meta", "ga"] as const).map(async (provider) => {
    const pixel = process.env.NEXT_PUBLIC_US_MAIN_META_PIXEL_ID;
    const token = process.env.US_MAIN_META_CAPI_ACCESS_TOKEN;
    const gaId = process.env.US_MAIN_GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_US_MAIN_GA_ID;
    const gaSecret = process.env.US_MAIN_GA4_API_SECRET;
    if (provider === "ga") {
      // GA can silently re-date older events. Do not turn historical sales into today's conversions.
      if (Date.now() - Date.parse(order.paid_at!) > 72 * 3600000) return;
      if (!gaId || !gaSecret || !order.attribution?.gaClientId) {
        console.warn("[us-main-tracking] GA purchase pending", { orderId: order.id, reason: !gaId || !gaSecret ? "missing_configuration" : "missing_client_id" });
        return;
      }
    } else if (!pixel || !token) return;
    const sent = `${provider}_purchase_sent_at`, claim = `${provider}_purchase_claimed_at`;
    const now = new Date().toISOString();
    const db = getSupabaseAdmin();
    const { data, error } = await db.from(ORDER_TABLE).update({ [claim]: now })
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
      const { error: stampError } = await db.from(ORDER_TABLE).update({ [sent]: new Date().toISOString(), [claim]: null }).eq("id", order.id).eq(claim, now);
      if (stampError) throw new Error("Unable to stamp event");
    } catch {
      console.warn("[us-main-tracking] Purchase delivery will retry", { provider, orderId: order.id });
    } finally {
      await db.from(ORDER_TABLE).update({ [claim]: null }).eq("id", order.id).eq(claim, now).is(sent, null);
    }
  }));
}
