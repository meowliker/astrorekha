import {NextRequest,NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {ORDER_TABLE,stripeKey} from '@/lib/us-main/server';
import {reconcileUsOrder} from '@/lib/us-main/reconcile';
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.US_MAIN_STRIPE_SECRET_KEY)return NextResponse.json({inactive:true});
 try{
  const db=getSupabaseAdmin(),mode=stripeKey().mode;
  const pending=await db.from(ORDER_TABLE).select('*').eq('payment_mode',mode).eq('payment_status','pending').not('stripe_session_id','is',null).order('checked_at',{ascending:true,nullsFirst:true}).limit(20);
  if(pending.error)throw pending.error;
  const tracking=await db.from(ORDER_TABLE).select('*').eq('payment_mode',mode).eq('payment_status','paid').gte('paid_at',new Date(Date.now()-72*3600000).toISOString()).or('meta_purchase_sent_at.is.null,ga_purchase_sent_at.is.null').order('tracking_checked_at',{ascending:true,nullsFirst:true}).limit(20);
  if(tracking.error)throw tracking.error;
  let verified=0,errors=0;
  for(const o of [...pending.data,...tracking.data]){
   try{if((await reconcileUsOrder(o)).fulfilled_at)verified++;}catch{errors++;}
   // Fairly revisit deferred tracking even when a visitor blocked GA cookies.
   if(o.fulfilled_at)await db.from(ORDER_TABLE).update({tracking_checked_at:new Date().toISOString()}).eq('id',o.id);
  }
  return NextResponse.json({checked:pending.data.length+tracking.data.length,verified,errors});
 }catch{return NextResponse.json({error:'US reconciliation unavailable'},{status:503});}
}
