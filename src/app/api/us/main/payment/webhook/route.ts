import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/us-soulmate-stripe';
import { readOrder } from '@/lib/us-main/server';
import { reconcileUsOrder } from '@/lib/us-main/reconcile';
export async function POST(req:NextRequest){
 const secret=process.env.US_MAIN_STRIPE_WEBHOOK_SECRET;
 if(!secret)return NextResponse.json({error:'Webhook not configured'},{status:503});
 const raw=await req.text();
 if(raw.length>1000000||!verifyStripeSignature(raw,req.headers.get('stripe-signature')||'',secret))return NextResponse.json({error:'Invalid signature'},{status:400});
 try{const event=JSON.parse(raw),s=event.data?.object;if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)||s?.metadata?.funnel!=='us_main')return NextResponse.json({received:true,ignored:true});
 const order=await readOrder(s.metadata.order_id);if(!order)return NextResponse.json({error:'Order not found'},{status:503});
 if(order.stripe_session_id!==s.id)return NextResponse.json({error:'Session not yet bound'},{status:503});
 await reconcileUsOrder(order);return NextResponse.json({received:true});}catch{return NextResponse.json({error:'Verification will be retried'},{status:503});}
}
