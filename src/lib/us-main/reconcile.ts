import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ORDER_TABLE, readOrder, stripe, stripeKey, type UsOrder } from './server';
import { sendUsPurchase } from './tracking-server';
type Intent = {id:string;status:string;currency:string;amount_received:number;livemode:boolean;metadata:Record<string,string>;latest_charge:{id:string;paid:boolean;captured:boolean;amount:number;currency:string;created:number}};
export type CheckoutSession = {id:string;mode:string;client_reference_id:string;metadata:Record<string,string>;currency:string;amount_total:number;amount_subtotal?:number;total_details?:{amount_discount:number;amount_tax:number;amount_shipping:number};livemode:boolean;payment_status:string;status:string;payment_intent:Intent|null};
export function verifyUsSession(order: UsOrder, s: CheckoutSession) {
  if (s.id!==order.stripe_session_id || s.mode!=='payment' || s.client_reference_id!==order.id || s.metadata?.order_id!==order.id || s.metadata?.funnel!=='us_main' || s.currency!=='usd' || s.livemode!==(order.payment_mode==='live')) throw new Error('Stripe session does not match US purchase');
  const subtotal=s.amount_subtotal ?? s.amount_total;
  const discount=s.total_details?.amount_discount ?? 0;
  if(subtotal!==order.amount_cents || !Number.isSafeInteger(s.amount_total) || !Number.isSafeInteger(discount) || discount<0 || discount>subtotal || s.amount_total!==subtotal-discount || (s.total_details?.amount_tax||0)!==0 || (s.total_details?.amount_shipping||0)!==0) throw new Error('Stripe discount does not match US purchase');
  if(s.status==='complete' && s.payment_status==='no_payment_required' && s.amount_total===0 && !s.payment_intent) {
    return {intent:null,charge:null,amount:0,paidAt:new Date().toISOString()};
  }
  if (s.payment_status!=='paid') return null;
  if(s.status!=='complete' || s.amount_total<=0) throw new Error('US checkout not completed');
  const p=s.payment_intent;
  if (!p || p.status!=='succeeded' || p.currency!=='usd' || p.amount_received!==s.amount_total || p.metadata?.order_id!==order.id || p.metadata?.funnel!=='us_main' || p.livemode!==s.livemode || !p.id) throw new Error('Stripe payment does not match US purchase');
  const c=p.latest_charge;
  if (!c?.id || !c.paid || !c.captured || c.currency!=='usd' || c.amount!==s.amount_total || !Number.isFinite(c.created) || c.created*1000>Date.now()+60000) throw new Error('US charge not captured');
  return {intent:p.id,charge:c.id,amount:s.amount_total,paidAt:new Date(c.created*1000).toISOString()};
}
export async function reconcileUsOrder(order: UsOrder) {
  if (!order.fulfilled_at && order.stripe_session_id) {
    if (order.payment_mode!==stripeKey().mode) throw new Error('Stripe environment mismatch');
    const s: CheckoutSession=await stripe(`/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}?expand[]=payment_intent.latest_charge`);
    const verified=verifyUsSession(order,s);
    if (verified) {
      const r=await getSupabaseAdmin().rpc('fulfill_us_main_order',{p_order:order.id,p_session:s.id,p_intent:verified.intent,p_charge:verified.charge,p_amount:verified.amount,p_paid_at:verified.paidAt});
      if(r.error) throw new Error('Unable to fulfill US purchase');
    } else {
      const r=await getSupabaseAdmin().from(ORDER_TABLE).update({checked_at:new Date().toISOString(),payment_status:s.status==='expired'?'failed':'pending'}).eq('id',order.id).is('fulfilled_at',null);
      if(r.error) throw new Error('Unable to save payment status');
    }
    order=(await readOrder(order.id))!;
  }
  if(order.fulfilled_at) await sendUsPurchase(order);
  return order;
}
