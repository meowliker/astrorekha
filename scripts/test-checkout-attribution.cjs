const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {NextRequest,NextResponse}=require('next/server');
const {checkoutAttributionToken,readCheckoutAttributionToken,withCheckoutAttribution,checkoutAdTouch,paymentAttributionPatch,captureCheckoutAdTouch,finalizeCheckoutAttribution}=require('../src/lib/checkout-attribution');
const {matchesAdSource}=require('../src/lib/admin-acquisition');
const {googleOrderAccount}=require('../src/lib/google-ads-reporting');
process.env.REPORT_SESSION_SECRET='isolated-unit-test-secret';
const googleUrl='https://astrorekha.com/discover?gclid=verified-click&gad_campaignid=24406367754';
test('signed checkout cookie is scoped, expires, rejects tampering and grants no report access',()=>{
 const token=checkoutAttributionToken('fixture-order',10000000);
 assert.equal(readCheckoutAttributionToken(token,10001000),'fixture-order');
 assert.equal(readCheckoutAttributionToken(token,10000000+7200001),null);
 assert.equal(readCheckoutAttributionToken(token+'x',10001000),null);
 assert.equal(readCheckoutAttributionToken(token+'.extra',10001000),null);
 const response=withCheckoutAttribution(NextResponse.json({ok:true}),'fixture-order');
 assert.equal(response.cookies.getAll().length,1);assert.ok(response.cookies.get('ar_checkout_attribution').httpOnly);
});
test('capture accepts explicit Google/Meta arrivals, not clean, unrelated or other-product routes',()=>{
 const t=checkoutAdTouch(googleUrl,'https://astrorekha.com');assert.equal(t.utm_source,'google');assert.equal(t.utm_medium,'cpc');assert.equal(t.google_campaign_id,'24406367754');
 for(const url of ['https://astrorekha.com/discover','https://evil.com/discover?gclid=x','https://astrorekha.com/us?gclid=x','https://astrorekha.com/soulmate/discover?gclid=x','https://astrorekha.com/login?gclid=x','https://astrorekha.com/?utm_source=google&utm_medium=organic'])assert.equal(checkoutAdTouch(url,'https://astrorekha.com'),null);
 assert.equal(checkoutAdTouch('https://astrorekha.com/?utm_source=facebook&utm_medium=paid&meta_campaign_id=123','https://astrorekha.com').meta_campaign_id,'123');
});
test('one whole final touch assigns the Nov15 scenario to USA Google, not Meta',()=>{
 const old={id:'fixture-order',amount:188682,payment_status:'paid',first_touch:{utm_source:'facebook',utm_medium:'paid'},last_touch:{utm_source:'facebook',utm_medium:'paid',meta_campaign_id:'old-meta'},fb_campaign_id:'old-meta'};
 const patch=paymentAttributionPatch(checkoutAdTouch(googleUrl,'https://astrorekha.com'),'2026-11-15T10:15:01Z');const row={...old,...patch};
 assert.equal(matchesAdSource(row,'google'),true);assert.equal(matchesAdSource(row,'meta'),false);assert.equal(matchesAdSource(row,'all'),true);
 assert.equal(googleOrderAccount(row,[{id:'24406367754',name:'Brand',accountId:'4870113996'}]),'4870113996');
 assert.equal(row.amount,188682);assert.deepEqual(row.first_touch,old.first_touch);assert.equal(row.fb_campaign_id,null);
 for(const k of ['payment_status','amount','fulfilled_at','ga_purchase_sent_at','meta_purchase_sent_at','first_touch'])assert.equal(k in patch,false);
});
// A small in-memory database boundary tests the real capture/finalization functions, with no external writes.
const admin=require('../src/lib/supabase-admin');
let order,touches,writes,fail;
admin.getSupabaseAdmin=()=>({from(table){
 let patch,conditions=[],insert=false,sort=false;
 const q={select(){return q},eq(k,v){conditions.push(r=>r[k]===v);return q},is(k,v){conditions.push(r=>r[k]==v);return q},gte(k,v){conditions.push(r=>r[k]>=v);return q},lte(k,v){conditions.push(r=>r[k]<=v);return q},order(){sort=true;return q},limit(){return q},abortSignal(){return q},update(p){patch=p;return q},upsert(p){patch=p;insert=true;return q},maybeSingle(){return run()},then(ok,bad){return run().then(ok,bad)}};
 async function run(){if(fail)return {error:{message:'offline'},data:null};if(insert){if(!touches.some(t=>t.payment_id===patch.payment_id&&t.touch_key===patch.touch_key))touches.push({...patch,observed_at:new Date().toISOString()});return {data:null,error:null}}
 let rows=(table==='payments'?[order]:touches).filter(r=>conditions.every(f=>f(r)));if(sort)rows.sort((a,b)=>b.observed_at.localeCompare(a.observed_at));const r=rows[0]||null;if(r&&patch){Object.assign(r,patch);writes.push(patch)}return {data:r,error:null}}
 return q;
}});
function reset(){order={id:'fixture-order',payment_status:'pending',amount:188682,created_at:'2026-11-15T10:14:40Z',first_touch:{utm_source:'facebook'},ga_purchase_sent_at:null,meta_purchase_sent_at:null};touches=[];writes=[];fail=false;}
test('only authenticated checkout cookie captures evidence, preserving first observation on retry',async()=>{
 reset();order.created_at=new Date(Date.now()-60000).toISOString();const token=checkoutAttributionToken(order.id);
 const req=(cookie,origin='https://astrorekha.com')=>new NextRequest('https://astrorekha.com/api/marketing/event',{method:'POST',headers:{origin,cookie:cookie?`ar_checkout_attribution=${cookie}`:''}});
 await captureCheckoutAdTouch(req(null),googleUrl);await captureCheckoutAdTouch(req(token,'https://evil.com'),googleUrl);assert.equal(touches.length,0);
 await captureCheckoutAdTouch(req(token),googleUrl);await captureCheckoutAdTouch(req(token),googleUrl);assert.equal(touches.length,1);assert.equal(writes.length,0);assert.equal(order.payment_status,'pending');
 order.payment_status='paid';await captureCheckoutAdTouch(req(token),googleUrl+'&utm_term=after-paid');assert.equal(touches.length,1);
});
test('finalization uses only pre-payment evidence, preserves financial fields and prevents replay',async()=>{
 reset();order.payment_status='paid';const original=structuredClone(order);
 touches=[{payment_id:order.id,observed_at:'2026-11-15T10:15:01Z',touch:checkoutAdTouch(googleUrl,'https://astrorekha.com'),ga_client_id:'1.2',ga_session_id:'123'},
 {payment_id:order.id,observed_at:'2026-11-15T10:15:31Z',touch:{utm_source:'facebook',utm_medium:'paid'}},
 {payment_id:'other-order',observed_at:'2026-11-15T10:15:29Z',touch:{utm_source:'facebook',utm_medium:'paid'}}];
 const result=await finalizeCheckoutAttribution(original,'2026-11-15T10:15:30Z');assert.equal(result.utm_source,'google');assert.equal(result.ga_client_id,'1.2');assert.equal(writes.length,1);assert.equal(order.amount,original.amount);assert.deepEqual(order.first_touch,original.first_touch);
 order.ga_purchase_sent_at='2026-11-15T10:15:32Z';await finalizeCheckoutAttribution(order,'2026-11-15T10:15:30Z');assert.equal(writes.length,1);
});
test('no evidence and unavailable schema cannot manufacture an attribution or payment',async()=>{
 reset();order.payment_status='paid';assert.deepEqual(await finalizeCheckoutAttribution(order,'2026-11-15T10:15:30Z'),order);assert.equal(writes.length,0);
 fail=true;await assert.rejects(finalizeCheckoutAttribution(order,'2026-11-15T10:15:30Z'));assert.equal(order.amount,188682);assert.equal(writes.length,0);
});
