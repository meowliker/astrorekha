/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest);};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {quoteUsBasket,INTRO_PRICES,usCatalog}=require('../src/lib/us-main/catalog');
const {verifyUsSession}=require('../src/lib/us-main/reconcile');
const {purchasePayloads,sendUsPurchase}=require('../src/lib/us-main/tracking-server');
const {verifyStripeSignature}=require('../src/lib/us-soulmate-stripe');
const {createHmac}=require('node:crypto');
const order={id:'us_ar_'+ 'a'.repeat(24),amount_cents:704,currency:'USD',payment_mode:'test',payment_status:'paid',stripe_session_id:'cs_test',customer_email:'test@example.invalid',attribution:{marketing:{utm_source:'facebook'},gaClientId:'123.456',trackingEnvironment:'local'},line_items:[{id:'palm-reading',name:'Palm Reading',cents:704}],paid_at:new Date().toISOString()};
const session={id:'cs_test',mode:'payment',client_reference_id:order.id,metadata:{order_id:order.id,funnel:'us_main'},currency:'usd',amount_total:704,livemode:false,payment_status:'paid',status:'complete',payment_intent:{id:'pi_test',status:'succeeded',currency:'usd',amount_received:704,livemode:false,metadata:{order_id:order.id,funnel:'us_main'},latest_charge:{id:'ch_test',paid:true,captured:true,amount:704,currency:'usd',created:Math.floor(Date.now()/1000)}}};
test('USD quotes use fixed final-payable equivalents, not INR values',()=>{
 assert.equal(quoteUsBasket(['palm-reading'],'bundle',INTRO_PRICES).cents,704);
 assert.equal(quoteUsBasket(['palm-birth'],'bundle',INTRO_PRICES).cents,1056);
 assert.equal(quoteUsBasket(['palm-birth-sketch'],'bundle',INTRO_PRICES).cents,2013);
 assert.equal(quoteUsBasket(['numerology','witch-archetype'],'upsell',INTRO_PRICES).cents,1256);
 for(const ids of [[],['palm-reading','palm-reading'],['unknown'],['palm-birth-sketch-aura-astro']])assert.throws(()=>quoteUsBasket(ids,'bundle',INTRO_PRICES));
 assert.throws(()=>quoteUsBasket(['palm-reading'],'bundle',{}));
 assert.equal(usCatalog(INTRO_PRICES).some(p=>p.id==='past-life'),false);
});
test('only matching captured Stripe payments can unlock; browser success is insufficient',()=>{
 assert.equal(verifyUsSession(order,session).intent,'pi_test');
 assert.equal(verifyUsSession(order,{...session,payment_status:'unpaid'}),null);
 for(const field of ['id','mode','client_reference_id','currency','amount_total','livemode','metadata']){
  const s=structuredClone(session);s[field]=field==='amount_total'?1:field==='livemode'?true:field==='metadata'?{...s.metadata,funnel:'us_soulmate'}:'wrong';assert.throws(()=>verifyUsSession(order,s),field);
 }
 for(const change of [{status:'requires_payment_method'},{amount_received:1},{currency:'inr'},{livemode:true},{metadata:{}},{latest_charge:{...session.payment_intent.latest_charge,captured:false}}])assert.throws(()=>verifyUsSession(order,{...session,payment_intent:{...session.payment_intent,...change}}));
});
test('signed raw Stripe notifications reject tampering and stale timestamps',()=>{
 const raw=JSON.stringify({id:'evt_test'}),secret='whsec_fixture',t=Math.floor(Date.now()/1000);
 const sig=`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')}`;
 assert.ok(verifyStripeSignature(raw,sig,secret));assert.ok(!verifyStripeSignature(raw+' ',sig,secret));assert.ok(!verifyStripeSignature(raw,sig,'wrong'));
});
test('purchase tracking uses USD and stable order dedup IDs; local/test sends nothing',async t=>{
 const p=purchasePayloads(order);assert.equal(p.ga.events[0].params.transaction_id,order.id);assert.equal(p.ga.events[0].params.value,7.04);assert.equal(p.meta.event_id,order.id);assert.equal(p.meta.custom_data.currency,'USD');
 t.mock.method(global,'fetch',()=>{throw new Error('Local test must never contact ads providers');});await sendUsPurchase(order);
});
test('database migration applies with atomic grants, strict access and repeat protection',async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261112010000_us_main_funnel.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261112010100_us_main_environment_reports.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261112020000_us_account_commerce.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261112030000_us_main_stripe_discounts.sql'),'utf8'));
 const ins=async(id,session)=>db.query(`insert into us_main_orders(id,owner_hash,request_key,customer_email,customer_name,type,bundle_id,amount_cents,payment_mode,line_items,fulfillment_features,fulfillment_coins,stripe_session_id) values($1,'owner',$1,'test@example.invalid','Test','bundle','palm-reading',704,'test','[]','["palmReading"]',15,$2)`,[id,session]);
 const grant=(id,s,intent,charge,amount)=>db.query('select fulfill_us_main_order($1,$2,$3,$4,$5,now()) as result',[id,s,intent,charge,amount]);
 await ins(order.id,'cs_test');
 await assert.rejects(grant(order.id,'wrong','pi_test','ch_test',704),/Invalid verified/);
 await assert.rejects(grant(order.id,'cs_test','pi_test','ch_test',705),/Invalid verified/);
 assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n,0);
 assert.equal((await grant(order.id,'cs_test','pi_test','ch_test',704)).rows[0].result,true);
 assert.equal((await grant(order.id,'cs_test','pi_test','ch_test',704)).rows[0].result,false);
 assert.equal((await db.query('select coins from users')).rows[0].coins,15);
 await db.query("update us_main_orders set attribution=jsonb_build_object('trackingEnvironment','local') where id=$1",[order.id]);
 assert.equal((await db.query("select us_main_summary(now()-interval '1 hour',now()+interval '1 hour','test','production') as s")).rows[0].s.paidOrders,0);
 assert.equal((await db.query("select us_main_summary(now()-interval '1 hour',now()+interval '1 hour','test','local') as s")).rows[0].s.paidOrders,1);
 await assert.rejects(grant(order.id,'cs_test','pi_changed','ch_test',704),/identity mismatch/);
 await assert.rejects(db.query('update us_main_orders set amount_cents=1 where id=$1',[order.id]),/immutable/);
 const second='us_ar_'+'b'.repeat(24);await ins(second,'cs_second');
 await assert.rejects(grant(second,'cs_second','pi_test','ch_test',704),/duplicate key/);
 assert.equal((await db.query('select coins from users')).rows[0].coins,15);

 assert.equal((await db.query('select market from customer_markets')).rows[0].market,'US');
 const uid=(await db.query('select id from users')).rows[0].id;
 const purchase=async(id,type,amount,coins,features)=>db.query(`insert into us_main_orders(id,owner_hash,request_key,user_id,customer_email,customer_name,type,bundle_id,amount_cents,payment_mode,line_items,fulfillment_features,fulfillment_coins,stripe_session_id) values($1,'account',$1,$2,'test@example.invalid','Test',$3,$3,$4,'test','[]',$5,$6,$1)`,[id,uid,type,amount,JSON.stringify(features),coins]);
 const coinId='us_ar_'+'c'.repeat(24);await purchase(coinId,'coins',212,45,[]);
 await grant(coinId,coinId,'pi_coins','ch_coins',212);await grant(coinId,coinId,'pi_coins','ch_coins',212);
 assert.equal((await db.query('select coins from users')).rows[0].coins,60);
 const reportId='us_ar_'+'d'.repeat(24);await purchase(reportId,'report',621,0,['numerologyReport']);await grant(reportId,reportId,'pi_report','ch_report',621);
 assert.equal((await db.query('select unlocked_features from users')).rows[0].unlocked_features.numerologyReport,true);
 const passId='us_ar_'+'e'.repeat(24);await purchase(passId,'chat_pass',372,0,[]);await grant(passId,passId,'pi_pass','ch_pass',372);await grant(passId,passId,'pi_pass','ch_pass',372);
 assert.equal((await db.query('select count(*)::int as n, max(extract(epoch from ends_at-starts_at))::int as seconds from us_main_chat_passes')).rows[0].seconds,1200);
 assert.equal((await db.query('select count(*)::int as n from us_main_chat_passes')).rows[0].n,1);
 assert.equal((await db.query('select coins from users')).rows[0].coins,60);
 assert.equal((await db.query('select count(*)::int as n from payments')).rows[0].n,0);
 await db.query("insert into users(id,email,payment_status) values('legacy-india','india@example.invalid','paid')");
 const oldCustomer='us_ar_'+'f'.repeat(24);
 await db.query(`insert into us_main_orders(id,owner_hash,request_key,customer_email,customer_name,type,bundle_id,amount_cents,payment_mode,line_items,fulfillment_features,fulfillment_coins,stripe_session_id) values($1,'india',$1,'india@example.invalid','India','bundle','palm-reading',704,'test','[]','["palmReading"]',15,$1)`,[oldCustomer]);
 await grant(oldCustomer,oldCustomer,'pi_india','ch_india',704);
 assert.equal((await db.query("select market from customer_markets where user_id='legacy-india'")).rows[0].market,'IN');
 const disc='us_ar_'+'ab'.repeat(12);await ins(disc,'cs_discount');await grant(disc,'cs_discount','pi_discount','ch_discount',500);
 assert.equal((await db.query('select paid_amount_cents from us_main_orders where id=$1',[disc])).rows[0].paid_amount_cents,500);
 assert.equal((await grant(disc,'cs_discount','pi_discount','ch_discount',500)).rows[0].result,false);
 await assert.rejects(grant(disc,'cs_discount','pi_discount','ch_discount',704),/identity mismatch/);
 await assert.rejects(db.query('update us_main_orders set paid_amount_cents=100 where id=$1',[disc]),/immutable/);
 const free='us_ar_'+'cd'.repeat(12);await ins(free,'cs_free');await grant(free,'cs_free',null,null,0);assert.equal((await grant(free,'cs_free',null,null,0)).rows[0].result,false);
 await db.exec('set role anon');await assert.rejects(db.query('select * from us_main_orders'),/permission denied/);await assert.rejects(grant(order.id,'cs_test','pi_test','ch_test',704),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});

