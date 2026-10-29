const assert=require('node:assert/strict'),{test,beforeEach}=require('node:test');
const Module=require('node:module'),path=require('node:path'),{createHmac}=require('node:crypto');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
let rows,calls,grants,sends,status,failGrant,failStatus,failInbox,concurrentPaid;
const db={from(table){let values=null,filters=[];const run=async()=>{const row=[...rows.values()].find(r=>r.table===table&&filters.every(f=>f(r)));if(row&&values)Object.assign(row,values);return {data:row?{...row}:null,error:null}};const q={select(){return q},update(v){values=v;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},or(){filters.push(r=>!r.gateway_check_until||Date.parse(r.gateway_check_until)<Date.now());return q},maybeSingle:run,single:run,then(ok,bad){return run().then(ok,bad)},upsert:async row=>{if(failInbox)return {error:{message:'offline'}};const id=row.event_id||row.id;if(!rows.has(id))rows.set(id,{...row,table});return {error:null}}};return q}};
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>db});
const api=require('../src/lib/pinelabs-api');
const id='pnl'+'a'.repeat(24),sm='sm_'+'b'.repeat(20);
const remote=ref=>({order_id:'remote-'+ref,merchant_order_reference:ref,merchant_id:'421588',type:'CHARGE',status,order_amount:{value:10000,currency:'INR'},payments:[{id:'txn-'+ref,status:'PROCESSED',payment_amount:{value:10000,currency:'INR'},updated_at:'2026-01-01T10:02:00Z'}]});
stub('../src/lib/pinelabs-api',{...api,fetchPineLabsOrder:async(ref,mode,provider)=>{calls++;await Promise.resolve();if(failStatus)throw Error('offline');const key=provider?ref.replace(/^remote-/,''):ref;if(concurrentPaid&&rows.has(key))Object.assign(rows.get(key),{payment_status:'paid',fulfilled_at:new Date().toISOString()});return remote(key)}});
stub('../src/lib/payu-fulfillment',{fulfillPayUPayment:async(payload,options)=>{assert.equal(options.verifiedByPineLabsApi,true);assert.equal(payload.amount,'100.00');if(failGrant)throw Error('DB fail');grants++;Object.assign(rows.get(payload.txnid),{payment_status:'paid',fulfilled_at:new Date().toISOString(),gateway_transaction_id:payload.mihpayid});return {success:true}}});
stub('../src/lib/soulmate-purchase-tracking',{sendSoulmatePurchase:async()=>{sends++}});
stub('../src/lib/soulmate-invoice',{confirmSoulmatePurchase:async()=>{sends++}});
stub('../src/lib/soulmate-payu',{receiptPath:id=>`/soulmate/payment?order=${id}`,receiptCookie:id=>({name:`receipt_${id}`,value:'signed',httpOnly:true})});
const {reconcilePineLabsOrder}=require('../src/lib/pinelabs-reconciliation');
const {pineLabsWebhook,pineLabsCallback,processPineLabsEvent}=require('../src/lib/pinelabs-notification');
const {NextRequest}=require('next/server');
beforeEach(()=>{rows=new Map();calls=grants=sends=0;status='PROCESSED';failGrant=failStatus=failInbox=concurrentPaid=false;Object.assign(process.env,{PINELABS_CLIENT_ID:'fixture',PINELABS_CLIENT_SECRET:'fixture',PINELABS_MERCHANT_ID:'421588',PINELABS_ENVIRONMENT:'production',PINELABS_CALLBACK_SECRET:'ab'.repeat(32)});delete process.env.PINELABS_CALLBACK_ORIGIN;delete process.env.LOCAL_PAYMENT_GATEWAY});
function seed(ref=id,extra={}){const row={id:ref,table:ref.startsWith('sm_')?'soulmate_orders':'payments',gateway:'pinelabs',amount:10000,currency:'INR',payment_mode:'live',payment_status:'pending',customer_email:'fixture@example.com',delivery_hours:12,...extra};rows.set(ref,row);return row}
test('simultaneous status and callback reconciliation claims one lease and grants once',async()=>{seed();await Promise.all([reconcilePineLabsOrder(id),reconcilePineLabsOrder(id)]);assert.equal(calls,1);assert.equal(grants,1);await reconcilePineLabsOrder(id);assert.equal(calls,1)});
test('pending, authorized and failed never unlock; stale failure cannot downgrade paid order',async()=>{
 for(const s of ['PENDING','AUTHORIZED','FAILED']){const row=seed();status=s;await reconcilePineLabsOrder(id);assert.equal(row.payment_status,s==='FAILED'?'failed':'pending');assert.equal(grants,0)}
 const row=seed();concurrentPaid=true;await reconcilePineLabsOrder(id);assert.equal(row.payment_status,'paid');
});
test('outage and failed fulfillment stay retryable without inventing a successful payment',async()=>{const row=seed();failStatus=true;await assert.rejects(reconcilePineLabsOrder(id));assert.equal(row.payment_status,'pending');row.gateway_check_until=null;failStatus=false;failGrant=true;await assert.rejects(reconcilePineLabsOrder(id));assert.equal(row.payment_status,'pending');assert.equal(grants,0)});
test('wrong gateway and test/live mismatch are rejected before any API request',async()=>{await assert.rejects(reconcilePineLabsOrder(id));seed(id,{gateway:'payu'});await assert.rejects(reconcilePineLabsOrder(id));seed(id,{payment_mode:'test'});await assert.rejects(reconcilePineLabsOrder(id));assert.equal(calls,0)});
test('Soulmate preserves purchased items and schedules from payment time, sends once',async()=>{const row=seed(sm,{line_items:[{id:'color'}],answers:{name:'Fixture'}});await reconcilePineLabsOrder(sm);assert.equal(row.payment_status,'paid');assert.equal(row.fulfillment_status,'queued');assert.equal(Date.parse(row.delivery_due_at)-Date.parse(row.paid_at),12*3600000);assert.deepEqual(row.line_items,[{id:'color'}]);await reconcilePineLabsOrder(sm);assert.equal(sends,2)});
function callback(ref,valid=true,fields={}){return new NextRequest('https://astrorekha.com/api/pinelabs/callback?state='+encodeURIComponent(valid?api.pineLabsReturnToken(ref):'forged'),{method:'POST',body:new URLSearchParams({order_id:'remote-'+ref,status:'PROCESSED',...fields})})}
test('forged callback cannot query orders, grant access or mint receipt cookies',async()=>{seed(sm);const response=await pineLabsCallback(callback(sm,false));assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);assert.equal(calls,0)});
test('valid browser return reaches recovery page during status outage using saved binding',async()=>{seed(id,{gateway_order_id:'remote-'+id});failStatus=true;const response=await pineLabsCallback(callback(id));assert.equal(response.status,303);assert.match(response.headers.get('location'),new RegExp(`payment/processing\\?txnid=${id}`));assert.equal(grants,0)});
test('lost checkout response recovers provider binding through API and callback',async()=>{const row=seed();const response=await pineLabsCallback(callback(id));assert.equal(response.status,303);assert.equal(row.gateway_order_id,'remote-'+id);assert.equal(row.payment_status,'paid');assert.equal(calls,1)});
function webhook(valid=true,eventId='event-1'){const raw=JSON.stringify({event_type:'ORDER_PROCESSED',data:{order_id:'remote-'+id}}),timestamp=String(Math.floor(Date.now()/1000));const sig=createHmac('sha256',Buffer.from(process.env.PINELABS_CLIENT_SECRET,'utf8')).update(`${eventId}.${timestamp}.${raw}`).digest('base64');return new NextRequest('https://astrorekha.com/api/pinelabs/webhook',{method:'POST',body:raw,headers:{'webhook-id':eventId,'webhook-timestamp':timestamp,'webhook-signature':valid?`v1,${sig}`:'forged'}})}
test('signed webhook persists before acknowledgement, duplicate delivery grants once',async()=>{seed();assert.equal((await pineLabsWebhook(webhook(false))).status,400);assert.equal(rows.has('event-1'),false);assert.equal((await pineLabsWebhook(webhook())).status,200);assert.ok(rows.get('event-1').processed_at);assert.equal((await pineLabsWebhook(webhook())).status,200);assert.equal(grants,1);assert.equal(calls,1)});
test('webhook outage queues durable retry; failure to persist asks provider to retry',async()=>{seed();failStatus=true;let response=await pineLabsWebhook(webhook());assert.equal(response.status,200);assert.equal((await response.json()).queued,true);assert.equal(rows.get('event-1').processed_at,undefined);failStatus=false;await processPineLabsEvent(rows.get('event-1'));assert.equal(grants,1);assert.ok(rows.get('event-1').processed_at);failInbox=true;response=await pineLabsWebhook(webhook(true,'event-2'));assert.equal(response.status,503)});
test('shared status and checkout ownership route preserve Pine Labs reference and purchase mapping',async()=>{const {GET}=require('../src/app/api/payu/status/route');seed(id,{type:'bundle',bundle_id:'palm-reading',user_id:'fixture-user'});let response=await GET(new NextRequest(`https://astrorekha.com/api/payments/status?txnid=${id}&checkoutEmail=another@example.com`));assert.equal((await response.json()).matchesCheckout,false);assert.equal(calls,0);response=await GET(new NextRequest(`https://astrorekha.com/api/payments/status?txnid=${id}`));const body=await response.json();assert.equal(body.gateway,'pinelabs');assert.equal(body.status,'paid');assert.equal(body.bundleId,'palm-reading');assert.equal(body.userId,'fixture-user');assert.equal(body.amount,100)});

