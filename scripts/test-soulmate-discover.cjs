const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const presentation = require('../src/components/soulmate-discover/Experience');
const { rememberDiscoverCheckout, discoverRetryPath } = require('../src/lib/soulmate-discover-checkout');
let storage;
beforeEach(() => {
  storage = new Map();
  global.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  global.window = { location: { pathname: '/soulmate/discover/checkout' } };
});
test('discovery content is scoped, transparent about AI and never changes saved visitor replies', () => {
  const messages = [{ id: 'hello', text: 'Hello', role: 'artist' }, { id: 'location', text: 'IP city', role: 'artist' }, { id: 'answer-name', text: 'Fixture', role: 'visitor' }, { id: 'gathering', text: 'Original', role: 'artist' }];
  const result = presentation.discoverMessages(messages);
  assert.ok(result[0].text.includes('automated AI'));
  assert.ok(!result.some(m => m.id === 'location'));
  assert.deepEqual(result.find(m => m.role === 'visitor'), messages[2]);
  assert.ok(result.at(-1).text.includes('after payment'));
  assert.equal(messages[0].text, 'Hello');
});
test('all discovery artwork is region-specific, first-party and actually exists', () => {
  for (const region of ['india', 'us']) for (const file of ['astrorekha-artist.png', ...[1,2,3,4].map(n => `sketches/astrorekha-${n}.png`)]) {
    const asset = presentation.discoverAsset(region, '/soulmate/' + file);
    assert.ok(asset.startsWith('/discover-assets/' + region + '/'));
    assert.ok(fs.statSync(path.join(__dirname, '../public', asset)).size > 0);
  }
  assert.throws(() => presentation.discoverAsset('india', '/soulmate/../secret.png'));
});
test('a failed discovery order returns to its discovery offer, scoped to the exact order and region', () => {
  const india = 'sm_' + 'a'.repeat(20), us = 'us_sm_' + 'b'.repeat(20);
  rememberDiscoverCheckout('/soulmate/payment?order=' + india);
  assert.equal(discoverRetryPath(india, '/soulmate?checkout=retry'), '/soulmate/discover?checkout=retry');
  assert.equal(discoverRetryPath(us, 'fallback'), 'fallback');
  window.location.pathname = '/us/soulmate/discover/checkout';
  rememberDiscoverCheckout('/us/soulmate/payment?order=' + us);
  assert.equal(discoverRetryPath(us, 'fallback'), '/us/soulmate/discover?checkout=retry');
});
test('original orders, malformed receipts, stale or tampered records retain canonical retry', () => {
  const id = 'sm_' + 'a'.repeat(20);
  window.location.pathname = '/soulmate/checkout';
  rememberDiscoverCheckout('/soulmate/payment?order=' + id);
  assert.equal(storage.size, 0);
  window.location.pathname = '/soulmate/discover/checkout';
  for (const receipt of ['https://evil.example/', '/us/soulmate/payment?order=' + id, '/soulmate/payment?order=query', '/soulmate/payment?order=' + id + '&redirect=evil']) rememberDiscoverCheckout(receipt);
  assert.equal(storage.size, 0);
  const key = 'ar_discover_checkout_return_v1:' + id;
  for (const value of [{ entry: 'https://evil.example/', at: Date.now() }, { entry: '/soulmate/discover', at: 1 }, { entry: '/us/soulmate/discover', at: Date.now() }, { entry: '/soulmate/discover', at: Date.now() + 60000 }]) {
    storage.set(key, JSON.stringify(value)); assert.equal(discoverRetryPath(id, 'fallback'), 'fallback');
  }
  global.sessionStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.doesNotThrow(() => rememberDiscoverCheckout('/soulmate/payment?order=' + id));
  assert.equal(discoverRetryPath(id, 'fallback'), 'fallback');
});
test('existing payment APIs, receipt authorization, fulfillment and original landing content are unchanged', () => {
  for (const file of ['src/app/soulmate/page.tsx','src/app/us/soulmate/page.tsx','src/app/soulmate/soulmate-landing.tsx','src/app/us/soulmate/soulmate-landing.tsx',
    'src/app/api/soulmate/checkout/route.ts','src/app/api/us/soulmate/checkout/route.ts','src/app/api/soulmate/payment/status/route.ts','src/lib/soulmate-fulfillment.ts','src/lib/us-soulmate-fulfillment.ts',
    'src/lib/soulmate-ads-events.ts','src/lib/us-soulmate-ads-events.ts','src/components/MarketingBoundary.tsx']) {
    const baseline = execFileSync('git', ['show', 'HEAD:' + file], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    assert.equal(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), baseline, file);
  }
});
test('both new regional landings and offers retain the original CSS layouts and section order', () => {
  const classes = text => [...text.matchAll(/className=\{styles\.([a-zA-Z]+)\}/g)].map(x => x[1]);
  for (const region of ['soulmate', 'us/soulmate']) {
    const folder = 'src/app/' + region;
    for (const type of ['landing', 'offer']) {
      let baseline = execFileSync('git', ['show', `HEAD:${folder}/soulmate-${type === 'landing' ? 'landing' : 'experience'}.tsx`], { encoding: 'utf8' });
      if (type === 'offer') baseline = baseline.slice(baseline.indexOf('function PlanCards'), baseline.indexOf('export function SoulmateExperience'));
      const revised = fs.readFileSync(`${folder}/discover/discover-${type}.tsx`, 'utf8');
      const removedLiveIndicators = new Set(['portraitOnlineDot', 'connectionDot', 'urgencyDot']);
      const expected = classes(baseline).filter(value => !removedLiveIndicators.has(value));
      assert.deepEqual(classes(revised), expected, region + ' ' + type + ' design must stay original');
    }
  }
});

