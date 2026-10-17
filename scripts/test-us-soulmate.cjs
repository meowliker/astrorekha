/* Offline contract tests. Stripe, email and database calls are fixtures, never real payments. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name,parent,...rest) { return resolve.call(this,name.startsWith('@/') ? path.join(__dirname,'../src',name.slice(2)) : name,parent,...rest); };
for (const [key,value] of Object.entries({STANDARD:'37',EXPRESS:'67',DESCRIPTION:'67',COLOUR:'37',PRIORITY:'29.95',TIMELINE:'19'})) process.env['NEXT_PUBLIC_US_SOULMATE_PRICE_'+key]=value;
process.env.US_SOULMATE_STRIPE_SECRET_KEY='sk_test_fixture';
process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY='pk_test_fixture';
process.env.US_SOULMATE_STRIPE_MODE='test';
process.env.US_SOULMATE_RECEIPT_SECRET='a'.repeat(40);
process.env.US_SOULMATE_STRIPE_WEBHOOK_SECRET='whsec_fixture';
const orders=new Map(); let calls=[], failInsert=false, failSave=false, session=null, confirmations=0, conversions=0;
function stub(file,exports) { require.cache[require.resolve(file)]={id:require.resolve(file),filename:require.resolve(file),loaded:true,exports}; }
const db={async rpc(name,args) { if(name==='finalize_us_soulmate_promotion') { const o=orders.get(args.p_order); assert.ok(o); Object.assign(o,{stripe_session_id:args.p_session,discount_amount:args.p_discount,gst_amount:args.p_tax,amount:args.p_total,promotion_code:args.p_code,promotion_snapshot:args.p_snapshot}); return {error:null}; } assert.equal(name,'save_us_soulmate_session'); return {data:true,error:null}; },from(table) {
  assert.equal(table,'us_soulmate_orders','Must never access either older ledger');
  let op='read',value,filters=[];
  const q={select(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},single(){return run()},maybeSingle(){return run()},then(ok,bad){return run().then(ok,bad)}};
  async function run(){
    if(op==='insert') {if(failInsert)return{error:{code:'error'}};if([...orders.values()].some(r=>r.checkout_key===value.checkout_key))return{error:{code:'23505'}};const r={payment_status:'created',stripe_session_id:null,paid_at:null,delivery_due_at:null,...value};orders.set(r.id,r);return{data:{...r}};}
    const r=[...orders.values()].find(r=>filters.every(f=>f(r)));
    if(op==='update' && failSave)return{error:{code:'error'}};
    if(op==='update'&&r) Object.assign(r,value);
    return{data:r?{...r}:null};
  }return q;
}};
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>db});
stub('../src/lib/us-soulmate-invoice',{confirmSoulmatePurchase:async()=>{confirmations++}});
stub('../src/lib/us-soulmate-purchase-tracking',{sendSoulmatePurchase:async()=>{conversions++}});
const {NextRequest}=require('next/server');
const checkout=require('../src/app/api/us/soulmate/checkout/route');
const webhook=require('../src/app/api/us/soulmate/payment/webhook/route');
const status=require('../src/app/api/us/soulmate/payment/status/route');
const stripe=require('../src/lib/us-soulmate-stripe');
const cart=require('../src/lib/us-soulmate-cart');
const answers={name:'Maya',heart:'I feel like I’ve been waiting forever',preferenceSelection:'I like men',preference:'I like men',feeling:'Safe — someone who stays',birthDate:'1995-01-01',ethnicity:'White'};
const body=(extra={})=>({plan:'standard',answers,email:'maya@example.com',checkoutKey:crypto.randomUUID(),...extra});
const req=(data,origin='https://example.com')=>new NextRequest('https://example.com/api/us/soulmate/checkout',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
async function create(data=body()){const response=await checkout.POST(req(data)); assert.equal(response.status,200);return{response,data:await response.json(),order:[...orders.values()].at(-1)}}
function paid(order,extra={}){return{id:order.stripe_session_id,mode:'payment',status:'complete',client_reference_id:order.id,metadata:{funnel:'us_soulmate_standalone',order_id:order.id},currency:'usd',amount_total:order.amount,livemode:false,payment_status:'paid',payment_intent:{id:'pi_fixture',status:'succeeded',currency:'usd',amount_received:order.amount,metadata:{funnel:'us_soulmate_standalone',order_id:order.id},livemode:false,latest_charge:{id:'ch_fixture',created:Math.floor(Date.now()/1000)-10,paid:true,captured:true,currency:'usd',amount:order.amount}},...extra};}
function signedEvent(payload,secret='whsec_fixture',at=Math.floor(Date.now()/1000)){const raw=JSON.stringify(payload);return new NextRequest('https://example.com/api/us/soulmate/payment/webhook',{method:'POST',headers:{'stripe-signature':`t=${at},v1=${crypto.createHmac('sha256',secret).update(`${at}.${raw}`).digest('hex')}`},body:raw});}
beforeEach(()=>{orders.clear();calls=[];failInsert=false;failSave=false;session=null;confirmations=0;conversions=0;process.env.US_SOULMATE_CHECKOUT_ENABLED='true';process.env.US_SOULMATE_STRIPE_MODE='test';global.fetch=async(url,init)=>{calls.push({url,init});assert.ok(String(url).startsWith('https://api.stripe.com/v1/'));assert.equal(init.headers.Authorization,'Bearer sk_test_fixture');const order=[...orders.values()].at(-1);const open={id:'cs_test_fixture',status:'open',ui_mode:'elements',mode:'payment',client_secret:'cs_test_fixture_secret',client_reference_id:order?.id,metadata:{order_id:order?.id,funnel:'us_soulmate_standalone'},currency:'usd',amount_total:order?.amount,livemode:false};return{ok:true,json:async()=>init.method==='POST'?open:session||open};};});
test('disabled checkout does not write or contact Stripe',async()=>{process.env.US_SOULMATE_CHECKOUT_ENABLED='false';assert.equal((await checkout.POST(req(body()))).status,503);assert.equal(orders.size,0);assert.equal(calls.length,0)});
test('all ten baskets calculate approved USD prices plus tax rounded to cents',()=>{
  for(let mask=0;mask<8;mask++){
    const ids=['description','colour','priority'].filter((_,i)=>mask&(1<<i));
    const c=cart.buildSoulmateCart('standard',ids);
    const subtotal=3700+ids.reduce((s,id)=>s+({description:6700,colour:3700,priority:2995}[id]),0);
    assert.equal(c.baseAmount,subtotal);assert.equal(c.gstAmount,Math.round(subtotal*18/100));
    assert.equal(c.amount,subtotal+c.gstAmount);assert.equal(c.baseAmount,c.lineItems.reduce((s,i)=>s+i.amount_paise,0));
  }
  assert.equal(cart.buildSoulmateCart('standard').amount,4366);
  assert.equal(cart.buildSoulmateCart('express').amount,7906);
  assert.equal(cart.buildSoulmateCart('express',['timeline']).amount,10148);
  assert.equal(cart.buildSoulmateCart('standard',['description','colour','priority']).amount,20172);
  assert.throws(()=>cart.buildSoulmateCart('express',['colour']));
});
test('checkout saves isolated answer snapshot, USD order and receipt before inline card confirmation',async()=>{const{response,data,order}=await create();assert.match(order.id,/^us_sm_/);assert.deepEqual(order.answers,answers);assert.equal(order.amount,4366);assert.equal(order.currency,'USD');assert.equal(order.customer_phone,null);assert.equal(order.stripe_session_id,'cs_test_fixture');assert.match(response.headers.get('set-cookie'),/Path=\/api\/us\/soulmate\/payment/);assert.match(data.receiptUrl,/^\/us\/soulmate\/payment/);const p=calls[0].init.body;assert.equal(p.get('line_items[0][price_data][currency]'),'usd');assert.equal(p.get('line_items[0][price_data][unit_amount]'),'3700');assert.equal(p.get('metadata[funnel]'),'us_soulmate_standalone');assert.match(calls[0].init.headers['Idempotency-Key'],/^us-soulmate-elements-/)});
test('duplicate checkout reuses order and Stripe session',async()=>{const b=body();await create(b);await create(b);assert.equal(orders.size,1);assert.equal(calls.filter(c=>c.init.method==='POST').length,1)});
test('changed basket cannot reuse a checkout key',async()=>{const b=body();await create(b);assert.equal((await checkout.POST(req({...b,addOns:['description']}))).status,409)});
test('database failure never initiates a Stripe payment',async()=>{failInsert=true;assert.equal((await checkout.POST(req(body()))).status,503);assert.equal(calls.length,0)});
test('foreign origin is rejected',async()=>{assert.equal((await checkout.POST(req(body(),'https://evil.example'))).status,403);assert.equal(orders.size,0)});
test('incomplete or invalid preferences are rejected',async()=>{assert.equal((await checkout.POST(req(body({answers:{name:'Maya'}})))).status,400);assert.equal((await checkout.POST(req(body({email:'invalid'})))).status,400)});
test('US credentials never fall back to India or main credentials',()=>{process.env.US_SOULMATE_STRIPE_MODE='live';assert.throws(stripe.stripeConfig);assert.equal(stripe.validReceiptToken('sm_'+'a'.repeat(20),'b'.repeat(64)),false)});
test('receipt capability is order-scoped',async()=>{const{order}=await create();const token=stripe.receiptToken(order.id);assert.equal(stripe.validReceiptToken(order.id,token),true);assert.equal(stripe.validReceiptToken('us_sm_'+'a'.repeat(20),token),false);const result=await status.GET(new NextRequest(`https://example.com/api/us/soulmate/payment/status?order=${order.id}`));assert.equal(result.status,403)});
test('valid Stripe payment queues US fulfillment with verified charge time',async()=>{const{order}=await create();session=paid(order);const out=await stripe.reconcileSoulmateOrder(order);assert.equal(out.payment_status,'paid');assert.equal(out.stripe_payment_id,'pi_fixture');assert.equal(out.paid_at,new Date(session.payment_intent.latest_charge.created*1000).toISOString());assert.equal(out.fulfillment_status,'queued');assert.equal(confirmations,1);assert.equal(conversions,1)});
for (const [name,change] of Object.entries({currency:{currency:'inr'},amount:{amount_total:1},funnel:{metadata:{funnel:'soulmate_standalone'}},mode:{livemode:true},session:{id:'cs_other'},order:{client_reference_id:'sm_other'},unconfirmed:{payment_intent:{status:'processing'}}})) test(`Stripe rejects ${name} mismatch`,async()=>{const{order}=await create();assert.throws(()=>stripe.verifiedStripeUpdate(order,paid(order,change)));assert.equal(order.payment_status,'created')});
test('unpaid Stripe session cannot queue fulfillment',async()=>{const{order}=await create();session=paid(order,{payment_status:'unpaid',status:'open',payment_intent:null});const out=await stripe.reconcileSoulmateOrder(order);assert.equal(out.payment_status,'pending');assert.equal(confirmations,0)});
test('expired Stripe session becomes failed without fulfillment',async()=>{const{order}=await create();session=paid(order,{payment_status:'unpaid',status:'expired',payment_intent:null});assert.equal((await stripe.reconcileSoulmateOrder(order)).payment_status,'failed');assert.equal(confirmations,0)});
test('paid order cannot be downgraded by delayed webhook',async()=>{const{order}=await create();session=paid(order);const out=await stripe.reconcileSoulmateOrder(order);session=paid(order,{payment_status:'unpaid',status:'expired'});assert.equal((await stripe.reconcileSoulmateOrder(out)).payment_status,'paid');assert.equal(calls.filter(c=>c.init.method==='GET').length,1)});
test('webhook signature and replay window checked before database access',async()=>{for(const r of [signedEvent({type:'checkout.session.completed'},'wrong'),signedEvent({},'whsec_fixture',Math.floor(Date.now()/1000)-301)])assert.equal((await webhook.POST(r)).status,400);assert.equal(calls.length,0)});
test('webhook ignores other funnels and verifies matching event using Stripe API',async()=>{assert.equal((await webhook.POST(signedEvent({type:'checkout.session.completed',data:{object:{metadata:{funnel:'soulmate_standalone'}}}}))).status,200);assert.equal(calls.length,0);const{order}=await create();session=paid(order);assert.equal((await webhook.POST(signedEvent({type:'checkout.session.completed',data:{object:session}}))).status,200);assert.equal(orders.get(order.id).payment_status,'paid')});
test('webhook failure requests retry without marking order paid',async()=>{const{order}=await create();session=paid(order);failSave=true;assert.equal((await webhook.POST(signedEvent({type:'checkout.session.completed',data:{object:session}}))).status,503);assert.equal(order.payment_status,'created')});
test('new module dependency graph has no old payment, mail or marketing writers',()=>{for(const name of fs.readdirSync(path.join(__dirname,'../src/lib')).filter(n=>n.startsWith('us-soulmate-'))){const s=fs.readFileSync(path.join(__dirname,'../src/lib',name),'utf8');assert.doesNotMatch(s,/from ["'](?:\.\/|@\/lib\/)(?:soulmate-|payu-|brevo-send-monitoring|pixel-events|marketing-events["'])/,name);assert.doesNotMatch(s,/\.from\(["'](?:payments|marketing_events|soulmate_orders|soulmate_sessions|monitoring_incidents)["']\)/,name);}});

test('Stripe checkout displays a Tax amount and charges the exact total for every basket',async()=>{
 const baskets=[...Array.from({length:8},(_,mask)=>['standard',['description','colour','priority'].filter((_,i)=>mask&(1<<i))]),['express',[]],['express',['timeline']]];
 for(const [plan,addOns] of baskets){const {order}=await create(body({plan,addOns}));const p=calls.at(-1).init.body;
   const taxIndex=order.line_items.length;
   assert.equal(p.get(`line_items[${taxIndex}][price_data][product_data][name]`),'Tax');
   assert.equal(Number(p.get(`line_items[${taxIndex}][price_data][unit_amount]`)),order.gst_amount);
   let total=0;for(let i=0;i<=taxIndex;i++)total+=Number(p.get(`line_items[${i}][price_data][unit_amount]`));
   assert.equal(total,order.amount);assert.doesNotMatch(p.toString(),/GST|18%25|18%/i);
 }
});
test('confirmation breakdown uses Tax with no GST or percentage wording',()=>{
 const {soulmateConfirmationEmail}=require('../src/lib/us-soulmate-invoice-template');
 const c=cart.buildSoulmateCart('standard');
 const email=soulmateConfirmationEmail({invoice_number:'ARUS-26-TEST',issued_at:'2026-10-17T00:00:00Z',snapshot:{customerName:'Fixture',customerEmail:'fixture@example.com',orderId:null,items:c.lineItems,entitlements:c.entitlements,subtotal:c.baseAmount,gst:c.gstAmount,total:c.amount,paidAt:'2026-10-17T00:00:00Z',deliveryDueAt:null}});
 assert.match(email.text,/Subtotal: USD 37.00\nTax: USD 6.66\nTotal paid: USD 43.66/);
 assert.doesNotMatch(email.text,/GST|18%/i);assert.doesNotMatch(email.html,/GST|18%/i);
});

 test('inline checkout returns a client secret, pins the API and never returns a hosted URL',async()=>{
  const {data}=await create();const params=calls[0].init.body;
  assert.equal(data.clientSecret,'cs_test_fixture_secret');assert.equal(data.amount,4366);assert.equal(data.url,undefined);
  assert.equal(calls[0].init.headers['Stripe-Version'],'2026-03-25.dahlia');
  assert.equal(params.get('ui_mode'),'elements');assert.equal(params.has('submit_type'),false);assert.equal(params.get('payment_method_types[0]'),'card');
  assert.equal(params.get('phone_number_collection[enabled]'),'false');assert.equal(params.has('success_url'),false);assert.equal(params.has('cancel_url'),false);
  assert.match(params.get('return_url'),/^https:\/\/example.com\/us\/soulmate\/payment/);
 });
 test('legacy submitted phone is ignored and cannot alter a US order',async()=>{
  const b=body();const {order}=await create({...b,phone:'2025550123'});assert.equal(order.customer_phone,null);
  await create({...b,phone:'999'});assert.equal(orders.size,1);
 });
 test('missing or mismatched publishable key prevents creating an order',async()=>{
  for(const key of ['', 'pk_live_fixture']){process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY=key;
   assert.equal((await checkout.POST(req(body()))).status,503);assert.equal(orders.size,0);assert.equal(calls.length,0);
  }
  process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY='pk_test_fixture';
 });
 test('a reused session cannot expose a client secret for a different amount or order',async()=>{
  const b=body();const {order}=await create(b);session={...paid(order),status:'open',ui_mode:'elements',client_secret:'cs_other_secret',amount_total:1};
  const response=await checkout.POST(req(b));assert.equal(response.status,503);assert.equal((await response.json()).clientSecret,undefined);
 });

function promoFixtures() {
 const originalFetch=global.fetch;
 global.fetch=async(url,init)=>{
   if(String(url).includes('/promotion_codes?')) return {ok:true,json:async()=>({data:[{id:'promo_fixture',code:'SAVE10',active:true}]})};
   if(String(url).includes('/line_items?')) return {ok:true,json:async()=>({has_more:false,data:[
     {description:cart.buildSoulmateCart('standard').lineItems[0].name,currency:'usd',quantity:1,amount_subtotal:3700,amount_discount:370,amount_tax:0,amount_total:3330},
     {description:'Tax',currency:'usd',quantity:1,amount_subtotal:666,amount_discount:67,amount_tax:0,amount_total:599},
   ]})};
   const result=await originalFetch(url,init); const value=await result.json();
   if(init.method==='POST') {assert.equal(init.body.get('discounts[0][promotion_code]'),'promo_fixture');Object.assign(value,{amount_subtotal:4366,amount_total:3929,total_details:{amount_discount:437}});}
   return {...result,json:async()=>value};
 };
}
test('invalid or customer-restricted promo creates no order and never submits a payment',async()=>{
 global.fetch=async()=>({ok:true,json:async()=>({data:[{id:'promo_other',code:'PRIVATE',active:true,customer:'cus_other'}]})});
 for(const promotionCode of ['MISSING','PRIVATE',42,'x'.repeat(201)]) {
   assert.equal((await checkout.POST(req(body({promotionCode})))).status,400);
 }
 assert.equal(orders.size,0);
});
test('Stripe promotion amounts are frozen before returning a client secret and paid reconciliation uses the discount',async()=>{
 promoFixtures();const b=body({promotionCode:'save10',amount:1,discount:9999});
 const {data,order}=await create(b);
 assert.deepEqual(data.quote,{subtotal:3700,discount:370,tax:599,total:3929,code:'SAVE10'});
 assert.equal(order.base_amount,3700);assert.equal(order.line_items[0].amount_paise,3700);assert.equal(order.amount,3929);
 assert.equal(order.stripe_session_id,'cs_test_fixture');assert.equal(order.promotion_snapshot.discountTotal,437);
 await create(b);assert.equal(orders.size,1);assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
 assert.equal((await checkout.POST(req({...b,promotionCode:''}))).status,409);
 assert.equal(stripe.verifiedStripeUpdate(order,paid(order)).payment_status,'paid');
 assert.throws(()=>stripe.verifiedStripeUpdate(order,paid(order,{amount_total:4366})));
});
test('promotion quote rejects changed basket, tax, currency, identity, totals and free orders',()=>{
 const c=cart.buildSoulmateCart('standard');const o={id:'us_sm_'+'a'.repeat(20),line_items:c.lineItems,base_amount:3700,gst_amount:666,payment_mode:'test'};
 const s={mode:'payment',ui_mode:'elements',client_reference_id:o.id,metadata:{order_id:o.id,funnel:'us_soulmate_standalone'},currency:'usd',livemode:false,amount_subtotal:4366,amount_total:3929,total_details:{amount_discount:437}};
 const l={has_more:false,data:[{description:c.lineItems[0].name,currency:'usd',quantity:1,amount_subtotal:3700,amount_discount:370,amount_tax:0,amount_total:3330},{description:'Tax',currency:'usd',quantity:1,amount_subtotal:666,amount_discount:67,amount_tax:0,amount_total:599}]};
 assert.equal(stripe.verifiedPromotionQuote(o,s,l).total,3929);
 for(const patch of [{amount_total:1},{currency:'inr'},{livemode:true},{amount_subtotal:1},{metadata:{funnel:'soulmate_standalone'}},{total_details:{amount_discount:1}}]) assert.throws(()=>stripe.verifiedPromotionQuote(o,{...s,...patch},l));
 for(const patch of [{amount_tax:1},{description:'Another item'},{quantity:2},{amount_subtotal:3699},{amount_discount:-1},{amount_total:1}]) assert.throws(()=>stripe.verifiedPromotionQuote(o,s,{...l,data:[{...l.data[0],...patch},l.data[1]]}));
 assert.throws(()=>stripe.verifiedPromotionQuote(o,s,{...l,has_more:true}));
 const free={...l,data:l.data.map(x=>({...x,amount_discount:x.amount_subtotal,amount_total:0}))};
 assert.throws(()=>stripe.verifiedPromotionQuote(o,{...s,amount_total:0,total_details:{amount_discount:4366}},free),/at least/);
});
test('discounted confirmation email and invoice contain the same accounting totals',()=>{
 const {soulmateConfirmationEmail,generateSoulmateInvoicePdf}=require('../src/lib/us-soulmate-invoice-template');const c=cart.buildSoulmateCart('standard');
 const invoice={invoice_number:'ARUS-26-PROMO',issued_at:'2026-10-17T00:00:00Z',snapshot:{customerName:'Fixture',customerEmail:'fixture@example.com',orderId:null,items:c.lineItems,entitlements:c.entitlements,subtotal:3700,discount:370,gst:599,total:3929,paidAt:'2026-10-17T00:00:00Z',deliveryDueAt:null}};
 const email=soulmateConfirmationEmail(invoice);assert.match(email.text,/Subtotal: USD 37.00\nDiscount: -USD 3.70\nTax: USD 5.99\nTotal paid: USD 39.29/);
 assert.match(email.html,/Discount/);assert.match(generateSoulmateInvoicePdf(invoice).subarray(0,4).toString(),/%PDF/);
});