test('verified refund replay writes one negative attributed ledger entry without changing entitlements',async()=>{
 const row=seed(id,{payment_status:'paid',gateway_order_id:'remote-'+id,user_id:'fixture-user',utm_campaign:'original-campaign',bundle_id:'palm-reading',type:'bundle'});
 const refund={...remote(id),order_id:'refund-one',type:'REFUND',parent_order_id:'remote-'+id,status:'PROCESSED',order_amount:{value:3000,currency:'INR'},updated_at:'2026-01-02T10:00:00Z'};
 const {recordPineLabsRefund}=require('../src/lib/pinelabs-refunds');await recordPineLabsRefund(refund,'live');await recordPineLabsRefund(refund,'live');
 const entries=[...rows.values()].filter(r=>r.payment_status==='refunded');assert.equal(entries.length,1);assert.equal(entries[0].amount,-3000);assert.equal(entries[0].gateway,'pinelabs');assert.equal(entries[0].utm_campaign,'original-campaign');assert.equal(entries[0].paid_at,'2026-01-02T10:00:00.000Z');assert.equal(row.payment_status,'paid');assert.equal(grants,0);
});

test('failed individual attempts acknowledge the notification without falsely failing the retryable order',async()=>{
 const row=seed();status='ATTEMPTED';const event={event_id:'failed-attempt',event_type:'PAYMENT_FAILED',provider_order_id:'remote-'+id,payment_mode:'live',table:'pinelabs_webhook_events'};rows.set(event.event_id,event);
 await processPineLabsEvent(event);assert.ok(rows.get(event.event_id).processed_at);assert.equal(row.payment_status,'pending');assert.equal(grants,0);
});

