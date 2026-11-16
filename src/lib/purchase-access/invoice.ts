import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { buildCombinedOrderInvoice, type OrderInvoice } from '@/lib/order-invoice';
import type { AccessEmail } from './email';

/** Reuse the existing INR invoice. US receipts use captured USD totals, including discounts. */
export async function purchaseInvoice(row: AccessEmail): Promise<OrderInvoice> {
  if (row.invoice_snapshot) return row.invoice_snapshot;
  if (row.source === 'IN') {
    const invoice = await buildCombinedOrderInvoice([row.order_id]);
    if (invoice.customer.userId !== row.user_id || invoice.customer.email.toLowerCase() !== row.email || Math.round(invoice.total * 100) !== Number(row.amount_minor)) throw new Error('Invoice identity/amount mismatch');
    return invoice;
  }
  const {data:order,error}=await getSupabaseAdmin().from('us_main_orders').select('*').eq('id',row.order_id).eq('user_id',row.user_id).maybeSingle();
  if(error || !order || order.payment_status!=='paid' || !order.fulfilled_at || Number(order.paid_amount_cents??order.amount_cents)!==Number(row.amount_minor))throw new Error('Verified invoice unavailable');
  const amount=Number(row.amount_minor), subtotal=Number(order.amount_cents);let before=0;
  const items=(order.line_items as {name:string;cents:number}[]).map(item=>{const prior=Math.round(before*amount/subtotal);before+=item.cents;return {name:item.name,quantity:1,amount:(Math.round(before*amount/subtotal)-prior)/100,txnId:order.id,paymentId:order.stripe_payment_id};});
  if(!items.length||Math.round(items.reduce((sum,item)=>sum+item.amount,0)*100)!==amount)throw new Error('Invoice lines do not match payment');
  return {invoiceNumber:`AR-US-${order.id}`,invoiceDate:order.paid_at||order.fulfilled_at,customer:{userId:row.user_id,email:row.email},payment:{status:'paid',type:order.type,gateway:'Stripe',txnId:order.id,paymentId:order.stripe_payment_id||'',paidAt:order.paid_at||order.fulfilled_at},items,subtotal:amount/100,taxLines:[],total:amount/100,currency:'USD',deliveryStatus:'Completed digitally in-app'};
}

/** The browser confirmation and background worker share one delivery ledger. */
export async function queueInvoiceConfirmation(invoice: OrderInvoice): Promise<boolean> {
  const db=getSupabaseAdmin();
  const {data:config,error}=await db.from('purchase_access_config').select('enabled,starts_at').eq('id',true).maybeSingle();
  if(error){
    if(['42P01','PGRST205'].includes(error.code))return false; // Code-before-migration compatibility.
    throw new Error('Confirmation queue unavailable');
  }
  if(!config?.enabled || invoice.currency!=='INR' || invoice.total<=0 || Date.parse(invoice.payment.paidAt)<Date.parse(config.starts_at))return false;
  const queued=await db.rpc('enqueue_purchase_access_emails');
  if(queued.error)throw new Error('Unable to queue invoice confirmation');
  return true;
}
