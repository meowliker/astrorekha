const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { GOOGLE_ADS_STEPS, GOOGLE_ADS_PAYWALL, bundleCheckoutRetryPath, googleAdsStep, onboardingDestination, isGoogleAdsFunnelPath } = require('../src/lib/google-ads-funnel');
const { discoverBundlePrice } = require('../src/lib/discover-bundle-price');
const { DEFAULT_PRICING } = require('../src/lib/pricing');
const { quotePaymentOrder } = require('../src/lib/payment-quote');
const { rememberDiscoverBundleCheckout, discoverBundleRetryPath } = require('../src/lib/discover-bundle-checkout');

test('every existing pre-paywall step stays in the public Ads journey, including query/hash and backward links', () => {
  for (const step of GOOGLE_ADS_STEPS) {
    const normal = '/onboarding' + (step ? '/' + step : '');
    assert.equal(onboardingDestination(normal + '?utm_source=google&gclid=fixture#details', true),
      '/discover' + normal + '?utm_source=google&gclid=fixture#details');
    assert.equal(onboardingDestination(normal, false), normal);
    assert.equal(googleAdsStep(step ? [step] : []), step);
  }
});
test('the Ads paywall stays scoped; payment references, registration and report access keep their original destinations', () => {
  assert.equal(onboardingDestination('/onboarding/bundle-pricing?gclid=fixture#plans', true), GOOGLE_ADS_PAYWALL + '?gclid=fixture#plans');
  assert.equal(onboardingDestination('/onboarding/bundle-pricing', false), '/onboarding/bundle-pricing');
  for (const href of ['/onboarding/bundle-pricing-b', '/onboarding/bundle-upsell',
    '/onboarding/step-19', '/onboarding/step-20', '/payment/processing?txnid=ptm_fixture',
    '/login?email=fixture%40example.com', '/reports', '/dashboard', '/soulmate', '/us/soulmate', 'https://example.com/']) {
    assert.equal(onboardingDestination(href, true), href);
    assert.equal(onboardingDestination(href, false), href);
  }
});
test('unknown and nested steps cannot render arbitrary shared pages through the Ads namespace', () => {
  for (const input of [['bundle-pricing'], ['step-19'], ['step-5', 'extra'], ['..'], ['birthday?x=1']]) {
    assert.equal(googleAdsStep(input), null);
  }
  assert.equal(isGoogleAdsFunnelPath('/discover'), true);
  assert.equal(isGoogleAdsFunnelPath('/discover/onboarding/step-13'), true);
  for (const path of ['/discover-other', '/onboarding', '/us/soulmate']) assert.equal(isGoogleAdsFunnelPath(path), false);
});
test('retry URLs accept only the known Ads checkout and otherwise preserve the original destination', () => {
  assert.equal(bundleCheckoutRetryPath(GOOGLE_ADS_PAYWALL), GOOGLE_ADS_PAYWALL);
  for (const value of [undefined, null, '', '/onboarding/bundle-pricing', '/discover/onboarding/step-19',
    'https://example.com', '//example.com', GOOGLE_ADS_PAYWALL + '?redirect=evil', { url: GOOGLE_ADS_PAYWALL }]) {
    assert.equal(bundleCheckoutRetryPath(value), '/onboarding/bundle-pricing');
  }
});
test('failed popup retry survives cleared pending state, stays bound to the exact order, and expires safely', () => {
  let record;
  global.sessionStorage = { setItem: (_, value) => { record = value; }, getItem: () => record };
  global.window = { location: { pathname: GOOGLE_ADS_PAYWALL } };
  rememberDiscoverBundleCheckout('new-order');
  assert.equal(discoverBundleRetryPath('new-order', null), GOOGLE_ADS_PAYWALL);
  assert.equal(discoverBundleRetryPath('different-order', null), '/onboarding/bundle-pricing');
  assert.equal(discoverBundleRetryPath('new-order', { txnid: 'different-order', checkoutPath: GOOGLE_ADS_PAYWALL }), GOOGLE_ADS_PAYWALL);
  const saved = JSON.parse(record);
  for (const change of [{ checkoutPath: 'https://evil.example' }, { createdAt: Date.now() - 86400001 }, { createdAt: Date.now() + 60000 }]) {
    record = JSON.stringify({ ...saved, ...change });
    assert.equal(discoverBundleRetryPath('new-order', null), '/onboarding/bundle-pricing');
  }
  record = 'corrupt'; assert.equal(discoverBundleRetryPath('new-order', null), '/onboarding/bundle-pricing');
  global.window.location.pathname = '/onboarding/bundle-pricing';
  rememberDiscoverBundleCheckout('legacy-order'); assert.equal(record, 'corrupt');
  delete global.window; delete global.sessionStorage;
});
test('the tax-inclusive displayed amount agrees with the unchanged server quote, including configured display prices', () => {
  for (const plan of DEFAULT_PRICING.bundles.filter(p => p.active)) {
    for (const displayPrice of [plan.displayPrice, 999.99, 49.95, 1250.50]) {
      const configured = { ...plan, displayPrice };
      const pricing = { ...DEFAULT_PRICING, bundles: [configured] };
      const quote = quotePaymentOrder(pricing, { type: 'bundle', bundleId: plan.id });
      const shown = discoverBundlePrice(configured);
      assert.equal(Math.round(shown.total * 100), quote.amount);
      assert.equal(Math.round(shown.gst * 100), quote.gstAmount);
      assert.equal(Math.round(shown.base * 100), quote.baseAmount);
    }
  }
});
test('legacy paywall markup and checkout/coupon handlers remain exactly the original implementation', () => {
  const file = 'src/app/(onboarding)/onboarding/bundle-pricing/page.tsx';
  const current = fs.readFileSync(file, 'utf8');
  const original = execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' });
  const markup = '\n  return (\n    <motion.div';
  assert.equal(current.slice(current.lastIndexOf(markup)), original.slice(original.lastIndexOf(markup)));
  const handlers = source => source.slice(source.indexOf('  const handlePurchase = async'), source.indexOf('\n  };', source.indexOf('  const handleCouponUnlock')) + '\n  };'.length);
  assert.equal(handlers(current), handlers(original));
});
test('the Ads paywall copies the original layout and keeps its section order rather than replacing the design', () => {
  const baseline = execFileSync('git', ['show', 'HEAD:src/app/(onboarding)/onboarding/bundle-pricing/page.tsx'], { encoding: 'utf8' });
  const original = baseline.slice(baseline.lastIndexOf('\n  return (\n    <motion.div'));
  const revised = fs.readFileSync('src/components/onboarding/DiscoverBundlePaywall.tsx', 'utf8');
  const classes = text => [...text.matchAll(/className="([^"]+)"/g)].map(x => x[1]);
  // Remove the unsupported reference-price styling and the owner's redundant GST paragraphs only.
  const removed = new Set(['mb-3 text-xs font-bold text-muted-foreground', 'mt-2 text-center text-xs font-bold text-muted-foreground']);
  const expected = classes(original).filter(value => !value.includes('line-through') && !removed.has(value));
  const actual = classes(revised);
  let after = 0;
  for (const value of expected) {
    const position = actual.indexOf(value, after);
    assert.ok(position >= after, 'original layout/class missing or reordered: ' + value);
    after = position + 1;
  }
  assert.equal((revised.match(/<ProductOfferTracker/g) || []).length, 1);
  assert.ok(!revised.includes('fetch('), 'presentation must keep the existing payment and tracking handlers');
});
test('the payment/tracking implementation and all shared post-payment destinations remain byte-identical', () => {
  const protectedFiles = [
    'src/app/(onboarding)/onboarding/bundle-upsell/page.tsx',
    'src/app/(onboarding)/onboarding/step-19/page.tsx', 'src/app/(onboarding)/onboarding/step-20/page.tsx',
    'src/app/api/payments/initiate/route.ts',
    'src/lib/payu-fulfillment.ts', 'src/lib/ga4-purchase.ts', 'src/lib/meta-purchase.ts',
    'src/lib/attribution-client.ts', 'src/components/MarketingBoundary.tsx',
    'src/app/soulmate/soulmate-landing.tsx', 'src/app/us/soulmate/soulmate-landing.tsx',
  ];
  for (const file of protectedFiles) {
    assert.equal(fs.readFileSync(file, 'utf8'), execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' }), file);
  }
});
