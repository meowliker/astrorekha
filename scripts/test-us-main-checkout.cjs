const assert=require('node:assert/strict'),{test}=require('node:test'),Module=require('node:module'),path=require('node:path');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),admin=require('../src/lib/supabase-admin');
const api=require('../src/app/api/us/main/checkout/route');
test('checkout without birth details saves a non-null snapshot and creates correctly priced Stripe checkout',async t=>{
 let saved=null,stripeParams=null;
 t.mock.method(server,'enabled',()=>true);t.mock.method(server,'sameOrigin',()=>true);t.mock.method(server,'ownerToken',()=> 'a'.repeat(64));t.mock.method(server,'checkoutOrigin',()=> 'https://astrorekha.com');t.mock.method(server,'stripeKey',()=>({mode:'live'}));t.mock.method(server,'readPrices',async()=>({'palm-reading':704}));
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){let inserting=false;const q={select(){return q},eq(){return q},is(){return q},gte:async()=>({count:0,error:null}),maybeSingle:async()=>({data:null,error:null}),insert(row){saved=row;inserting=true;return q},single:async()=>({data:saved,error:saved.birth_details===null?{code:'23502'}:null}),update(){return q},then(resolve){resolve({error:null})}};return q}}));
 t.mock.method(server,'stripe',async(_path,params)=>{stripeParams=params;return {id:'cs_fixture',metadata:{order_id:saved.id,funnel:'us_main'},currency:'usd',amount_subtotal:704,livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/fixture'}});
 const response=await api.POST(new NextRequest('https://astrorekha.com/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bundle',bundleId:'palm-reading',requestKey:'00000000-0000-4000-a000-000000000000',email:'fixture@example.invalid'})}));
 assert.equal(response.status,200);assert.deepEqual(saved.birth_details,{});assert.deepEqual(saved.fulfillment_features,['palmReading']);assert.equal(saved.fulfillment_coins,15);assert.equal(stripeParams.get('allow_promotion_codes'),'true');assert.equal(stripeParams.get('line_items[0][price_data][unit_amount]'),'704');assert.equal(saved.fulfilled_at,undefined);
});

test('testing code is server validated, revocable, and limited to bundles',async t=>{
 const crypto=require('node:crypto'),{validateUsTestPromo}=require('../src/lib/us-main/test-promo');
 let enabled=true;const hash=crypto.createHash('sha256').update('QA-EXAMPLE').digest('hex');
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{value:{enabled,code_hash:hash}},error:null})};return q}}));
 assert.equal(await validateUsTestPromo(undefined,'bundle',704),false);
 assert.equal(await validateUsTestPromo(' qa-example ','bundle',704),true);
 await assert.rejects(()=>validateUsTestPromo('wrong','bundle',704),/Invalid/);
 for(const type of ['upsell','coins','report','chat_pass'])await assert.rejects(()=>validateUsTestPromo('QA-EXAMPLE',type,704),/only available/);
 enabled=false;await assert.rejects(()=>validateUsTestPromo('QA-EXAMPLE','bundle',704),/inactive/);
});

for(const [bundle,cents,coins] of [['palm-reading',704,15],['palm-birth',1056,15],['palm-birth-sketch',2013,30]])test(`testing code charges $1 for ${bundle} and retains its normal entitlements`,async t=>{
 const promo=require('../src/lib/us-main/test-promo');let saved=null,sessionParams=null,couponParams=null;
 t.mock.method(promo,'validateUsTestPromo',async()=>true);
 t.mock.method(server,'enabled',()=>true);t.mock.method(server,'sameOrigin',()=>true);t.mock.method(server,'ownerToken',()=> 'a'.repeat(64));t.mock.method(server,'checkoutOrigin',()=> 'https://astrorekha.com');t.mock.method(server,'stripeKey',()=>({mode:'live'}));t.mock.method(server,'readPrices',async()=>({[bundle]:cents}));
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},is(){return q},gte:async()=>({count:0,error:null}),maybeSingle:async()=>({data:null,error:null}),insert(row){saved=row;return q},single:async()=>({data:saved,error:null}),update(){return q},then(resolve){resolve({error:null})}};return q}}));
 t.mock.method(server,'stripe',async(path,params,key)=>{if(path==='/coupons'){couponParams=params;assert.equal(key,`us-main-test-coupon-${saved.id}`);return {id:'coupon_fixture',amount_off:cents-100,currency:'usd'};}sessionParams=params;return {id:'cs_fixture',metadata:{order_id:saved.id,funnel:'us_main'},currency:'usd',amount_subtotal:cents,amount_total:100,livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/fixture'};});
 const response=await api.POST(new NextRequest('https://astrorekha.com/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bundle',bundleId:bundle,promoCode:'QA-EXAMPLE',requestKey:'00000000-0000-4000-a000-000000000000',email:'fixture@example.invalid'})}));
 assert.equal(response.status,200);assert.equal(saved.amount_cents,cents);assert.equal(saved.fulfillment_coins,coins);assert.equal(saved.fulfilled_at,undefined);assert.equal(saved.attribution.testPromotion,'us-bundle-dollar-v1');assert.equal(couponParams.get('amount_off'),String(cents-100));assert.equal(couponParams.get('max_redemptions'),'1');assert.equal(sessionParams.has('allow_promotion_codes'),false);assert.equal(sessionParams.get('discounts[0][coupon]'),'coupon_fixture');assert.equal(sessionParams.get('line_items[0][price_data][unit_amount]'),String(cents));
});

