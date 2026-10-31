const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
require.extensions['.css'] = (module) => { module.exports = {}; };
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
function stub(file, exports) { const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let pathname = '/';
stub('next/navigation', { usePathname: () => pathname });
stub('next/script', ({ children, id, src }) => React.createElement('script', { id, src }, children));
stub('next/image', ({ unoptimized, priority, ...props }) => React.createElement('img', props));
for (const component of ['MetaPixel','GoogleAnalytics','Clarity']) stub('../src/components/'+component, { [component]: () => React.createElement('span', null, 'existing-'+component) });
// GTM coverage lives in test-google-tag-manager; isolate the existing vendor assertions here.
stub('../src/components/GoogleTagManager', { GoogleTagManager: () => null });
const { MarketingBoundary } = require('../src/components/MarketingBoundary');
test('normal and India pages retain exactly the original marketing components', () => {
  for (pathname of ['/', '/welcome', '/soulmate', '/soulmate/checkout']) {
    const html = render(React.createElement(MarketingBoundary));
    assert.equal(html, '<span>existing-MetaPixel</span><span>existing-GoogleAnalytics</span><span>existing-Clarity</span>');
  }
});
test('US pages load only dedicated tracking properties', () => {
  process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID='123456789';
  process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID='G-USFIXTURE';
  process.env.NEXT_PUBLIC_US_SOULMATE_CLARITY_ID='usfixture';
  for (pathname of ['/us/soulmate','/us/soulmate/checkout','/us/soulmate/payment']) {
    const html = render(React.createElement(MarketingBoundary));
    assert.doesNotMatch(html, /existing-/);
    assert.match(html, /trackSingle/); assert.match(html, /G-USFIXTURE/); assert.match(html, /cookie_prefix:'us_soulmate'/);
  }
});
test('both checkout packages render with valid original artwork and approved USD prices and tax', () => {
  const { SoulmateCheckout } = require('../src/app/us/soulmate/soulmate-checkout');
  for (const planId of ['standard','express']) {
    const html = render(React.createElement(SoulmateCheckout,{planId}));
    assert.match(html, planId === 'standard' ? /Pay Now · \$43.66/ : /Pay Now · \$79.06/);
    assert.match(html, /<dt>Tax<\/dt>/);
    assert.match(html, planId === 'standard' ? /\$6.66/ : /\$12.06/);
    assert.match(html, /Payments are securely processed by Stripe/);
    assert.doesNotMatch(html, /₹|PayU|NaN|GST|18%|sketch-phone|name="phone"|type="tel"|secure window/);
    assert.match(html, /Secure card payments will be available soon/);
    assert.match(html, /us-soulmate-lander\/stories\/astrorekha-clean-5.png/);
    assert.doesNotMatch(html, /astrorekha-us-soulmate-description.png/);
    if(planId==='standard') assert.match(html, /checkout\/astrorekha-soulmate-description.png/);
    assert.match(html, /<button[^>]+disabled=""/);
  }
});
test('US tagged landings never overwrite the original UTM cookies', async () => {
  const { middleware } = require('../src/middleware');
  const { NextRequest } = require('next/server');
  for (const route of ['/us/soulmate','/us/soulmate/checkout']) {
    assert.equal((await middleware(new NextRequest('https://example.com'+route+'?utm_campaign=US'))).cookies.get('ar_utm_last'),undefined);
  }
  for (const route of ['/','/soulmate']) {
    assert.match((await middleware(new NextRequest('https://example.com'+route+'?utm_campaign=Original'))).cookies.get('ar_utm_last').value,/Original/);
  }
});
test('US checkout analytics queues before GA loads and targets only the US property', () => {
  const previousEnv = process.env.NODE_ENV, previousFetch = global.fetch;
  const requests = [], store = new Map();
  stub('../src/lib/us-soulmate-attribution-client', { getSoulmateAttributionPayload: () => ({ utm_source: 'meta' }) });
  process.env.NODE_ENV = 'production'; process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID = 'G-USFIXTURE';
  global.window = { fbq() {}, location: { pathname: '/us/soulmate/checkout', hostname: 'astrorekha.com', href: 'https://astrorekha.com/us/soulmate/checkout' } };
  global.sessionStorage = { getItem: k => store.get(k)||null, setItem: (k,v) => store.set(k,v) };
  global.fetch = async (url, init) => { assert.equal(url, '/api/us/soulmate/events'); requests.push(init); return {}; };
  try {
    const { trackSoulmate } = require('../src/lib/us-soulmate-tracking');
    trackSoulmate('checkout_view', { plan: 'standard', value: 19.95, once: 'checkout' });
    trackSoulmate('checkout_view', { plan: 'standard', value: 19.95, once: 'checkout' });
    assert.equal(window.dataLayer.length, 1); assert.equal(requests.length, 1);
    const event = window.dataLayer[0]; assert.equal(event[1], 'begin_checkout');
    assert.equal(event[2].send_to, 'G-USFIXTURE'); assert.equal(event[2].currency, 'USD');
    assert.equal(event[2].items[0].item_id, 'us_soulmate_standard');
    window.location.hostname='127.0.0.1'; trackSoulmate('chat_start'); assert.equal(requests.length,1);
  } finally { process.env.NODE_ENV = previousEnv; global.fetch = previousFetch; delete global.window; delete global.sessionStorage; }
});
