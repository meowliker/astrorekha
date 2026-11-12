import {usExperiment} from '@/lib/us-main/experiments';
import {reportSessionUser} from '@/lib/report-session';
import {customerMarket} from '@/lib/customer-market';
import {quoteAccountProduct,type AccountPurchaseType} from '@/lib/us-main/account-catalog';
import crypto from 'crypto';
import { validateUsTestPromo, US_TEST_PROMO_TAG } from '@/lib/us-main/test-promo';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sanitizePaymentAttribution } from '@/lib/attribution';
import { normalizeBirthDetailsSnapshot } from '@/lib/birth-details';
import { soulmateGaIdentity } from '@/lib/us-soulmate-ga-identity';
import { quoteUsBasket } from '@/lib/us-main/catalog';
import { checkoutOrigin, sameOrigin, enabled, ORDER_TABLE, ownedOrder, ownerToken, ownerHash, readPrices, setOwner, stripe, stripeKey, type UsOrder } from '@/lib/us-main/server';
export async function POST(req:NextRequest) {
  if(!sameOrigin(req)) return NextResponse.json({error:'Invalid origin'},{status:403});
  if(!enabled()) return NextResponse.json({error:'US checkout is not enabled yet'},{status:503});
  try {
    if(Number(req.headers.get('content-length')||0)>30000) return NextResponse.json({error:'Request too large'},{status:413});
    const raw=await req.text();
    if(Buffer.byteLength(raw,'utf8')>30000)return NextResponse.json({error:'Request too large'},{status:413});
    const body=JSON.parse(raw);
    const accountPurchase=['report','coins','chat_pass'].includes(body.type);
    const uid=accountPurchase?reportSessionUser(req):null;
    let account:{id:string;email:string;unlocked_features:Record<string,boolean>}|null=null;
    if(accountPurchase){
      if(!uid)return NextResponse.json({error:'Please sign in before purchasing.'},{status:401});
      if(await customerMarket(uid)!=='US')return NextResponse.json({error:'USD checkout is only available for US accounts.'},{status:403});
      const user=await getSupabaseAdmin().from('users').select('id,email,unlocked_features').eq('id',uid).single();
      if(user.error||!user.data)throw new Error('Account unavailable');account=user.data;
    }
    const email=account?account.email.toLowerCase():typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !/^[a-f0-9-]{36}$/.test(body.requestKey||'')) return NextResponse.json({error:'Valid email and checkout reference required'},{status:400});
    const type=accountPurchase?body.type as AccountPurchaseType:body.type==='upsell'?'upsell':'bundle';
    const prices=await readPrices();
    const quote=accountPurchase?quoteAccountProduct(type as AccountPurchaseType,body.productId,prices):quoteUsBasket(type==='bundle'?[body.bundleId]:body.offerIds,type as 'bundle'|'upsell',prices);
    let testPromo=false;
    try { testPromo=await validateUsTestPromo(body.promoCode,type,quote.cents); }
    catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to check testing code'},{status:400}); }
    if(type==='report'&&account&&quote.features.every(f=>account!.unlocked_features?.[f]))return NextResponse.json({error:'This report is already unlocked. Refresh your reports.'},{status:409});
    const parent=type==='upsell'?await ownedOrder(req,body.parentOrderId):null;
    if(type==='upsell' && (!parent?.fulfilled_at || parent.type!=='bundle' || parent.customer_email!==email)) return NextResponse.json({error:'A verified US bundle purchase is required'},{status:403});
    const token=ownerToken(req);
    if(!token)return NextResponse.json({error:'Please reload the pricing page before checkout.'},{status:409});
    const hash=ownerHash(token), db=getSupabaseAdmin();
    const existing=await db.from(ORDER_TABLE).select('*').eq('owner_hash',hash).eq('request_key',body.requestKey).maybeSingle();
    if(existing.error) throw new Error('US order storage unavailable');
    let order:UsOrder=existing.data;
    if(order && (order.customer_email!==email || order.type!==type || Boolean(order.attribution.testPromotion)!==testPromo || order.amount_cents!==quote.cents || order.line_items.map(p=>p.id).join(',')!==quote.lines.map(p=>p.id).join(','))) return NextResponse.json({error:'Checkout reference belongs to another basket'},{status:409});
    if(!order) {
      const {count,error}=await db.from(ORDER_TABLE).select('id',{count:'exact',head:true}).eq('owner_hash',hash).gte('created_at',new Date(Date.now()-3600000).toISOString());
      if(error) throw new Error('US order storage unavailable');
      if((count||0)>=12) return NextResponse.json({error:'Too many checkouts. Please wait before trying again.'},{status:429});
      const experiment=type==='bundle'?await usExperiment(hash):null;
      const result=await db.from(ORDER_TABLE).insert({id:`us_ar_${crypto.randomBytes(12).toString('hex')}`,owner_hash:hash,request_key:body.requestKey,user_id:account?.id||null,customer_email:email,customer_name:String(body.firstName||'Customer').slice(0,100),type,bundle_id:type==='bundle'?body.bundleId:accountPurchase?body.productId:null,parent_order_id:parent?.id||null,amount_cents:quote.cents,currency:'USD',payment_mode:stripeKey().mode,line_items:quote.lines,fulfillment_features:quote.features,fulfillment_coins:quote.coins,birth_details:normalizeBirthDetailsSnapshot(body.birthDetails||{},'us_main')||{},attribution:{...(experiment?{experiment}:{}),...(testPromo?{testPromotion:US_TEST_PROMO_TAG}:{}),marketing:sanitizePaymentAttribution(body.attribution?.marketing||{}),...soulmateGaIdentity(body.attribution),trackingEnvironment:process.env.VERCEL_ENV||'local',userAgent:(req.headers.get('user-agent')||'').slice(0,512)}}).select('*').single();
      if(result.error?.code==='23505') { const raced=await db.from(ORDER_TABLE).select('*').eq('owner_hash',hash).eq('request_key',body.requestKey).single(); if(raced.error) throw new Error('Unable to recover checkout'); order=raced.data; }
      else { if(result.error) throw new Error('Unable to create US order'); order=result.data; }
    }
    if((account&&order.user_id!==account.id) || order.customer_email!==email || order.type!==type || order.parent_order_id!==(parent?.id||null) || Boolean(order.attribution.testPromotion)!==testPromo || order.amount_cents!==quote.cents || order.line_items.map(p=>p.id).join(',')!==quote.lines.map(p=>p.id).join(',')) return NextResponse.json({error:'Checkout reference belongs to another basket'},{status:409});
    if(order.fulfilled_at) return setOwner(NextResponse.json({orderId:order.id,url:`/us/payment?order=${order.id}`}),token);
    const origin=checkoutOrigin(req);
    const params=new URLSearchParams({mode:'payment',allow_promotion_codes:'true','adaptive_pricing[enabled]':'false',customer_email:order.customer_email,client_reference_id:order.id,success_url:`${origin}/us/payment?order=${order.id}`,cancel_url:`${origin}/us/payment?order=${order.id}&cancelled=1`,'payment_method_types[0]':'card','metadata[funnel]':'us_main','metadata[order_id]':order.id,'payment_intent_data[metadata][funnel]':'us_main','payment_intent_data[metadata][order_id]':order.id});
    order.line_items.forEach((p,i)=>{params.set(`line_items[${i}][price_data][currency]`,'usd');params.set(`line_items[${i}][price_data][unit_amount]`,String(p.cents));params.set(`line_items[${i}][price_data][product_data][name]`,p.name);params.set(`line_items[${i}][quantity]`,'1');});
    if(testPromo && !order.stripe_session_id) {
      // The reusable app code never grants access: Stripe must still capture $1.
      const coupon=await stripe('/coupons',new URLSearchParams({
        amount_off:String(order.amount_cents-100),currency:'usd',duration:'once',max_redemptions:'1',
        name:'US bundle testing discount','metadata[order_id]':order.id,
      }),`us-main-test-coupon-${order.id}`);
      if(typeof coupon.id!=='string' || coupon.amount_off!==order.amount_cents-100 || coupon.currency!=='usd') throw new Error('Testing discount mismatch');
      params.delete('allow_promotion_codes');
      params.set('discounts[0][coupon]',coupon.id);
    }
    const session=order.stripe_session_id?await stripe(`/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`):await stripe('/checkout/sessions',params,`us-main-checkout-${order.id}`);
    if(session.metadata?.order_id!==order.id || session.metadata?.funnel!=='us_main' || (session.amount_subtotal ?? session.amount_total)!==order.amount_cents || session.currency!=='usd' || session.livemode!==(order.payment_mode==='live')) throw new Error('Checkout mismatch');
    if(testPromo && session.amount_total!==100) throw new Error('Testing checkout total mismatch');
    const saved=await db.from(ORDER_TABLE).update({stripe_session_id:session.id}).eq('id',order.id).is('stripe_session_id',null);
    if(saved.error) throw new Error('Unable to save checkout');
    if(session.status!=='open') return setOwner(NextResponse.json({orderId:order.id,url:`/us/payment?order=${order.id}`}),token);
    if(typeof session.url!=='string'||new URL(session.url).hostname!=='checkout.stripe.com') throw new Error('Invalid Stripe checkout URL');
    return setOwner(NextResponse.json({orderId:order.id,url:session.url,amount:session.amount_total/100,currency:'USD'}),token);
  } catch(e) { console.error('[us-main checkout]',e instanceof Error?e.message:'Unavailable'); return NextResponse.json({error:e instanceof Error&&e.message.includes('pricing')?e.message:'Unable to start US checkout. Please try again.'},{status:503}); }
}
