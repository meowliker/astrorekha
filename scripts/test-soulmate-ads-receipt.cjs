/* Render the real receipt component with isolated status responses and no external traffic. */
const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const React = require('react');
const { create, act } = require('react-test-renderer');
function stub(file, exports) { const id = require.resolve(file); require.cache[id] = { id, filename:id, loaded:true, exports }; }
stub('../src/lib/soulmate-ga-client', { readSoulmateGaIdentity: async () => ({}) });
stub('../src/lib/pixel-events', { trackPixelEvent: () => {} });
stub('../src/app/soulmate/payment/order-confirmation', { SoulmateOrderConfirmation: () => React.createElement('div', null, 'Confirmed') });
stub('../src/app/soulmate/payment/payment-problem', { SoulmatePaymentProblem: () => React.createElement('div', null, 'Not confirmed') });
const id = 'sm_aaaaaaaaaaaaaaaaaaaa';
let tree, payment;
const storage = new Map();
beforeEach(() => {
  storage.clear(); process.env.NODE_ENV = 'production';
  global.window = { location:{ hostname:'astrorekha.com', pathname:'/soulmate/payment' } };
  global.sessionStorage = { getItem:key => storage.get(key), setItem:(key,value) => storage.set(key,value) };
  payment = { status:'paid', plan:'express', amount:223964, trackingAllowed:true,
    adsPurchase:{transactionId:id,amountPaise:223964,currency:'INR',email:'receipt@example.com'} };
  global.fetch = async url => { assert.match(url, /^\/api\/soulmate\/payment\/status\?order=/); return { ok:true,json:async () => payment }; };
  delete require.cache[require.resolve('../src/lib/soulmate-ads-events')];
  delete require.cache[require.resolve('../src/app/soulmate/payment/payment-status')];
});
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; });
async function render() {
  const {SoulmatePaymentStatus} = require('../src/app/soulmate/payment/payment-status');
  await act(async () => { tree = create(React.createElement(SoulmatePaymentStatus, {orderId:id})); });
  return SoulmatePaymentStatus;
}
const purchases = () => (window.dataLayer || []).filter(x => x.event === 'purchase_complete');
test('a verified receipt renders confirmation and fires once even after remount', async () => {
  const Component = await render(); assert.equal(purchases().length, 1); assert.equal(purchases()[0].value, 2239.64);
  assert.match(JSON.stringify(tree.toJSON()), /Confirmed/);
  act(() => tree.unmount());
  await act(async () => { tree = create(React.createElement(Component, {orderId:id})); });
  assert.equal(purchases().length, 1);
});
test('pending, failed, test and mismatched-order responses never fire a purchase', async () => {
  for (const patch of [{status:'pending'}, {status:'failed'}, {trackingAllowed:false}, {adsPurchase:{...payment.adsPurchase,transactionId:'sm_bbbbbbbbbbbbbbbbbbbb'}}]) {
    const original = {...payment}; Object.assign(payment, patch);
    await render(); assert.equal(purchases().length, 0);
    act(() => tree.unmount()); tree = null; payment = original;
  }
});
test('a forged receipt URL without authorization cannot fire an event', async () => {
  global.fetch = async () => ({ok:false,status:403,json:async () => ({error:'Invalid order link'})});
  await render(); assert.equal(purchases().length, 0); assert.match(JSON.stringify(tree.toJSON()), /Not confirmed/);
});
