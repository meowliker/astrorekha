const assert=require('node:assert/strict');const {test,beforeEach}=require('node:test');const Module=require('node:module'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
let rows,calls,grants,sendCount,status,failGrant,failStatus,concurrentPaid;
const db={from(table){let values=null,filters=[];const run=async()=>{let row=[...rows.values()].find(r=>r.table===table&&filters.every(f=>f(r)));if(row&&values)Object.assign(row,values);return {data:row?{...row}:null,error:null}};const q={select(){return q},update(v){values=v;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},or(){filters.push(r=>!r.gateway_check_until||Date.parse(r.gateway_check_until)<Date.now());return q},maybeSingle:run,then(ok,bad){return run().then(ok,bad)}};return q}};
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>db});
stub('../src/lib/paytm-api',{fetchPaytmStatus:async(id)=>{calls++;await Promise.resolve();if(failStatus)throw Error('offline');if(concurrentPaid)Object.assign(rows.get(id),{payment_status:'paid',fulfilled_at:new Date().toISOString()});return {state:status,txnId:'T1',txnDate:'2026-01-01 12:00:00'}},validatePaytmStatus:(order,result)=>result.state,verifyPaytmNotification:fields=>fields.CHECKSUMHASH==='verified'});
stub('../src/lib/payu-fulfillment',{fulfillPayUPayment:async(payload,options)=>{assert.equal(options.verifiedByPaytmApi,true);assert.equal(payload.amount,'100.00');if(failGrant)throw Error('DB fail');grants++;Object.assign(rows.get(payload.txnid),{payment_status:'paid',fulfilled_at:new Date().toISOString()});return {success:true}}});
stub('../src/lib/soulmate-purchase-tracking',{sendSoulmatePurchase:async()=>{sendCount++}});stub('../src/lib/soulmate-invoice',{confirmSoulmatePurchase:async()=>{sendCount++}});
stub('../src/lib/soulmate-payu',{receiptPath:id=>`/soulmate/payment?order=${id}`,receiptCookie:id=>({name:`receipt_${id}`,value:'signed',httpOnly:true})});
const {reconcilePaytmOrder,paytmPaidAt}=require('../src/lib/paytm-reconciliation');const {paytmNotification}=require('../src/lib/paytm-notification');const {NextRequest}=require('next/server');
beforeEach(()=>{rows=new Map();calls=grants=sendCount=0;status='paid';failGrant=failStatus=concurrentPaid=false;delete process.env.PAYTM_CALLBACK_ORIGIN});
function seed(id='ptm_fixture',extra={}){const row={id,table:id.startsWith('sm_')?'soulmate_orders':'payments',gateway:'paytm',amount:10000,payment_mode:'live',payment_status:'pending',customer_email:'fixture@example.com',delivery_hours:12,...extra};rows.set(id,row);return row}
test('concurrent browser and callback checks use one lease, grant once, then return cached payment',async()=>{seed();await Promise.all([reconcilePaytmOrder('ptm_fixture'),reconcilePaytmOrder('ptm_fixture')]);assert.equal(calls,1);assert.equal(grants,1);await reconcilePaytmOrder('ptm_fixture');assert.equal(calls,1)});
test('pending and failed responses never unlock access',async()=>{for(const s of ['pending','failed']){const row=seed();status=s;await reconcilePaytmOrder(row.id);assert.equal(row.payment_status,s);assert.equal(grants,0)}});
test('gateway outage and grant failure remain retryable; no paid status is synthesized',async()=>{const row=seed();failStatus=true;await assert.rejects(reconcilePaytmOrder(row.id));assert.equal(row.payment_status,'pending');assert.equal(grants,0);row.gateway_check_until=null;failStatus=false;failGrant=true;await assert.rejects(reconcilePaytmOrder(row.id));assert.equal(row.payment_status,'pending')});
test('late failure cannot downgrade a concurrently completed payment',async()=>{const row=seed();status='failed';concurrentPaid=true;await reconcilePaytmOrder(row.id);assert.equal(row.payment_status,'paid')});
test('unknown orders and orders belonging to PayU never call Paytm',async()=>{await assert.rejects(reconcilePaytmOrder('ptm_fixture'));seed('ptm_fixture',{gateway:'payu'});await assert.rejects(reconcilePaytmOrder('ptm_fixture'));assert.equal(calls,0)});
test('Soulmate verification preserves cart, queues delivery and sends confirmation once',async()=>{const row=seed('sm_12345678901234567890',{line_items:[{id:'color'}],answers:{name:'Fixture'}});await reconcilePaytmOrder(row.id);assert.equal(row.payment_status,'paid');assert.equal(row.gateway_transaction_id,'T1');assert.equal(row.fulfillment_status,'queued');assert.equal(Date.parse(row.delivery_due_at)-Date.parse(row.paid_at),12*3600000);assert.deepEqual(row.line_items,[{id:'color'}]);await reconcilePaytmOrder(row.id);assert.equal(sendCount,2);assert.equal(calls,1)});
test('payment date is interpreted as IST and future/invalid dates cannot distort delivery',()=>{const now=new Date('2026-01-02Z');assert.equal(paytmPaidAt('2026-01-01 12:00:00',now),'2026-01-01T06:30:00.000Z');assert.equal(paytmPaidAt('invalid',now),now.toISOString())});
const notification=(id,signature)=>new NextRequest('https://astrorekha.com/api/paytm/callback',{method:'POST',body:new URLSearchParams({ORDERID:id,CHECKSUMHASH:signature})});
test('unsigned callback cannot verify a payment or mint a private Soulmate receipt',async()=>{const row=seed('sm_12345678901234567890');const r=await paytmNotification(notification(row.id,'forged'),false);assert.equal(r.status,303);assert.equal(r.headers.get('set-cookie'),null);assert.equal(calls,0);assert.equal((await paytmNotification(notification(row.id,'forged'),true)).status,400)});
test('verified callback redirects to the existing recovery screen; temporary failure asks webhook to retry',async()=>{const row=seed();const r=await paytmNotification(notification(row.id,'verified'),false);assert.equal(r.status,303);assert.match(r.headers.get('location'),/payment\/processing\?txnid=ptm_fixture/);seed();failStatus=true;assert.equal((await paytmNotification(notification(row.id,'verified'),true)).status,503)});

test('short alphanumeric orders route through callbacks, status and fulfilment while legacy orders still reconcile',async()=>{
 const {createPaytmOrderId}=require('../src/lib/paytm-order-id');
 const {GET}=require('../src/app/api/payu/status/route');
 for(const id of [createPaytmOrderId(),'ptm_mvs262oic48560a57b31140158097d08']){
  seed(id);
  const callback=await paytmNotification(notification(id,'verified'),false);
  assert.equal(callback.status,303);assert.equal(new URL(callback.headers.get('location')).searchParams.get('txnid'),id);
  const response=await GET(new NextRequest(`https://astrorekha.com/api/payments/status?txnid=${id}`));
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.gateway,'paytm');assert.equal(data.status,'paid');
 }
 assert.equal(grants,2);assert.equal(calls,2);
});