test('local return URLs preserve the checkout hostname and reject cross-origin posts',()=>{
 const {NextRequest}=require('next/server');const {sameOrigin,checkoutOrigin}=require('../src/lib/us-main/server');
 const local=new NextRequest('http://localhost:3195/api/us/main/checkout',{headers:{host:'127.0.0.1:3195',origin:'http://127.0.0.1:3195'}});
 assert.equal(sameOrigin(local),true);assert.equal(checkoutOrigin(local),'http://127.0.0.1:3195');
 assert.equal(sameOrigin(new NextRequest('http://localhost:3195/api/us/main/checkout',{headers:{host:'127.0.0.1:3195',origin:'https://attacker.invalid'}})),false);
});

test('checkout route snapshots server prices, reuses one Stripe session and rejects a changed basket',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),dbModule=require('../src/lib/supabase-admin');
 let row=null,creates=0,provider=null;
 const query=()=>{let action='read',values=null;const q={select(){return q},eq(){return q},gte(){return q},is(){return q},insert(v){action='insert';values=v;return q},update(v){action='update';values=v;return q},maybeSingle(){return Promise.resolve({data:row,error:null})},single(){if(action==='insert')row={...values,created_at:new Date().toISOString(),stripe_session_id:null,fulfilled_at:null};return Promise.resolve({data:row,error:null})},then(resolve){if(action==='update')row={...row,...values};return Promise.resolve({data:row,count:0,error:null}).then(resolve)}};return q;};
 t.mock.method(dbModule,'getSupabaseAdmin',()=>({from:query}));t.mock.method(server,'enabled',()=>true);t.mock.method(server,'readPrices',async()=>INTRO_PRICES);t.mock.method(server,'stripeKey',()=>({mode:'test',key:'sk_test_fixture'}));
 t.mock.method(server,'stripe',async(p,body)=>{if(body){creates++;assert.equal(body.get('allow_promotion_codes'),'true');assert.equal(body.get('adaptive_pricing[enabled]'),'false');assert.equal(body.get('line_items[0][price_data][unit_amount]'),'704');assert.equal(body.get('line_items[0][price_data][currency]'),'usd');assert.ok(body.get('success_url').startsWith('http://127.0.0.1:3195/us/payment?'));provider={id:'cs_fixture',metadata:{order_id:row.id,funnel:'us_main'},currency:'usd',amount_total:704,livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_fixture'};}return provider;});
 const {POST}=require('../src/app/api/us/main/checkout/route');
 const body={requestKey:'12345678-1234-1234-1234-123456789abc',email:'Test@example.invalid',type:'bundle',bundleId:'palm-reading',amount:1,currency:'INR'};
 const req=(value,cookie='f'.repeat(64))=>new NextRequest('http://localhost:3195/api/us/main/checkout',{method:'POST',headers:{host:'127.0.0.1:3195',origin:'http://127.0.0.1:3195','content-type':'application/json',cookie:`ar_us_main_owner=${cookie}`},body:JSON.stringify(value)});
 const first=await POST(req(body));assert.equal(first.status,200);assert.equal((await first.json()).amount,7.04);assert.equal(row.customer_email,'test@example.invalid');
 assert.equal((await POST(req(body))).status,200);assert.equal(creates,1);
 assert.equal((await POST(req({...body,email:'different@example.invalid'}))).status,409);
 assert.equal((await POST(req(body,''))).status,409);
});

test('unsigned notifications and another browser cannot confirm or inspect a purchase',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server');
 const old=process.env.US_MAIN_STRIPE_WEBHOOK_SECRET;process.env.US_MAIN_STRIPE_WEBHOOK_SECRET='whsec_fixture';t.after(()=>{if(old===undefined)delete process.env.US_MAIN_STRIPE_WEBHOOK_SECRET;else process.env.US_MAIN_STRIPE_WEBHOOK_SECRET=old;});
 const {POST}=require('../src/app/api/us/main/payment/webhook/route');
 const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{id:order.stripe_session_id,metadata:{order_id:order.id,funnel:'us_main'}}}});
 assert.equal((await POST(new NextRequest('http://localhost/api/us/main/payment/webhook',{method:'POST',body:raw}))).status,400);
 const dbModule=require('../src/lib/supabase-admin');
 t.mock.method(dbModule,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:{...order,owner_hash:server.ownerHash('a'.repeat(64))},error:null}}};return q;}}));
 const {GET}=require('../src/app/api/us/main/payment/status/route');
 const r=await GET(new NextRequest(`http://localhost/api/us/main/payment/status?order=${order.id}`,{headers:{cookie:`ar_us_main_owner=${'b'.repeat(64)}`}}));assert.equal(r.status,403);
});


