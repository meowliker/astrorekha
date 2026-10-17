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
  tables.push(table); assert.equal(table, 'soulmate_orders');
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
const { sendSoulmatePurchase, soulmatePurchasePayloads } = require('../src/lib/soulmate-purchase-tracking');
const { summarizeSoulmateAnalytics } = require('../src/lib/soulmate-analytics');
const order = () => ({ id:'sm_12345678901234567890', plan:'standard', amount:117882, payment_mode:'live', payment_status:'paid', paid_at:new Date().toISOString(), customer_email:'TEST@example.com', customer_phone:'919876543210', product_info:'Soulmate Sketch', attribution:{trackingEnvironment:'production',gaClientId:'123.456',gaSessionId:'123',sessionId:'s1',marketing:{utm_source:'meta',utm_campaign:'Soulmate',fbp:'fb.1.123.456'}} });
let requests, failMeta;
beforeEach(()=>{
  rows.clear(); tables.length=0; requests=[]; failMeta=false;
  process.env.VERCEL_ENV='production'; process.env.NEXT_PUBLIC_META_PIXEL_ID='pixel'; process.env.META_CAPI_ACCESS_TOKEN='fixture'; process.env.GA4_MEASUREMENT_ID='G-TEST'; process.env.GA4_API_SECRET='fixture';
  global.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)}); return {ok:!failMeta||!url.includes('facebook'),json:async()=>({events_received:1})};};
});
test('test payments, local orders, pending and failed payments cannot emit purchases',async()=>{
  for (const change of [{payment_mode:'test'},{payment_status:'pending'},{payment_status:'failed'},{attribution:{trackingEnvironment:'preview'}}]) await sendSoulmatePurchase({...order(),...change});
  process.env.VERCEL_ENV='preview'; await sendSoulmatePurchase(order()); assert.equal(requests.length,0); assert.equal(tables.length,0);
});
test('purchase uses server amount, namespaced item, hashed contact fields and stable dedupe ID',()=>{
  const input=order(), payload=soulmatePurchasePayloads(input);
  assert.equal(payload.meta.event_id,input.id); assert.equal(payload.meta.custom_data.value,1178.82);
  assert.deepEqual(payload.meta.custom_data.content_ids,['soulmate_standard']);
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
test('session funnel deduplicates reloads and multiple purchases; unmatched purchases do not inflate conversion',()=>{
  const event=(name,id)=>({event_name:`soulmate_${name}`,session_id:id,created_at:'2026-10-15',utm_source:'meta',utm_campaign:'Soulmate'});
  const events=[event('landing_view','a'),event('landing_view','a'),event('landing_view','b'),event('checkout_view','a'),event('checkout_view','a'),event('checkout_view','without-landing')];
  const result=summarizeSoulmateAnalytics(events,[{id:'one',amount:100,attribution:{sessionId:'a'}},{id:'two',amount:100,attribution:{sessionId:'a'}},{id:'other',amount:100,attribution:{sessionId:'not-in-cohort'}}]);
  assert.equal(result.sessions,2); assert.equal(result.checkoutRate,50); assert.equal(result.conversionRate,50); assert.equal(result.checkoutToPurchaseRate,100); assert.equal(result.paidOrders,3); assert.equal(result.grossRevenue,3);
  assert.equal(result.campaigns[0].sessions,2);
});
test('empty cohort displays unavailable rates instead of misleading zero percentages',()=>{
  const result=summarizeSoulmateAnalytics([],[]); assert.equal(result.conversionRate,null); assert.equal(result.checkoutRate,null);
});
test('browser funnel queues GA before SDK load, dedupes effects, distinguishes plans, and excludes local traffic',()=>{
  const pixel=[];
  stub('../src/lib/pixel-events',{trackPixelEvent:(...args)=>pixel.push(args),trackCustomEvent:(...args)=>pixel.push(args)});
  stub('../src/lib/soulmate-attribution-client',{getSoulmateAttributionPayload:()=>({utm_source:'meta',meta_campaign_id:'123'})});
  const store=new Map(); global.sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  global.window={location:{hostname:'astrorekha.com'}};
  process.env.NODE_ENV='production';
  const {trackSoulmate}=require('../src/lib/soulmate-tracking');
  trackSoulmate('checkout_view',{plan:'standard',value:1178.82,once:'checkout'});
  trackSoulmate('checkout_view',{plan:'standard',value:1178.82,once:'checkout'});
  trackSoulmate('checkout_view',{plan:'express',value:1768.82,once:'checkout'});
  assert.equal(pixel.length,2); assert.equal(requests.length,2); assert.equal(window.dataLayer.length,2);
  const event=window.dataLayer[0]; assert.equal(event[1],'begin_checkout'); assert.equal(event[2].funnel,'soulmate_standalone'); assert.equal(event[2].items[0].item_id,'soulmate_standard');
  assert.deepEqual(requests[0].body.attribution,{utm_source:'meta',meta_campaign_id:'123'});
  window.location.hostname='127.0.0.1'; trackSoulmate('chat_start'); assert.equal(requests.length,2);
  delete global.window; delete global.sessionStorage;
});

test('purchase analytics preserves every paid extra and included bundle entitlement',()=>{
  const {buildSoulmateCart}=require('../src/lib/soulmate-cart');
  const cart=buildSoulmateCart('express',['timeline']);
  const input={...order(),plan:'express',amount:cart.amount,gst_amount:cart.gstAmount,line_items:cart.lineItems,entitlements:cart.entitlements};
  const payload=soulmatePurchasePayloads(input);
  assert.deepEqual(payload.meta.custom_data.content_ids,['soulmate_express','timeline']);
  assert.equal(payload.meta.custom_data.value,2239.64);
  assert.equal(payload.meta.custom_data.sketch_style,'colour');
  assert.equal(payload.meta.custom_data.delivery_hours,12);
  assert.equal(payload.meta.custom_data.description_included,true);
  assert.equal(payload.meta.custom_data.timeline_included,true);
  assert.deepEqual(payload.ga.events[0].params.items.map(item=>item.price),[1499,399]);
  assert.equal(payload.ga.events[0].params.tax,341.64);
});