test('saved palm input is durable before Stripe handoff and never included in Stripe or tracking fields',async t=>{
 const inputs=require('../src/lib/checkout-report-inputs');let order=null,photoSaved=false,failSave=false,calls=0;
 t.mock.method(server,'enabled',()=>true);t.mock.method(server,'sameOrigin',()=>true);t.mock.method(server,'ownerToken',()=> 'a'.repeat(64));t.mock.method(server,'checkoutOrigin',()=> 'https://astrorekha.com');t.mock.method(server,'stripeKey',()=>({mode:'live'}));t.mock.method(server,'readPrices',async()=>({'palm-reading':704}));
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},is(){return q},gte:async()=>({count:0,error:null}),maybeSingle:async()=>({data:null,error:null}),insert(row){order=row;return q},single:async()=>({data:order,error:null}),update(){return q},then(resolve){resolve({error:null})}};return q}}));
 const image='data:image/jpeg;base64,aGVsbG8=';
 t.mock.method(inputs,'saveCheckoutReportInputs',async(market,id,palm)=>{assert.equal(market,'US');assert.equal(id,order.id);assert.equal(palm,image);if(failSave)throw Error('Fixture input storage unavailable');photoSaved=true});
 t.mock.method(server,'stripe',async(_path,params)=>{calls++;assert.equal(photoSaved,true);assert.ok(!params.toString().includes('base64'));assert.ok(!JSON.stringify(order.attribution).includes('base64'));return {id:'cs_fixture',metadata:{order_id:order.id,funnel:'us_main'},currency:'usd',amount_subtotal:704,livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/fixture'}});
 const request=()=>new NextRequest('https://astrorekha.com/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bundle',bundleId:'palm-reading',requestKey:'00000000-0000-4000-a000-000000000000',email:'fixture@example.invalid',palmImage:image})});
 assert.equal((await api.POST(request())).status,200);assert.equal(calls,1);failSave=true;assert.equal((await api.POST(request())).status,503);assert.equal(calls,1,'never charge before input save succeeds');
});

test('US Google checkout saves campaign evidence with identical Stripe pricing and entitlements',async t=>{
 let saved=null,stripeParams=null;
 t.mock.method(server,'enabled',()=>true);t.mock.method(server,'sameOrigin',()=>true);t.mock.method(server,'ownerToken',()=> 'a'.repeat(64));t.mock.method(server,'checkoutOrigin',()=> 'https://astrorekha.com');t.mock.method(server,'stripeKey',()=>({mode:'live'}));t.mock.method(server,'readPrices',async()=>({'palm-reading':704}));
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){let inserting=false;const q={select(){return q},eq(){return q},is(){return q},gte:async()=>({count:0,error:null}),maybeSingle:async()=>({data:null,error:null}),insert(row){saved=row;inserting=true;return q},single:async()=>({data:saved,error:saved.birth_details===null?{code:'23502'}:null}),update(){return q},then(resolve){resolve({error:null})}};return q}}));
 t.mock.method(server,'stripe',async(_path,params)=>{stripeParams=params;return {id:'cs_fixture',metadata:{order_id:saved.id,funnel:'us_main'},currency:'usd',amount_subtotal:704,livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/fixture'}});
 const response=await api.POST(new NextRequest('https://astrorekha.com/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'bundle',bundleId:'palm-reading',requestKey:'00000000-0000-4000-a000-000000000000',email:'fixture@example.invalid',attribution:{marketing:{landing_path:'/us/discover',utm_source:'google',utm_medium:'cpc',google_campaign_id:'998877',gclid:'fixtureclick'}}})}));
 assert.equal(response.status,200);assert.equal(saved.attribution.marketing.google_campaign_id,'998877');assert.equal(saved.attribution.marketing.landing_path,'/us/discover');assert.equal(stripeParams.get('success_url'),'https://astrorekha.com/us/payment?order='+saved.id);assert.equal(stripeParams.get('cancel_url'),'https://astrorekha.com/us/payment?order='+saved.id+'&cancelled=1');assert.deepEqual(saved.birth_details,{});assert.deepEqual(saved.fulfillment_features,['palmReading']);assert.equal(saved.fulfillment_coins,15);assert.equal(stripeParams.get('allow_promotion_codes'),'true');assert.equal(stripeParams.get('line_items[0][price_data][unit_amount]'),'704');assert.equal(saved.fulfilled_at,undefined);
});