for (const [region, route, moduleName, id, amountField, amount, currency] of [
  ['india','/soulmate/discover','soulmate-ads-events','sm_' + 'c'.repeat(20),'amountPaise',117882,'INR'],
  ['us','/us/soulmate/discover','us-soulmate-ads-events','us_sm_' + 'd'.repeat(20),'amountCents',4366,'USD'],
]) test(`${region} discovery GTM events retain correct funnel, purchase total, region isolation and reload dedupe`, () => {
  process.env.NODE_ENV = 'production';
  window.location = { hostname: 'astrorekha.com', pathname: route };
  const file = require.resolve('../src/lib/' + moduleName); delete require.cache[file]; let tracker = require(file);
  tracker.trackSoulmateCta('hero');
  tracker.trackSoulmateEmail(' BUYER@example.com ');
  window.location.pathname = (region === 'us' ? '/us' : '') + '/soulmate/payment';
  const purchase = { transactionId: id, [amountField]: amount, currency, email: 'buyer@example.com' };
  tracker.trackSoulmateAdsPurchase(purchase); tracker.trackSoulmateAdsPurchase(purchase);
  delete require.cache[file]; tracker = require(file); tracker.trackSoulmateAdsPurchase(purchase);
  const events = window.dataLayer.filter(row => row.event);
  assert.deepEqual(events.map(row => row.event), ['cta_click','email_submitted','purchase_complete']);
  assert.equal(events[2].value, amount / 100); assert.equal(events[2].currency, currency);
  assert.equal(events[2].transaction_id, id); assert.equal(events[2].funnel, region === 'us' ? 'us_soulmate_standalone' : 'soulmate_standalone');
  assert.deepEqual(window.dataLayer.at(-1), { user_email: null });
});

test('Google braid arrivals replace stale campaign attribution in both regions', () => {
  global.document = { cookie: '', referrer: '' };
  for (const us of [false,true]) for (const key of ['gclid','gbraid','wbraid']) {
    const storageKey = us ? 'astrorekha_us_soulmate_attribution' : 'astrorekha_soulmate_attribution';
    const values = new Map([[storageKey, JSON.stringify({ utm_campaign: 'old-campaign', meta_campaign_id: 'old-id', click_id: 'old-click' })]]);
    window.localStorage = { getItem: name => values.get(name) || null, setItem: (name,value) => values.set(name,value) };
    window.location.href = `https://astrorekha.com${us ? '/us' : ''}/soulmate/discover?${key}=new-click`;
    const capture = require('../src/lib/' + (us ? 'us-' : '') + 'soulmate-attribution-client').captureSoulmateAttributionFromPage;
    const result = capture();
    assert.equal(result.click_id,'new-click');
    assert.equal(result.meta_campaign_id,undefined); assert.equal(result.utm_campaign,undefined);
    assert.ok(result.landing_path.includes('/soulmate/discover'));
  }
});
