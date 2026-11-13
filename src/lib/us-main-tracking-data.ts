import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaAccountCredentialsFromSettings, type MetaAdAccountCredentialRange } from "./meta-ad-accounts";
import { selectedCampaignIds, type SoulmateCredential } from "./us-main-campaigns";
import { loadSoulmateProfitSettings } from "./us-main-profit-settings";
import type { TrackingPayment as BaseTrackingPayment } from "./tracking-dashboard";
import { parseTrackedUtmVisit, type TrackingUtmVisit } from "./tracking-utm-visits";
import type { PaymentAttributionPayload } from "./attribution";

type TrackingPayment = BaseTrackingPayment & { taxAmount: number };

export type SoulmateTrackingOrder = {
 id:string; customer_email:string; type:string; bundle_id:string|null;
 amount_cents:number; paid_amount_cents:number|null; payment_status:string; created_at:string; paid_at:string|null;
 line_items:{name:string}[]; attribution:{marketing?:PaymentAttributionPayload}|null;
};
const FIELDS="id,customer_email,type,bundle_id,amount_cents,paid_amount_cents,payment_status,created_at,paid_at,line_items,attribution";
export function trackingPayment(order:SoulmateTrackingOrder):TrackingPayment {
 const tags=order.attribution?.marketing||{};
 return {...tags,taxAmount:0,id:order.id,payu_txn_id:order.id,customer_email:order.customer_email,
 type:order.type,bundle_id:order.bundle_id,feature:order.line_items.map(x=>x.name).join(' + '),coins:null,
 amount:order.paid_amount_cents??order.amount_cents,payment_status:order.payment_status,created_at:order.created_at,fulfilled_at:order.paid_at,
 utm_source:tags.utm_source||null,utm_medium:tags.utm_medium||null,utm_campaign:tags.utm_campaign||null,utm_term:tags.utm_term||null,utm_content:tags.utm_content||null,
 meta_campaign_id:tags.meta_campaign_id||null,meta_adset_id:tags.meta_adset_id||null,meta_ad_id:tags.meta_ad_id||null,fb_campaign_id:null,fb_adset_id:null,fb_ad_id:null};
}
function productionOrders(db:SupabaseClient){return db.from('us_main_orders').select(FIELDS).eq('payment_mode','live').eq('attribution->>trackingEnvironment','production');}

export async function soulmatePaidPayments(db: SupabaseClient, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await productionOrders(db).eq("payment_status", "paid")
      .gte("paid_at", start).lt("paid_at", end).order("paid_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read US AstroRekha paid orders.");
    rows.push(...(data as SoulmateTrackingOrder[]).map(trackingPayment));
    if (data.length < 500) return rows;
  }
  throw new Error("Too many US AstroRekha orders. Choose fewer days.");
}

export async function soulmateTrackingParents(db: SupabaseClient, ids: string[]) {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await productionOrders(db).in("id", ids.slice(offset, offset + 200)).not("paid_at", "is", null);
    if (error) throw new Error("Unable to read refunded US AstroRekha orders.");
    rows.push(...(data as SoulmateTrackingOrder[]).map(trackingPayment));
  }
  return rows;
}

/** Use the isolated reconciled refund ledger, never the main payments table. */
export async function soulmateRefundPayments(db: SupabaseClient, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await db.from("us_main_refund_events").select("event_id,order_id,date,amount_paise,gst_paise,occurred_at")
      .gte("date", new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10))
      .lte("date", end.slice(0, 10)).order("date").order("event_id").range(offset, offset + 499);
    if (error) throw new Error("Unable to read US AstroRekha refunds.");
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
  return { rate: 1, source: "US AstroRekha USD reporting" };
}

/** Shared accounts are allowed; every credential carries an explicit campaign allowlist. */
export async function soulmateTrackingCredentials(db: SupabaseClient, range: MetaAdAccountCredentialRange): Promise<SoulmateCredential[]> {
  const settings = await loadSoulmateProfitSettings(db);
  if (!settings.accounts.length) return [];
  return getMetaAccountCredentialsFromSettings({ accounts: settings.accounts }, range).map((credential) => ({
    ...credential, campaignIds: selectedCampaignIds(settings.accounts.find((account) => account.accountId === credential.accountId)!),
  }));
}

export async function readSoulmateUtmVisits(db:SupabaseClient,start:string,end:string):Promise<TrackingUtmVisit[]> {
 const visits:TrackingUtmVisit[]=[];const seen=new Set<string>();
 for(let offset=0;offset<100000;offset+=1000){
  const {data,error}=await db.from('us_main_events').select('id,created_at,session_id,path,attribution').eq('environment','production').eq('event_name','page_view').eq('path','/us').gte('created_at',start).lt('created_at',end).order('created_at').order('id').range(offset,offset+999);
  if(error)throw new Error('Unable to read US main arrivals');
  for(const row of data){const tags=row.attribution||{};const url=new URL('https://astrorekha.com/us');for(const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','meta_campaign_id','meta_adset_id','meta_ad_id','gclid','gbraid','wbraid','gad_campaignid'])if(tags[key])url.searchParams.set(key,String(tags[key]));
   const visit=parseTrackedUtmVisit({created_at:row.created_at,url:url.href});
   const key=`${row.session_id}:${visit?.campaignId}:${visit?.campaignName}`;if(visit&&!seen.has(key)){seen.add(key);visits.push(visit);}
  }
  if(data.length<1000)return visits;
 }throw new Error('Choose a smaller US arrivals range');
}
