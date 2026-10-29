/* Isolated browser fixtures: no real conversions, network requests or payments. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const file = require.resolve('../src/lib/soulmate-ads-events');
let tracking, storage;
const events = () => (window.dataLayer || []).filter(row => row.event);
const purchase = (changes = {}) => ({ transactionId: 'sm_1234567890abcdef1234', amountPaise: 223964, currency: 'INR', email: ' BUYER@example.com ', ...changes });
beforeEach(() => {
  delete require.cache[file];
  process.env.NODE_ENV = 'production';
  storage = new Map();
  global.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  global.window = { location: { hostname: 'astrorekha.com', pathname: '/soulmate' }, gtag: () => assert.fail('Do not send another GA4 event') };
  global.fetch = () => assert.fail('GTM events must not make direct network requests');
  tracking = require(file);
});
test('both CTAs supply the agency event name and exact location, without contact data', () => {
  tracking.trackSoulmateCta('hero'); tracking.trackSoulmateCta('bottom');
  assert.deepEqual(events().map(x => [x.event, x.cta_location]), [['cta_click','hero'],['cta_click','bottom']]);
  assert.ok(events().every(x => x.funnel === 'soulmate_standalone' && x.user_email === null));
});
test('email event validates and normalizes contact, dedupes retries and clears the data model', () => {
  for (const value of ['', 'invalid', 'a|b@example.com']) tracking.trackSoulmateEmail(value);
  assert.equal(events().length, 0);
  tracking.trackSoulmateEmail(' BUYER@example.com '); tracking.trackSoulmateEmail('buyer@example.com');
  assert.equal(events().length, 1); assert.equal(events()[0].user_email, 'buyer@example.com');
  assert.equal(events()[0].event, 'email_submitted');
  assert.deepEqual(window.dataLayer.at(-1), { user_email: null });
  assert.equal(storage.size, 0, 'Do not persist email in analytics storage');
});
test('purchase uses actual total in rupees and stable transaction ID; reload is deduplicated', () => {
  tracking.trackSoulmateAdsPurchase(purchase()); tracking.trackSoulmateAdsPurchase(purchase());
  delete require.cache[file]; tracking = require(file); tracking.trackSoulmateAdsPurchase(purchase());
  assert.equal(events().length, 1);
  assert.equal(events()[0].event, 'purchase_complete'); assert.equal(events()[0].value, 2239.64);
  assert.equal(events()[0].currency, 'INR'); assert.equal(events()[0].transaction_id, purchase().transactionId);
  assert.ok([...storage.values()].every(x => x === '1'));
});
test('different orders count separately and invalid amounts/currency/IDs do not count', () => {
  for (const patch of [{ amountPaise: 0 }, { amountPaise: -1 }, { amountPaise: 1.5 }, { amountPaise: NaN }, { currency: 'USD' }, { transactionId: 'query-param' }, { email: '' }]) tracking.trackSoulmateAdsPurchase(purchase(patch));
  assert.equal(events().length, 0);
  tracking.trackSoulmateAdsPurchase(purchase());
  tracking.trackSoulmateAdsPurchase(purchase({ transactionId:'sm_abcdef1234567890abcd', amountPaise:100 }));
  assert.deepEqual(events().map(x => x.value), [2239.64, 1]);
});
test('blocked storage still deduplicates effects, and a broken dataLayer cannot block checkout', () => {
  global.sessionStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  tracking.trackSoulmateAdsPurchase(purchase()); tracking.trackSoulmateAdsPurchase(purchase());
  assert.equal(events().length, 1);
  window.dataLayer = { push() { throw Error('broken tag'); } };
  assert.doesNotThrow(() => tracking.trackSoulmateCta('hero'));
  assert.doesNotThrow(() => tracking.trackSoulmateEmail('a@example.com'));
});
test('local, preview, US and unrelated app pages cannot create these advertising conversions', () => {
  for (const [hostname, pathname] of [['localhost','/soulmate'],['preview.vercel.app','/soulmate'],['astrorekha.com','/page-previews/soulmate'],['astrorekha.com','/us/soulmate'],['astrorekha.com','/reports']]) {
    window.location = { hostname, pathname };
    tracking.trackSoulmateCta('hero'); tracking.trackSoulmateEmail('a@example.com'); tracking.trackSoulmateAdsPurchase(purchase());
  }
  window.location = { hostname:'astrorekha.com', pathname:'/soulmate' }; process.env.NODE_ENV = 'development';
  tracking.trackSoulmateCta('hero'); assert.equal(events().length, 0);
});
