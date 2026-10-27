/* Isolated fixtures only: no analytics events, payments or DB requests leave this process. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const rows = new Map();
const tables = [];
const db = { from(table) {
  tables.push(table); assert.equal(table, 'us_soulmate_orders');
  let values, filters = [];
  const q = {
    update(v) { values = v; return q; }, eq(k,v) { filters.push(row => row[k] === v); return q; },
    is(k,v) { filters.push(row => (row[k] ?? null) === v); return q; },
    or(expr) { const [empty, stale] = expr.split(','); const key = empty.split('.')[0]; const cutoff = stale.split('.lt.')[1]; filters.push(row => !row[key] || row[key] < cutoff); return q; },
    select() { return q; }, maybeSingle() { return run(); }, then(yes,no) { return run().then(yes,no); },
  };
  async function run() { const row = [...rows.values()].find(row => filters.every(fn => fn(row))); if (row) Object.assign(row,values); return { data: row ? {id:row.id} : null, error:null }; }
  return q;
} };
function stub(file,exports) { const id=require.resolve(file); require.cache[id]={id,filename:id,loaded:true,exports}; }
stub('../src/lib/supabase-admin',{ getSupabaseAdmin:()=>db });
const { sendSoulmatePurchase, soulmatePurchasePayloads } = require('../src/lib/us-soulmate-purchase-tracking');
const order = () => ({ id:'us_sm_12345678901234567890', plan:'standard', amount:4366, payment_mode:'live', payment_status:'paid', paid_at:new Date().toISOString(), customer_email:'TEST@example.com', customer_phone:'919876543210', product_info:'Soulmate Sketch', attribution:{trackingEnvironment:'production',gaClientId:'123.456',gaSessionId:'123',sessionId:'s1',marketing:{utm_source:'meta',utm_campaign:'Soulmate',fbp:'fb.1.123.456'}} });
let requests, failMeta, failGa;
beforeEach(()=>{
  rows.clear(); tables.length=0; requests=[]; failMeta=false; failGa=false;
  process.env.VERCEL_ENV='production'; process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID='pixel'; process.env.US_SOULMATE_META_CAPI_ACCESS_TOKEN='fixture'; process.env.US_SOULMATE_GA4_MEASUREMENT_ID='G-TEST'; process.env.US_SOULMATE_GA4_API_SECRET='fixture';
  global.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)}); return {ok:(!failMeta||!url.includes('facebook'))&&(!failGa||!url.includes('google-analytics')),json:async()=>({events_received:1})};};
});
test('test payments, local orders, pending and failed payments cannot emit purchases',async()=>{
  for (const change of [{payment_mode:'test'},{payment_status:'pending'},{payment_status:'failed'},{attribution:{trackingEnvironment:'preview'}}]) await sendSoulmatePurchase({...order(),...change});
  process.env.VERCEL_ENV='preview'; await sendSoulmatePurchase(order()); assert.equal(requests.length,0); assert.equal(tables.length,0);
});
test('purchase uses server amount, namespaced item, hashed contact fields and stable dedupe ID',()=>{
  const input=order(), payload=soulmatePurchasePayloads(input);
  assert.equal(payload.meta.event_id,input.id); assert.equal(payload.meta.custom_data.value,43.66);
  assert.deepEqual(payload.meta.custom_data.content_ids,['us_soulmate_standard']);
  assert.match(payload.meta.user_data.em[0],/^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(payload).includes('TEST@example.com'));
  assert.equal(payload.ga.events[0].params.transaction_id,input.id); assert.equal(payload.ga.client_id,'123.456');
});
test('concurrent verification and repeated receipts emit one purchase per provider',async()=>{
  const input=order(); rows.set(input.id,{...input});
  await Promise.all([sendSoulmatePurchase(input),sendSoulmatePurchase(input)]); await sendSoulmatePurchase(input);
  assert.equal(requests.length,2); assert.ok(rows.get(input.id).meta_purchase_sent_at); assert.ok(rows.get(input.id).ga_purchase_sent_at);
});
test('failed provider retries without resending the successful provider',async()=>{
  const input=order(); rows.set(input.id,{...input}); failMeta=true; await sendSoulmatePurchase(input);
  assert.equal(rows.get(input.id).meta_purchase_sent_at,undefined); assert.equal(rows.get(input.id).meta_purchase_claimed_at,null);
  failMeta=false; await sendSoulmatePurchase(input); assert.equal(requests.length,3); assert.ok(rows.get(input.id).meta_purchase_sent_at);
});
test('missing GA cookie does not fabricate a user and Meta can still report the sale',async()=>{
  const input=order(); input.attribution.gaClientId=null; rows.set(input.id,{...input}); await sendSoulmatePurchase(input);
  assert.equal(requests.length,1); assert.ok(requests[0].url.includes('facebook'));
});
test('GA does not silently re-date sales older than its backdating limit',async()=>{
  const input=order(); input.paid_at=new Date(Date.now()-73*3600000).toISOString(); rows.set(input.id,{...input});
  await sendSoulmatePurchase(input);
  assert.equal(requests.filter(r=>r.url.includes('google-analytics')).length,0);
  assert.equal(rows.get(input.id).ga_purchase_sent_at,undefined);
});

test('receipt recovery after a missing identity sends GA once without resending Meta',async()=>{
  const input=order();input.attribution.gaClientId=null;rows.set(input.id,{...input});
  await sendSoulmatePurchase(input);
  const recovered={...rows.get(input.id),attribution:{...input.attribution,gaClientId:'123.456',gaSessionId:'123'}};
  rows.set(input.id,recovered);
  await Promise.all([sendSoulmatePurchase(recovered),sendSoulmatePurchase(recovered)]);
  assert.equal(requests.filter(r=>r.url.includes('facebook')).length,1);
  const ga=requests.filter(r=>r.url.includes('google-analytics'));assert.equal(ga.length,1);
  assert.equal(ga[0].body.events[0].params.currency,'USD');assert.equal(ga[0].body.events[0].params.transaction_id,input.id);
});

test('a failed GA send is retryable and never duplicates the already-sent Meta purchase',async()=>{
  const input=order();rows.set(input.id,{...input});failGa=true;
  await sendSoulmatePurchase(input);
  assert.ok(rows.get(input.id).meta_purchase_sent_at);
  assert.equal(rows.get(input.id).ga_purchase_sent_at,undefined);
  assert.equal(rows.get(input.id).ga_purchase_claimed_at,null);
  failGa=false;await sendSoulmatePurchase(input);await sendSoulmatePurchase(input);
  assert.equal(requests.filter(r=>r.url.includes('facebook')).length,1);
  assert.equal(requests.filter(r=>r.url.includes('google-analytics')).length,2);
  assert.ok(rows.get(input.id).ga_purchase_sent_at);
});