test('account catalogue converts final INR totals without adding GST again',()=>{
 const {ACCOUNT_INTRO_PRICES,quoteAccountProduct,accountCatalog}=require('../src/lib/us-main/account-catalog');
 assert.equal(quoteAccountProduct('report','report-numerology',ACCOUNT_INTRO_PRICES).cents,621);
 const coins=quoteAccountProduct('coins','coins-50',ACCOUNT_INTRO_PRICES);assert.equal(coins.cents,212);assert.equal(coins.coins,45);
 assert.equal(quoteAccountProduct('chat_pass','elysia-unlimited-20m',ACCOUNT_INTRO_PRICES).cents,372);
 assert.ok(!accountCatalog(ACCOUNT_INTRO_PRICES).some(x=>x.id==='report-past-life'));
 assert.throws(()=>quoteAccountProduct('coins','coins-50',{}));
});

test('USD account checkout requires signed US identity and ignores supplied email, coins and price',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),market=require('../src/lib/customer-market'),dbModule=require('../src/lib/supabase-admin');
 const {ACCOUNT_INTRO_PRICES}=require('../src/lib/us-main/account-catalog');
 const before=process.env.REPORT_SESSION_SECRET;process.env.REPORT_SESSION_SECRET='unit-fixture-secret';t.after(()=>{if(before===undefined)delete process.env.REPORT_SESSION_SECRET;else process.env.REPORT_SESSION_SECRET=before;});
 const {createReportSession}=require('../src/lib/report-session');
 let marketValue='IN',row=null,provider=null,creates=0;
 t.mock.method(market,'customerMarket',async()=>marketValue);
 t.mock.method(dbModule,'getSupabaseAdmin',()=>({from(table){let action='read',value=null;const q={select(){return q},eq(){return q},gte(){return q},is(){return q},insert(v){action='insert';value=v;return q},update(v){action='update';value=v;return q},async single(){if(table==='users')return {data:{id:'signed-user',email:'owner@example.invalid',unlocked_features:{}},error:null};if(action==='insert')row={...value,created_at:new Date().toISOString(),stripe_session_id:null,fulfilled_at:null};return {data:row,error:null};},async maybeSingle(){return {data:row,error:null}},then(resolve){if(action==='update')row={...row,...value};return Promise.resolve({data:row,count:0,error:null}).then(resolve)}};return q;}}));
 t.mock.method(server,'enabled',()=>true);t.mock.method(server,'readPrices',async()=>ACCOUNT_INTRO_PRICES);t.mock.method(server,'stripeKey',()=>({mode:'test',key:'sk_test_fixture'}));
 t.mock.method(server,'stripe',async(path,body)=>{if(body){creates++;assert.equal(body.get('line_items[0][price_data][unit_amount]'),'212');assert.equal(body.get('customer_email'),'owner@example.invalid');provider={id:'cs_account',metadata:{order_id:row.id,funnel:'us_main'},currency:'usd',amount_total:212,livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_account'};}return provider;});
 const {POST}=require('../src/app/api/us/main/checkout/route');
 const req=(signed=true)=>new NextRequest('http://localhost:3195/api/us/main/checkout',{method:'POST',headers:{host:'127.0.0.1:3195',origin:'http://127.0.0.1:3195',cookie:`ar_us_main_owner=${'c'.repeat(64)}; ar_report_session=${signed?createReportSession('signed-user'):'forged'}`},body:JSON.stringify({type:'coins',productId:'coins-50',requestKey:'abcdef12-1234-1234-1234-123456789abc',userId:'attacker',email:'attacker@example.invalid',amount:1,coins:9999})});
 assert.equal((await POST(req(false))).status,401);assert.equal((await POST(req())).status,403);assert.equal(creates,0);
 marketValue='US';assert.equal((await POST(req())).status,200);assert.equal(row.user_id,'signed-user');assert.equal(row.customer_email,'owner@example.invalid');assert.equal(row.fulfillment_coins,45);assert.equal(row.amount_cents,212);
 assert.equal((await POST(req())).status,200);assert.equal(creates,1);
});

test('account pricing comes from signed identity, never URL/browser currency',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),market=require('../src/lib/customer-market');
 const old=process.env.REPORT_SESSION_SECRET;process.env.REPORT_SESSION_SECRET='fixture-commerce-secret';t.after(()=>{if(old===undefined)delete process.env.REPORT_SESSION_SECRET;else process.env.REPORT_SESSION_SECRET=old;});
 const {createReportSession}=require('../src/lib/report-session'),{ACCOUNT_INTRO_PRICES}=require('../src/lib/us-main/account-catalog');
 let current='IN';t.mock.method(market,'customerMarket',async uid=>{assert.equal(uid,'verified-user');return current;});
 t.mock.method(server,'readPrices',async()=>ACCOUNT_INTRO_PRICES);t.mock.method(server,'enabled',()=>true);
 const {GET}=require('../src/app/api/account/commerce/route');
 const req=()=>new NextRequest('http://localhost/api/account/commerce?userId=attacker&currency=USD',{headers:{cookie:'ar_report_session='+createReportSession('verified-user')}});
 assert.equal((await GET(new NextRequest('http://localhost/api/account/commerce?userId=verified-user'))).status,401);
 let response=await GET(req());let data=await response.json();assert.equal(data.currency,'INR');assert.deepEqual(data.products,[]);
 current='US';response=await GET(req());data=await response.json();assert.equal(data.currency,'USD');assert.equal(data.userId,'verified-user');assert.ok(response.cookies.get('ar_us_main_owner').httpOnly);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(data.products.find(p=>p.id==='coins-50').cents,212);
 t.mock.method(market,'customerMarket',async()=>{throw new Error('offline');});assert.equal((await GET(req())).status,503);
});

