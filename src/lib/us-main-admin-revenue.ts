import {filterSourcePayments,filterSourceEvents,type AdSource} from "./admin-acquisition";
import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'crypto';
import {buildRevenueDashboard,type PaymentRow,type OfferEvent,type resolveRevenueRange} from './revenue-dashboard';
import {usPricing} from './us-main/catalog';
import snapshot from './us-main/inr-catalog-snapshot.json';
import type {UsOrder} from './us-main/server';
export function usRevenuePayment(o:UsOrder):PaymentRow{
 const m=o.attribution?.marketing||{};
 return {id:o.id,payu_txn_id:o.id,user_id:o.user_id,customer_email:o.customer_email,type:o.type,bundle_id:o.bundle_id||o.line_items.map(x=>x.id).join('+'),feature:o.fulfillment_features.join('+'),amount:o.paid_amount_cents??o.amount_cents,capturedPaise:o.payment_status==='paid'?(o.paid_amount_cents??o.amount_cents):undefined,currency:o.currency,payment_status:o.payment_status,coins:o.fulfillment_coins,created_at:o.paid_at||o.created_at,fulfilled_at:o.fulfilled_at,...m};
}
export async function usRevenueReport(db:SupabaseClient,range:ReturnType<typeof resolveRevenueRange>,adSource:AdSource="all"){
 const orders:UsOrder[]=[],events:OfferEvent[]=[];
 // Read all US history for paid-order cohorts; cap explicitly instead of silently truncating.
 for(let offset=0;;offset+=1000){const r=await db.from('us_main_orders').select('*').eq('payment_mode','live').eq('attribution->>trackingEnvironment','production').order('created_at').order('id').range(offset,offset+999);if(r.error)throw new Error('US orders unavailable');orders.push(...r.data);if(r.data.length<1000)break;if(offset>=99000)throw new Error('US report history too large');}
 for(let offset=0;;offset+=1000){const r=await db.from('us_main_events').select('id,event_name,product_type,product_id,user_id,session_id,created_at,attribution,path').eq('environment','production').gte('created_at',range.from).lt('created_at',range.to).order('created_at').order('id').range(offset,offset+999);if(r.error)throw new Error('US events unavailable');events.push(...r.data.map(e=>({...e,visitor_id:e.session_id})));if(r.data.length<1000)break;if(offset>=99000)throw new Error('Choose fewer dates');}
 const [settings,refunds]=await Promise.all([db.from('us_main_settings').select('value').eq('key','prices_usd_cents').single(),db.from('us_main_refund_events').select('*').limit(10000)]);
 if(settings.error||refunds.error||refunds.data.length>=10000)throw new Error('US financial data unavailable');
 const prices=settings.data.value,payments=orders.map(usRevenuePayment),byId=new Map(payments.map(p=>[p.id,p]));
 for(const refund of refunds.data){const parent=byId.get(refund.order_id);if(parent)payments.push({...parent,id:refund.event_id,amount:refund.amount_paise,capturedPaise:undefined,refundPaise:refund.amount_paise,payment_status:'refunded',created_at:refund.occurred_at});}
 const pricing=usPricing(prices);pricing.reports=snapshot.reports.map(p=>({...p,price:(prices[p.id]||0)/100}));pricing.coinPackages=snapshot.coinPackages.map(p=>({...p,price:(prices[p.id]||0)/100}));
 // Account products are cataloged without attributing unrelated users' shared wallet usage.
 const report=buildRevenueDashboard({payments:filterSourcePayments(payments,adSource),events:filterSourceEvents(events,adSource),pricing,range,attribution:'last',currency:'USD',usage:null,warnings:['US AstroRekha live production orders only. Dates use IST midnight, as shown in the date control.','Refunds against selected orders reflect the last Profit Sheet refresh. The Profit Sheet instead groups refunds by refund date. Shared-account report usage is not attributed to a funnel.']});
 const version=createHash('sha256').update(JSON.stringify([payments,events,prices])).digest('hex');
 return {...report,adSource,snapshot:version+":"+adSource,generatedAt:new Date().toISOString()};
}
