/* Payment contract tests: isolated database and PayU fixtures; no real payments or network. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
process.env.PAYU_MERCHANT_KEY = 'fixture-key';
process.env.PAYU_MERCHANT_SALT = 'fixture-salt';
process.env.PAYU_MODE = 'test';
const orders = new Map();
const tables = [];
let fetchCount = 0;
let verifyTxn;
let failInserts = false;
let savedSession;
let failSession = false;
const db = { async rpc(name, params) {
  assert.equal(name, "save_soulmate_session");
  savedSession = params;
  return failSession ? { data: null, error: {} } : { data: true, error: null };
}, from(table) {
  tables.push(table);
  assert.equal(table, 'soulmate_orders', 'No writes or reads in the main app ledger');
  let op = 'read', values, filters = [];
  const q = {
    select() { return q; },
    insert(value) { op = 'insert'; values = value; return q; },
    update(value) { op = 'update'; values = value; return q; },
    eq(key, value) { filters.push(row => row[key] === value); return q; },
    neq(key, value) { filters.push(row => row[key] !== value); return q; },
    single() { return run(); }, maybeSingle() { return run(); },
    then(resolve, reject) { return run().then(resolve, reject); },
  };
  async function run() {
    if (op === 'insert') {
      if (failInserts) return { data: null, error: { code: '42P01' } };
      if ([...orders.values()].some(row => row.checkout_key === values.checkout_key)) return { data: null, error: { code: '23505' } };
      const row = { payment_status: 'created', paid_at: null, delivery_due_at: null, last_verified_at: null, ...values };
      orders.set(row.id, row);
      return { data: { ...row }, error: null };
    }
    const row = [...orders.values()].find(row => filters.every(filter => filter(row)));
    if (op === 'update' && row) Object.assign(row, values);
    return { data: row ? { ...row } : null, error: null };
  }
  return q;
} };
function stub(file, exports) { require.cache[require.resolve(file)] = { id: require.resolve(file), filename: require.resolve(file), loaded: true, exports }; }
stub('../src/lib/soulmate-invoice', { confirmSoulmatePurchase: async () => {} });
stub('../src/lib/payment-gateway', { activePaymentGateway: async () => 'payu' });
stub('../src/lib/supabase-admin', { getSupabaseAdmin: () => db });
stub('../src/lib/order-attribution', { readOrderAttribution: async () => ({ firstTouch: null, lastTouch: { utm_campaign: 'soulmate-test' }, gaClientId: null, gaSessionId: null }) });
const { NextRequest } = require('next/server');
const checkout = require('../src/app/api/soulmate/checkout/route');
const callback = require('../src/app/api/soulmate/payment/callback/route');
const statusRoute = require('../src/app/api/soulmate/payment/status/route');
const payu = require('../src/lib/soulmate-payu');
const { isSoulmateTransaction } = require('../src/lib/soulmate-orders');
const answers = { name: 'Maya', heart: 'I feel like I’ve been waiting forever', preferenceSelection: 'I like men', preference: 'I like men', feeling: 'Safe — someone who stays', birthDate: '1995-01-01', ethnicity: 'North Indian' };
const body = (extra = {}) => ({ plan: 'standard', answers, email: 'maya@example.com', phone: '9876543210', checkoutKey: crypto.randomUUID(), ...extra });
const request = (data, origin = 'https://example.com') => new NextRequest('https://example.com/api/soulmate/checkout', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(data) });
async function create(extra) {
  const response = await checkout.POST(request(body(extra)));
  assert.equal(response.status, 200);
  return { response, data: await response.json() };
}
function transaction(order, extra = {}) { return { txnid: order.id, status: 'success', unmappedstatus: 'captured', transaction_amount: (order.amount / 100).toFixed(2), mihpayid: '123456789', productinfo: order.product_info, udf2: 'soulmate_standalone', udf3: order.plan, udf4: order.id, ...extra }; }
function signed(fields, extra = {}) {
  const payload = { ...fields, status: 'success', ...extra };
  payload.hash = crypto.createHash('sha512').update(['fixture-salt', payload.status, '', '', '', '', '', payload.udf5, payload.udf4, payload.udf3, payload.udf2, payload.udf1, payload.email, payload.firstname, payload.productinfo, payload.amount, payload.txnid, payload.key].join('|')).digest('hex');
  return payload;
}
function callbackRequest(payload) { return new NextRequest('https://example.com/api/soulmate/payment/callback', { method: 'POST', body: new URLSearchParams(payload) }); }
beforeEach(() => {
  savedSession = undefined; failSession = false; orders.clear(); tables.length = 0; fetchCount = 0; failInserts = false; verifyTxn = undefined;
  global.fetch = async (url, init) => {
    fetchCount++;
    assert.equal(init.body.get('command'), 'verify_payment');
    const id = init.body.get('var1');
    const row = orders.get(id);
    return { ok: true, json: async () => ({ status: 1, transaction_details: { [id]: verifyTxn || transaction(row) } }) };
  };
});

test('server owns pricing, plan, tax and funnel, even if browser tampers with amount', async () => {
  for (const [plan, amount] of [['standard', '1178.82'], ['express', '1768.82']]) {
    const { response, data } = await create({ plan, amount: 1, funnel: 'bundle' });
    assert.equal(data.fields.amount, amount);
    assert.equal(data.fields.udf2, 'soulmate_standalone');
    assert.match(data.fields.txnid, /^sm_[a-f0-9]{20}$/);
    assert.equal(data.action, 'https://test.payu.in/_payment');
    assert.equal(data.fields.surl, 'https://example.com/api/soulmate/payment/callback');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.doesNotMatch(data.receiptUrl, /token/);
    const hash = crypto.createHash('sha512').update(`fixture-key|${data.fields.txnid}|${amount}|${data.fields.productinfo}|Maya|maya@example.com||soulmate_standalone|${plan}|${data.fields.txnid}|||||||fixture-salt`).digest('hex');
    assert.equal(data.fields.hash, hash);
  }
});
test('rejects invalid preferences, contact data, plan and cross-origin requests before writing', async () => {
  for (const patch of [{ plan: 'bundle' }, { email: 'invalid' }, { phone: '1234' }, { answers: {} }, { checkoutKey: 'bad' }]) assert.equal((await checkout.POST(request(body(patch)))).status, 400);
  assert.equal((await checkout.POST(request(body(), 'https://evil.example'))).status, 403);
  assert.equal(orders.size, 0);
});
test('duplicate checkout reuses one transaction; changed details conflict', async () => {
  const data = body();
  const first = await (await checkout.POST(request(data))).json();
  const second = await (await checkout.POST(request(data))).json();
  assert.equal(first.orderId, second.orderId);
  assert.equal(orders.size, 1);
  assert.equal((await checkout.POST(request({ ...data, plan: 'express' }))).status, 409);
});
test('database failure does not hand out a payable hash or fall back to main payments', async () => {
  failInserts = true;
  const result = await checkout.POST(request(body()));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).fields, undefined);
});
test('forged callback cannot mark an order paid', async () => {
  const { data } = await create();
  const result = await callback.POST(callbackRequest({ ...signed(data.fields), hash: '0'.repeat(128) }));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), `https://example.com/soulmate/payment?order=${data.orderId}`);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(fetchCount, 0);
  assert.equal(orders.get(data.orderId).payment_status, 'created');
});
test('verified capture queues delivery once and repeated callbacks preserve deadline', async () => {
  const { data } = await create({ plan: 'express' });
  const response = await callback.POST(callbackRequest(signed(data.fields)));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `https://example.com/soulmate/payment?order=${data.orderId}`);
  const first = { ...orders.get(data.orderId) };
  assert.equal(first.payment_status, 'paid');
  assert.equal(first.fulfillment_status, 'queued');
  assert.deepEqual(first.answers, answers);
  assert.equal(first.customer_email, 'maya@example.com');
  assert.equal(Date.parse(first.delivery_due_at) - Date.parse(first.paid_at), 12 * 3600000);
  await callback.POST(callbackRequest(signed(data.fields)));
  assert.equal(orders.get(data.orderId).delivery_due_at, first.delivery_due_at);
  assert.equal(fetchCount, 1);
  assert.deepEqual(orders.get(data.orderId).answers, answers);
});
test('server verification rejects wrong amount, wrong order, wrong funnel and authorization-only payment', async () => {
  const { data } = await create();
  const order = orders.get(data.orderId);
  for (const patch of [{ transaction_amount: '1' }, { txnid: 'sm_wrong' }, { udf2: 'bundle' }, { udf3: 'express' }]) assert.throws(() => payu.verifiedOrderUpdate(order, transaction(order, patch)), /match/);
  assert.equal(payu.verifiedOrderUpdate(order, transaction(order, { unmappedstatus: 'auth' })).payment_status, 'pending');
  assert.equal(payu.verifiedOrderUpdate(order, transaction(order, { status: 'failure', unmappedstatus: 'failed' })).payment_status, 'failed');
});
test('status needs a private receipt cookie, reconciles missed callback and hides test-order contact details', async () => {
  const { data } = await create();
  const url = `https://example.com/api/soulmate/payment/status?order=${data.orderId}`;
  assert.equal((await statusRoute.GET(new NextRequest(url))).status, 403);
  const response = await statusRoute.GET(new NextRequest(url, { headers: { cookie: `sm_receipt_${data.orderId}=${payu.receiptToken(data.orderId)}` } }));
  const state = await response.json();
  assert.equal(state.status, 'paid');
  assert.equal(state.customer_email, undefined);
  assert.equal(state.adsPurchase, undefined);
  assert.equal(state.answers, undefined);
  assert.equal(payu.validReceiptToken(data.orderId, 'f'.repeat(64)), false);
});
test('Ads purchase fields require a receipt-authorized, paid live production order', async () => {
  const { data } = await create({ plan: 'express', addOns: ['timeline'] });
  const order = orders.get(data.orderId);
  const url = `https://example.com/api/soulmate/payment/status?order=${data.orderId}`;
  const read = () => statusRoute.GET(new NextRequest(url, { headers: { cookie: `sm_receipt_${data.orderId}=${payu.receiptToken(data.orderId)}` } }));
  order.payment_status = 'paid'; order.payment_mode = 'live'; order.attribution.trackingEnvironment = 'production';
  const response = await read(), state = await response.json();
  assert.deepEqual(state.adsPurchase, { transactionId: order.id, amountPaise: order.amount, currency: 'INR', email: order.customer_email });
  assert.equal(state.adsPurchase.amountPaise, 223964); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await statusRoute.GET(new NextRequest(url))).status, 403);
  for (const [status, mode, environment] of [['pending','live','production'],['failed','live','production'],['paid','test','production'],['paid','live','local'],['paid','live','preview']]) {
    order.payment_status = status; order.payment_mode = mode; order.attribution.trackingEnvironment = environment; order.last_verified_at = new Date().toISOString();
    assert.equal((await (await read()).json()).adsPurchase, undefined);
  }
});
test('late failure cannot overwrite a concurrently paid order', async () => {
  const { data } = await create();
  const stale = { ...orders.get(data.orderId) };
  await payu.reconcileSoulmateOrder(stale);
  const deadline = orders.get(data.orderId).delivery_due_at;
  verifyTxn = transaction(stale, { status: 'failure', unmappedstatus: 'failed' });
  const result = await payu.reconcileSoulmateOrder(stale);
  assert.equal(result.payment_status, 'paid');
  assert.equal(result.delivery_due_at, deadline);
});
test('classification isolates sales and refunds while retaining existing soulmate upsells', () => {
  assert.equal(isSoulmateTransaction({ txnid: 'sm_123', status: 'refund_success' }), true);
  assert.equal(isSoulmateTransaction({ txnid: 'legacy', udf2: 'soulmate_standalone' }), true);
  assert.equal(isSoulmateTransaction({ txnid: 'pay_123', udf2: 'upsell', udf3: 'soulmate-sketch' }), false);
});

test('local live checkout uses the configured live gateway and saves answers before payment', async () => {
  process.env.PAYU_MODE = 'live';
  try {
    const input = body();
    const result = await checkout.POST(new NextRequest('http://localhost:3112/api/soulmate/checkout', {
      method: 'POST', headers: { origin: 'http://localhost:3112', 'content-type': 'application/json' }, body: JSON.stringify(input),
    }));
    assert.equal(result.status, 200);
    const checkoutData = await result.json();
    assert.equal(checkoutData.action, 'https://secure.payu.in/_payment');
    assert.equal(checkoutData.fields.surl, 'http://localhost:3112/api/soulmate/payment/callback');
    assert.equal(orders.size, 1);
    assert.deepEqual(orders.get(checkoutData.orderId).answers, input.answers);
    input.answers = { ...input.answers, preference: 'I like women' };
    assert.equal(orders.get(checkoutData.orderId).answers.preference, 'I like men');
  } finally { process.env.PAYU_MODE = 'test'; }
});
test('same-host checkout accepts Next dev URL normalization but rejects a foreign Origin', async () => {
  const requestFor = (origin) => new NextRequest('http://localhost:3112/api/soulmate/checkout', { method: 'POST', headers: { host: '127.0.0.1:3112', origin, 'content-type': 'application/json' }, body: JSON.stringify(body()) });
  assert.equal((await checkout.POST(requestFor('http://127.0.0.1:3112'))).status, 200);
  assert.equal((await checkout.POST(requestFor('http://evil.example'))).status, 403);
});


test('checkout links a server-saved draft and immutable complete answer snapshot', async () => {
  const session = { id: crypto.randomUUID(), token: crypto.randomUUID(), revision: 8 };
  const { data } = await create({ session });
  const order = orders.get(data.orderId);
  assert.equal(order.session_id, session.id);
  assert.deepEqual(order.answers, answers);
  assert.deepEqual(savedSession.p_answers, answers);
  assert.equal(savedSession.p_token_hash, crypto.createHash('sha256').update(session.token).digest('hex'));
  assert.notEqual(savedSession.p_token_hash, session.token);
});
test('failed session persistence blocks payable checkout and forged session credentials are rejected', async () => {
  const session = { id: crypto.randomUUID(), token: crypto.randomUUID(), revision: 8 };
  failSession = true;
  assert.equal((await checkout.POST(request(body({ session })))).status, 503);
  assert.equal(orders.size, 0);
  assert.equal((await checkout.POST(request(body({ session: { ...session, token: 'wrong' } })))).status, 400);
});

test('all valid baskets are purchasable with immutable server-priced items and delivery promises', async () => {
  const options = ['description', 'colour', 'priority'];
  for (let mask=0;mask<8;mask++) {
    const addOns=options.filter((_,i)=>mask & (1<<i));
    const {data}=await create({addOns, amount:1});
    const row=orders.get(data.orderId);
    const subtotal=999+(addOns.includes('description')?399:0)+(addOns.includes('colour')?299:0)+(addOns.includes('priority')?249:0);
    assert.equal(row.amount,Math.round(subtotal*118));
    assert.deepEqual(row.add_ons,addOns);
    assert.equal(row.catalog_version,2);
    assert.equal(row.entitlements.sketch,addOns.includes('colour')?'colour':'black_and_white');
    assert.equal(row.entitlements.description,addOns.includes('description'));
    assert.equal(row.delivery_hours,addOns.includes('priority')?12:48);
    assert.equal(row.entitlements.promised_hours,row.delivery_hours);
    assert.equal(row.line_items.length,1+addOns.length);
    assert.equal(row.review_status,'pending');
  }
  for(const addOns of [[],['timeline']]) {
    const {data}=await create({plan:'express',addOns});const row=orders.get(data.orderId);
    assert.equal(row.amount,addOns.length?223964:176882);
    assert.equal(row.delivery_hours,12);
    assert.equal(row.entitlements.sketch,'colour');assert.equal(row.entitlements.description,true);
    assert.deepEqual(row.entitlements.required_assets,addOns.length?['sketch','description','timeline']:['sketch','description']);
  }
});
test('unknown or cross-package extras rejected; changed basket cannot reuse payable order',async()=>{
  for(const addOns of [['timeline'],['unknown'],'colour']) assert.equal((await checkout.POST(request(body({addOns})))).status,400);
  assert.equal((await checkout.POST(request(body({plan:'express',addOns:['colour']})))).status,400);
  assert.equal(orders.size,0);
  const input=body({addOns:['colour']});await checkout.POST(request(input));
  assert.equal((await checkout.POST(request({...input,addOns:['description']}))).status,409);
});

test('checkout always opens unrestricted PayU methods, including requests from an older page', async () => {
  const checkoutKey = crypto.randomUUID();
  let initialHash;
  for (const paymentMethod of [undefined, 'upi', 'cards', 'netbanking', 'wallets']) {
    const response = await checkout.POST(request(body({ checkoutKey, paymentMethod, enforce_paymethod: 'upi', pg: 'UPI' })));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.fields.enforce_paymethod, undefined);
    assert.equal(data.fields.pg, undefined);
    assert.equal(data.fields.amount, '1178.82');
    assert.equal(data.action, 'https://test.payu.in/_payment');
    assert.equal(data.checkStatus, undefined);
    initialHash ||= data.fields.hash;
    assert.equal(data.fields.hash, initialHash);
  }
  assert.equal(orders.size, 1);
});

test('gateway receives punctuation-free names for all ten baskets while display line items stay intact', async () => {
  for(let mask=0;mask<8;mask++){
    const addOns=['description','colour','priority'].filter((_,i)=>mask&(1<<i));
    const {data}=await create({plan:'standard',addOns});
    assert.match(data.fields.productinfo,/^[A-Za-z0-9 ]+$/);
  }
  for(const addOns of [[],['timeline']]){
    const {data}=await create({plan:'express',addOns});
    assert.match(data.fields.productinfo,/^[A-Za-z0-9 ]+$/);
    assert.match(orders.get(data.orderId).line_items[0].name,/Vision: Fast Delivery \+ Description \+ Color Upgrade/);
    assert.ok(payu.validOrderCallback(orders.get(data.orderId),signed(data.fields)));
  }
});

test('observed PayU legacy product sanitization verifies without accepting mismatched money or identifiers', async()=>{
 const {data}=await create({plan:'express',addOns:['timeline']});
 const row=orders.get(data.orderId);
 row.product_info='Complete Soulmate Vision: Fast Delivery + Description + Color Upgrade + Timeline';
 const sanitized='Complete Soulmate Vision  Fast Delivery   Description   Color Upgrade   Timeline';
 const txn=transaction(row,{productinfo:sanitized});
 assert.equal(payu.verifiedOrderUpdate(row,txn).payment_status,'paid');
 for(const patch of [{transaction_amount:'1.00'},{txnid:'sm_wrong'},{udf4:'sm_wrong'},{udf2:'bundle'},{udf3:'standard'},{productinfo:'Another product'}]) assert.throws(()=>payu.verifiedOrderUpdate(row,{...txn,...patch}),/match/);
 const original=signed({...data.fields,productinfo:row.product_info});
 assert.equal(payu.validOrderCallback(row,{...original,productinfo:sanitized}),true);
 assert.equal(payu.validOrderCallback(row,signed({...data.fields,productinfo:sanitized})),true);
 assert.equal(payu.validOrderCallback(row,{...original,productinfo:sanitized,hash:'0'.repeat(128)}),false);
 verifyTxn=txn;
 const response=await callback.POST(callbackRequest({...original,productinfo:sanitized}));
 assert.equal(response.status,303);
 assert.equal(row.payment_status,'paid');
});

test('invalid return recovers only through authenticated status verification, never callback assertions',async()=>{
 const {data}=await create();
 await callback.POST(callbackRequest({...signed(data.fields),hash:'0'.repeat(128)}));
 const url=`https://example.com/api/soulmate/payment/status?order=${data.orderId}`;
 assert.equal((await statusRoute.GET(new NextRequest(url))).status,403);
 assert.equal(orders.get(data.orderId).payment_status,'created');
 const result=await statusRoute.GET(new NextRequest(url,{headers:{cookie:`sm_receipt_${data.orderId}=${payu.receiptToken(data.orderId)}`}}));
 assert.equal((await result.json()).status,'paid');
});

test('malformed, unknown and refreshed callbacks redirect to the help page without credentials',async()=>{
 for(const request of [callbackRequest({txnid:'invalid'}),callbackRequest({txnid:'sm_'+'a'.repeat(20)}),new NextRequest('https://example.com/api/soulmate/payment/callback',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})]){
  const result=await callback.POST(request);assert.equal(result.status,303);assert.equal(result.headers.get('location'),'https://example.com/soulmate/payment/problem');assert.equal(result.headers.get('set-cookie'),null);
 }
 assert.equal((await callback.GET(new NextRequest('https://example.com/api/soulmate/payment/callback'))).status,303);
});

test('PayU outage leaves order unconfirmed and sends the browser to a retryable receipt',async()=>{
 const {data}=await create();global.fetch=async()=>{throw Error('Temporary PayU outage')};
 const response=await callback.POST(callbackRequest(signed(data.fields)));
 assert.equal(response.status,303);assert.equal(orders.get(data.orderId).payment_status,'created');
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});

test('local callback redirect preserves the browser host so its receipt cookie stays available',async()=>{
 const request=new NextRequest('http://localhost:3112/api/soulmate/payment/callback',{headers:{host:'127.0.0.1:3112'}});
 const response=await callback.GET(request);
 assert.equal(response.headers.get('location'),'http://127.0.0.1:3112/soulmate/payment/problem');
});

test('checkout saves validated browser SDK identifiers when server cookies are unavailable', async () => {
  const {data}=await create({tracking:{gaClientId:'123.456',gaSessionId:'456'}});
  const saved=orders.get(data.orderId);
  assert.equal(saved.attribution.gaClientId,'123.456');
  assert.equal(saved.attribution.gaSessionId,'456');
  const malformed=await create({tracking:{gaClientId:'someone@example.com',gaSessionId:'bad'}});
  assert.equal(orders.get(malformed.data.orderId).attribution.gaClientId,null);
});