test('callback status and signature cannot override API result; no callback secret is needed',async()=>{
 delete process.env.PINELABS_CALLBACK_SECRET;
 const row=seed();status='PENDING';const response=await pineLabsCallback(callback(id,true,{status:'PROCESSED',signature:'fabricated'}));
 assert.equal(response.status,303);assert.equal(calls,1);assert.equal(grants,0);assert.equal(row.payment_status,'pending');
});
test('return token cannot be swapped to another provider order or amount',async()=>{
 seed(sm,{gateway_order_id:'remote-'+sm});const response=await pineLabsCallback(callback(sm,true,{order_id:'remote-'+id}));
 assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);assert.equal(calls,0);
 seed(id,{amount:1});const wrongAmount=await pineLabsCallback(callback(id));assert.equal(wrongAmount.status,503);assert.equal(grants,0);
});
test('unbound provider order still must match the token reference; a valid return restores only its own receipt',async()=>{
 seed(sm);seed(id);const wrong=await pineLabsCallback(callback(sm,true,{order_id:'remote-'+id}));assert.equal(wrong.status,503);assert.equal(wrong.headers.get('set-cookie'),null);assert.equal(grants,0);
 const valid=await pineLabsCallback(callback(sm));assert.equal(valid.status,303);assert.match(valid.headers.get('set-cookie'),new RegExp('receipt_'+sm));assert.equal(rows.get(sm).payment_status,'paid');
});
test('GET return uses identical API verification and rejects duplicate state',async()=>{
 seed();const url='https://astrorekha.com/api/pinelabs/callback?state='+encodeURIComponent(api.pineLabsReturnToken(id))+'&order_id=remote-'+id+'&status=FAILED';
 const duplicate=await pineLabsCallback(new NextRequest(url+'&state=forged'));assert.equal(duplicate.status,400);assert.equal(calls,0);
 const response=await pineLabsCallback(new NextRequest(url));assert.equal(response.status,303);assert.equal(grants,1);
});
