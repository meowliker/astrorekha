/* Isolated SDK, cookie and receipt fixtures. No real analytics or database writes. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { chooseSoulmateGaIdentity } = require('../src/lib/soulmate-ga-identity');
const { readSoulmateGaIdentity } = require('../src/lib/soulmate-ga-client');
beforeEach(() => {
  process.env.NODE_ENV = 'production'; process.env.NEXT_PUBLIC_GA_ID = 'G-TEST'; process.env.VERCEL_ENV = 'production';
  global.window = { location: { hostname: 'astrorekha.com' } };
  global.document = { cookie: '' };
});
test('reads the actual SDK identity even when the client cookie is missing', async () => {
  document.cookie = '_ga_TEST=GS2.1.s456$o1';
  window.gtag = (command, id, field, callback) => { assert.equal(command, 'get'); assert.equal(id, 'G-TEST'); callback(field === 'client_id' ? '123.456' : 456); };
  assert.deepEqual(await readSoulmateGaIdentity(), {gaClientId:'123.456',gaSessionId:'456'});
});
test('a blocked SDK times out and uses valid cookies without blocking checkout', async () => {
  window.gtag = () => {};
  document.cookie = '_ga=GA1.1.111.222; _ga_TEST=GS2.1.s333$o1';
  assert.deepEqual(await readSoulmateGaIdentity(10), {gaClientId:'111.222',gaSessionId:'333'});
});
test('late callbacks cannot modify a completed result; no synthetic identity for blocked analytics', async () => {
  const callbacks = []; window.gtag = (...args) => callbacks.push(args[3]);
  const identity = await readSoulmateGaIdentity(10);
  callbacks[0]('123.456'); callbacks[1]('456');
  assert.deepEqual(identity, {gaClientId:null,gaSessionId:null});
});
test('local traffic does not call GA and malformed browser IDs cannot enter the order', async () => {
  window.location.hostname = 'localhost'; window.gtag = () => { throw Error('should not run'); };
  assert.deepEqual(await readSoulmateGaIdentity(), {gaClientId:null,gaSessionId:null});
  assert.deepEqual(chooseSoulmateGaIdentity({gaClientId:'buyer@example.com'}, {gaClientId:'1.2',gaSessionId:'3'}), {gaClientId:'1.2',gaSessionId:'3'});
  assert.deepEqual(chooseSoulmateGaIdentity({gaClientId:'1.2'}, {gaClientId:'4.5',gaSessionId:'6'}), {gaClientId:'1.2',gaSessionId:null});
});

function stub(file,exports) { const id=require.resolve(file); require.cache[id]={id,filename:id,loaded:true,exports}; }
let record, writes, sends;
stub('../src/lib/soulmate-payu', {validReceiptToken:(id,token)=>id==='sm_fixture' && token==='private',getSoulmateOrder:async()=>record});
stub('../src/lib/order-attribution',{readOrderAttribution:async()=>({gaClientId:null,gaSessionId:null})});
stub('../src/lib/soulmate-purchase-tracking',{sendSoulmatePurchase:async order=>sends.push(order)});
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>({from(table){assert.equal(table,'soulmate_orders');let update;const q={update(v){update=v;return q},eq(key,value){if(key==="attribution")assert.deepEqual(JSON.parse(value),record.attribution);return q},is(){return q},select(){return q},async maybeSingle(){writes++;record={...record,...update};return {data:record,error:null}}};return q;}})});
const {NextRequest}=require('next/server');
const recovery=require('../src/app/api/soulmate/payment/attribution/route');
function request({token='private',origin='https://astrorekha.com'}={}) {return new NextRequest('https://astrorekha.com/api/soulmate/payment/attribution',{method:'POST',headers:{origin,cookie:`sm_receipt_sm_fixture=${token}`,'content-type':'application/json'},body:JSON.stringify({orderId:'sm_fixture',gaClientId:'123.456',gaSessionId:'456'})});}
beforeEach(()=>{writes=0;sends=[];record={id:'sm_fixture',payment_status:'paid',payment_mode:'live',paid_at:new Date().toISOString(),attribution:{gaClientId:null,trackingEnvironment:'production',marketing:{utm_source:'facebook'}}};});
test('authenticated receipt recovers missing IDs, preserves UTMs and retries the server purchase',async()=>{
  assert.equal((await recovery.POST(request())).status,204);
  assert.equal(writes,1);assert.equal(sends.length,1);assert.equal(record.attribution.gaClientId,'123.456');assert.equal(record.attribution.marketing.utm_source,'facebook');
  await recovery.POST(request());assert.equal(writes,1,'never overwrite an existing identity');
});
test('receipt recovery rejects foreign origins and unauthenticated order IDs',async()=>{
  assert.equal((await recovery.POST(request({token:'invalid'}))).status,403);
  assert.equal((await recovery.POST(request({origin:'https://example.com'}))).status,403);
  assert.equal(writes,0);assert.equal(sends.length,0);
});
test('unpaid, local, test and expired purchases cannot be recovered or emitted',async()=>{
  const initial=structuredClone(record);
  for(const change of [{payment_status:'pending'},{payment_mode:'test'},{attribution:{trackingEnvironment:'local'}},{paid_at:new Date(Date.now()-73*3600000).toISOString()}]){
    record={...initial,...change};assert.equal((await recovery.POST(request())).status,204);
  }
  assert.equal(writes,0);assert.equal(sends.length,0);
});
