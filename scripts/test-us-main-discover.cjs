const assert=require('node:assert/strict'),{test}=require('node:test'),Module=require('node:module'),path=require('node:path');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const routes=require('../src/lib/us-main/google-ads-funnel');
const attribution=require('../src/lib/us-main/attribution-client');
const {acquisitionChannel}=require('../src/lib/admin-acquisition');
const {googleDestination}=require('../src/lib/google-ads-reporting');
const {purchasePayloads}=require('../src/lib/us-main/tracking-server');
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function browser(t,url){const w={location:new URL(url),localStorage:memory(),sessionStorage:memory()};t.mock.property(global,'window',w);t.mock.property(global,'document',{cookie:'',referrer:''});return w}
// Node's property mock requires an existing property.
global.window=undefined;global.document=undefined;
test('all Google prepayment destinations remain scoped; shared payment/report and normal routes unchanged',()=>{
 for(const step of [...routes.GOOGLE_ADS_STEPS,'bundle-pricing']){const source='/us/onboarding'+(step?'/'+step:'');assert.equal(routes.onboardingDestination(source+'?x=1#form',true),source.replace('/us/onboarding','/us/discover/onboarding')+'?x=1#form');assert.equal(routes.onboardingDestination(source,false),source)}
 for(const shared of ['/us/payment?order=x','/us/onboarding/bundle-upsell','/us/onboarding/step-19','/us/onboarding/step-20','/reports','/us/soulmate','/discover'])assert.equal(routes.onboardingDestination(shared,true),shared);
 assert.equal(routes.onboardingDestination('/us',true),'/us/discover');
 assert.ok(routes.isUSMainPath('/us/discover/onboarding/step-15'));assert.ok(!routes.isUSMainPath('/us/soulmate/discover'));assert.ok(!routes.isUSMainPath('/us/discovery'));
});
test('Google and normal US attribution remain separate and survive the shared return/upsell',t=>{
 const w=browser(t,'https://astrorekha.com/us?utm_source=facebook&utm_medium=paid_social&meta_campaign_id=12345');
 attribution.captureAttributionFromPage();const normal=w.localStorage.getItem('astrorekha_us_main_attribution');
 w.location=new URL('https://astrorekha.com/us/discover?utm_source=google&utm_medium=cpc&gad_campaignid=998877&gclid=fixtureclick');
 const google=attribution.captureAttributionFromPage();assert.equal(google.google_campaign_id,'998877');assert.equal(google.gclid,'fixtureclick');assert.ok(!google.meta_campaign_id);assert.equal(acquisitionChannel(google),'google');assert.equal(w.localStorage.getItem('astrorekha_us_main_attribution'),normal);
 for(const path of ['/us/discover/onboarding/step-15','/us/discover/onboarding/bundle-pricing','/us/payment','/us/onboarding/bundle-upsell']){w.location=new URL('https://astrorekha.com'+path);assert.equal(attribution.getPaymentAttributionPayload().gclid,'fixtureclick')}
 w.location=new URL('https://astrorekha.com/us');assert.equal(acquisitionChannel(attribution.captureAttributionFromPage()),'meta');assert.equal(w.localStorage.getItem('astrorekha_us_main_attribution'),normal);
});
test('untagged Discover uses route mapping without inventing campaign IDs or inheriting normal Meta tags',t=>{
 const w=browser(t,'https://astrorekha.com/us?utm_source=facebook&utm_medium=cpc');attribution.captureAttributionFromPage();
 w.location=new URL('https://astrorekha.com/us/discover');const tags=attribution.captureAttributionFromPage();assert.equal(acquisitionChannel(tags),'google');assert.ok(!tags.gclid);assert.ok(!tags.utm_source);assert.equal(googleDestination(tags.landing_url),'us-main');
});
test('new campaign-only landing replaces previous Google click as a whole',t=>{
 const w=browser(t,'https://astrorekha.com/us/discover?gclid=old&gad_campaignid=111');attribution.captureAttributionFromPage();w.location=new URL('https://astrorekha.com/us/discover?gad_campaignid=222');const tags=attribution.captureAttributionFromPage();assert.equal(tags.google_campaign_id,'222');assert.ok(!tags.gclid);
});
test('checkout retry is restricted to known same-site paywalls',()=>{
 assert.equal(routes.usBundleRetryPath({landing_path:'/us/discover?gclid=abc'}),routes.GOOGLE_ADS_PAYWALL);
 for(const value of ['/us','/us/soulmate/discover','https://bad.example/us/discover','//bad.example/us/discover','/us/discovery'])assert.equal(routes.usBundleRetryPath({landing_path:value}),'/us/onboarding/bundle-pricing');
});
test('Google purchase retains original event IDs, USD values and destinations with one variant tag',()=>{
 const order={id:'us_ar_fixture',paid_at:new Date().toISOString(),customer_email:'fixture@example.invalid',amount_cents:2013,paid_amount_cents:100,attribution:{gaClientId:'123.456',gaSessionId:'123',marketing:{landing_path:'/us/discover'}},line_items:[{id:'palm-birth-sketch',name:'Bundle',cents:2013}]};
 const p=purchasePayloads(order);assert.equal(p.ga.events.length,1);assert.equal(p.ga.events[0].params.transaction_id,order.id);assert.equal(p.ga.events[0].params.funnel_variant,'google_discover');assert.equal(p.ga.events[0].params.value,1);assert.equal(p.ga.events[0].params.currency,'USD');assert.equal(p.meta.event_id,order.id);
});
test('US arrivals loader includes Google entry with independent source classification',async()=>{
 const {readSoulmateUtmVisits}=require('../src/lib/us-main-tracking-data');let paths;
 const rows=[{id:1,path:'/us',session_id:'normal',created_at:'2026-11-18T01:00:00Z',attribution:{}},{id:2,path:'/us/discover',session_id:'google',created_at:'2026-11-18T01:00:01Z',attribution:{google_campaign_id:'998877',gclid:'fixtureclick'}}];
 const q={select(){return q},eq(){return q},in(k,v){paths=v;return q},gte(){return q},lt(){return q},order(){return q},range:async()=>({data:rows,error:null})};
 const visits=await readSoulmateUtmVisits({from:()=>q},'2026-11-18','2026-11-19');assert.deepEqual(paths,['/us','/us/discover']);assert.deepEqual(visits.map(v=>v.channel),['meta','google']);assert.equal(visits.length,2);assert.equal(visits[1].campaignId,'998877');
});
test('US event endpoint accepts scoped Google steps, keeps local events local and rejects other funnels',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),admin=require('../src/lib/supabase-admin'),auth=require('../src/lib/report-session'),api=require('../src/app/api/us/main/events/route');let saved=null;
 t.mock.method(server,'sameOrigin',()=>true);t.mock.method(auth,'reportSessionUser',()=>null);
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(table){assert.equal(table,'us_main_events');const q={select(){return q},eq(){return q},gte:async()=>({count:0,error:null}),upsert:async row=>{saved=row;return {error:null}}};return q}}));
 const request=path=>new NextRequest('https://astrorekha.com/api/us/main/events',{method:'POST',body:JSON.stringify({eventId:'00000000-0000-4000-a000-000000000001',sessionId:'00000000-0000-4000-a000-000000000002',eventName:'page_view',path,attribution:{landing_path:'/us/discover',gclid:'fixture'}})});
 assert.equal((await api.POST(request('/us/discover/onboarding/step-15'))).status,200);assert.equal(saved.attribution.gclid,'fixture');assert.equal(saved.environment,'local');assert.equal(acquisitionChannel(saved.attribution),'google');
 for(const path of ['/us/soulmate/discover','/discover','/us/discovery'])assert.equal((await api.POST(request(path))).status,400);
});
test('authenticated status gives the saved Google retry URL without changing fulfillment',async t=>{
 const {NextRequest}=require('next/server'),server=require('../src/lib/us-main/server'),reconcile=require('../src/lib/us-main/reconcile'),api=require('../src/app/api/us/main/payment/status/route');
 const order={id:'fixture',type:'bundle',payment_status:'pending',amount_cents:704,attribution:{marketing:{landing_path:'/us/discover'}}};
 t.mock.method(server,'ownedOrder',async()=>order);t.mock.method(reconcile,'reconcileUsOrder',async o=>o);
 const r=await api.GET(new NextRequest('https://astrorekha.com/api/us/main/payment/status?order=fixture'));const body=await r.json();assert.equal(body.checkoutPath,routes.GOOGLE_ADS_PAYWALL);assert.equal(body.fulfilled,false);assert.equal(body.status,'pending');assert.equal(body.currency,'USD');
 t.mock.method(server,'ownedOrder',async()=>null);assert.equal((await api.GET(new NextRequest('https://astrorekha.com/api/us/main/payment/status?order=fixture'))).status,403);
});
global.localStorage=undefined;
test('Stripe retries reuse one reference per source, while normal US and Google baskets cannot collide',async t=>{
 const w=browser(t,'http://localhost/us/discover/onboarding/bundle-pricing');t.mock.property(global,'localStorage',w.localStorage);w.localStorage.setItem('astrorekha_us_main_email','fixture@example.invalid');
 const palm=require('../src/lib/checkout-palm-client'),ga=require('../src/lib/us-main/ga-client');t.mock.method(palm,'checkoutPalm',async()=>undefined);t.mock.method(ga,'readUsMainGaIdentity',async()=>({gaClientId:null,gaSessionId:null}));
 const {startUsCheckout}=require('../src/lib/us-main/checkout-client');const sent=[];
 t.mock.method(global,'fetch',async(url,opts)=>{assert.equal(url,'/api/us/main/checkout');sent.push(JSON.parse(opts.body));return new Response(JSON.stringify({orderId:'fixture',url:'https://checkout.stripe.com/fixture'}),{status:200})});
 const move=path=>{w.location=new URL('http://localhost'+path);w.location.assign=()=>{}};
 move('/us/discover/onboarding/bundle-pricing');await startUsCheckout('bundle',['palm-reading']);await startUsCheckout('bundle',['palm-reading']);assert.equal(sent[0].requestKey,sent[1].requestKey);
 move('/us/onboarding/bundle-pricing');await startUsCheckout('bundle',['palm-reading']);assert.notEqual(sent[0].requestKey,sent[2].requestKey);
 move('/us/discover/onboarding/bundle-pricing');await startUsCheckout('bundle',['palm-reading']);assert.equal(sent[0].requestKey,sent[3].requestKey);assert.equal(acquisitionChannel(sent[3].attribution.marketing),'google');
});
