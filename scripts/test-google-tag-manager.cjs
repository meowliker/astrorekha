// Tracking initialization tests only: no analytics requests or customer data.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const Module = require('node:module');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
let pathname = '/';
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'next/navigation') return { usePathname: () => pathname };
  if (name === 'next/script') return { __esModule: true, default: props => React.createElement('script', props) };
  if (name === './MetaPixel') return { MetaPixel: () => React.createElement('meta', { name: 'existing-meta-pixel' }) };
  if (name === './Clarity') return { Clarity: () => React.createElement('meta', { name: 'existing-clarity' }) };
  return load.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...args);
};
process.env.NEXT_PUBLIC_GA_ID = 'G-EXISTING123';
process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID = 'G-USFIXTURE1';
const { GoogleTagManager } = require('../src/components/GoogleTagManager');
const { GoogleAnalytics } = require('../src/components/GoogleAnalytics');
const { MarketingBoundary } = require('../src/components/MarketingBoundary');

test('main routes retain exactly one GA setup and both existing marketing components', () => {
  for (pathname of ['/', '/onboarding/bundle-pricing', '/soulmate', '/payment/processing']) {
    const html = renderToStaticMarkup(React.createElement(MarketingBoundary));
    assert.equal((html.match(/id="google-tag-manager"/g) || []).length, 1);
    assert.equal((html.match(/id="google-analytics"/g) || []).length, 1);
    assert.equal((html.match(/gtag\(&#x27;config&#x27;/g) || []).length, 1);
    assert.match(html, /existing-meta-pixel/);
    assert.match(html, /existing-clarity/);
    assert.ok(html.startsWith('<noscript><iframe'), 'fallback appears at beginning of body marketing boundary');
    assert.match(html, /ns\.html\?id=GTM-TDGZTVTD/);
  }
});

test('preview pages stay excluded and the US flow keeps its own analytics only', () => {
  for (pathname of ['/page-previews', '/page-previews/witch-archetype']) assert.equal(renderToStaticMarkup(React.createElement(MarketingBoundary)), '');
  for (pathname of ['/us/soulmate', '/us/soulmate/checkout']) {
    const html = renderToStaticMarkup(React.createElement(MarketingBoundary));
    assert.doesNotMatch(html, /GTM-TDGZTVTD|G-EXISTING123/);
    assert.match(html, /G-USFIXTURE1/);
  }
});

test('GTM preserves queued events and gtag identity regardless of initialization order', () => {
  const gtmScript = GoogleTagManager().props.children[1].props.children;
  const gaScript = GoogleAnalytics().props.children[1].props.children;
  for (const gaFirst of [true, false]) {
    const queued = [{ event: 'existing-event', value: 10 }];
    const inserted = [];
    const first = { parentNode: { insertBefore: script => inserted.push(script) } };
    const context = { dataLayer: queued, document: { getElementsByTagName: () => [first], createElement: () => ({}) } };
    context.window = context;
    vm.createContext(context);
    if (gaFirst) vm.runInContext(gaScript, context);
    const gtag = context.gtag;
    vm.runInContext(gtmScript, context);
    if (gaFirst) assert.equal(context.gtag, gtag, 'GTM must not replace gtag');
    else vm.runInContext(gaScript, context);
    assert.equal(context.dataLayer, queued, 'existing queue must not be replaced');
    assert.equal(queued[0].event, 'existing-event');
    assert.equal(queued.filter(e => e.event === 'gtm.js').length, 1);
    assert.equal(queued.filter(e => e[0] === 'config').length, 1);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].async, true);
    assert.equal(inserted[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-TDGZTVTD');
    vm.runInContext("gtag('event', 'fixture-event', {value: 1});", context);
    assert.equal(queued.filter(e => e[0] === 'event' && e[1] === 'fixture-event').length, 1);
  }
});