test('US unlimited pass is looked up by owner and expiry; lookup failure never becomes free credit use',async t=>{
 const dbModule=require('../src/lib/supabase-admin'),{activeUsChatPass}=require('../src/lib/customer-market');
 let response={data:{order_id:'verified-pass',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+1200000).toISOString()},error:null};
 t.mock.method(dbModule,'getSupabaseAdmin',()=>({from(table){assert.equal(table,'us_main_chat_passes');const q={select(){return q},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'verified-user');return q},gt(k,v){assert.equal(k,'ends_at');assert.ok(Date.parse(v)<=Date.now());return q},order(){return q},limit(){return q},async maybeSingle(){return response}};return q;}}));
 const pass=await activeUsChatPass('verified-user');assert.equal(pass.id,'verified-pass');assert.ok(pass.remainingSeconds>1190&&pass.remainingSeconds<=1200);
 response={data:null,error:null};assert.equal(await activeUsChatPass('verified-user'),null);
 response={data:null,error:{message:'offline'}};await assert.rejects(activeUsChatPass('verified-user'),/lookup failed/);
});

test('discounted sessions verify against original subtotal and captured amount',()=>{
 const discounted=structuredClone(session);discounted.amount_subtotal=704;discounted.amount_total=500;discounted.total_details={amount_discount:204,amount_tax:0,amount_shipping:0};discounted.payment_intent.amount_received=500;discounted.payment_intent.latest_charge.amount=500;
 assert.equal(verifyUsSession(order,discounted).amount,500);
 for(const bad of [{amount_subtotal:703},{amount_total:499},{total_details:{amount_discount:200}},{payment_intent:{...discounted.payment_intent,amount_received:704}}])assert.throws(()=>verifyUsSession(order,{...discounted,...bad}));
 const free={...discounted,amount_total:0,total_details:{amount_discount:704},payment_intent:null,payment_status:'no_payment_required'};
 assert.equal(verifyUsSession(order,free).amount,0);assert.equal(verifyUsSession(order,{...free,status:'open'}),null);
 const payload=purchasePayloads({...order,paid_amount_cents:500});assert.equal(payload.ga.events[0].params.value,5);assert.equal(payload.ga.events[0].params.items.reduce((n,i)=>n+i.price,0),5);
});
