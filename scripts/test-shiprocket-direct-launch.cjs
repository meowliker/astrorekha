const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
function fixture() {
  const id = require.resolve('../src/lib/shiprocket-checkout-browser'); delete require.cache[id];
  let nodes = [], assigned = [], calls = [], listeners = {}, history = [];
  global.window = { location: { origin: 'https://astrorekha.com', href: 'https://astrorekha.com/onboarding/bundle-pricing', replace: url => assigned.push(url) }, history: {state: {}, pushState: (...args) => history.push(args)}, addEventListener: (name, fn) => listeners[name] = fn, removeEventListener: name => delete listeners[name] };
  global.document = { createElement: tag => ({ tag, style: {}, attrs: {}, listeners: {}, setAttribute(name, value) { this.attrs[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }, remove() { nodes = nodes.filter(n => n !== this); } }), head: { appendChild: node => nodes.push(node) }, body: { appendChild: node => nodes.push(node) } };
  const launch = require(id).openShiprocketCheckout;
  return { launch, nodes: () => nodes, assigned, calls, listeners, history, load() { window.HeadlessCheckout = { addToCart: (...args) => calls.push(args) }; nodes.find(n => n.tag === 'script').onload(); } };
}
const checkout = { token: 'fixture1234567890', ui: 'https://checkout-ui.shiprocket.com', recoveryPath: '/payment/processing?txnid=src' + 'a'.repeat(24) };
test('one SDK load and one overlay for concurrent clicks; no intermediate navigation; close recovers same order', async () => {
  const f = fixture(); const a = f.launch(checkout), b = f.launch(checkout);
  assert.equal(f.nodes().filter(n => n.tag === 'script').length, 1); assert.deepEqual(f.assigned, []);
  f.load(); await Promise.all([a, b]); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], checkout.token); assert.equal(f.calls[0][2].fallbackUrl, 'https://astrorekha.com' + checkout.recoveryPath);
  assert.deepEqual(f.assigned, []); f.calls[0][3]({ event: 'sr-headless-close' });
  assert.deepEqual(f.assigned, ['https://astrorekha.com' + checkout.recoveryPath]);
});
test('SDK failure clears the loading guard, allowing same-order retry', async () => {
  const f = fixture(); const first = f.launch(checkout); f.nodes().find(n => n.tag === 'script').onerror();
  await assert.rejects(first, /could not load/); assert.equal(f.calls.length, 0);
  const retry = f.launch(checkout); f.load(); await retry; assert.equal(f.calls.length, 1);
});
test('untrusted SDK origins, tokens and return paths never load scripts', async () => {
  const f = fixture(); for (const patch of [{ ui: 'https://evil.example' }, { token: '<script>' }, { recoveryPath: '//evil.example' }, { recoveryPath: '/login' }, { recoveryPath: checkout.recoveryPath + '&next=https://evil.example' }]) {
    await assert.rejects(f.launch({ ...checkout, ...patch }), /Invalid checkout/);
  } assert.equal(f.nodes().length, 0);
});
test('Soulmate cancellation uses its own order recovery route', async () => {
  const f = fixture(), path = '/soulmate/payment?order=sm_' + 'b'.repeat(20);
  const p = f.launch({ ...checkout, recoveryPath: path }); f.load(); await p;
  f.calls[0][3]({ event: 'sr-headless-close' }); assert.equal(f.assigned[0], 'https://astrorekha.com' + path);
});

test('browser back and visible back both recover the existing order exactly once', async () => {
 for (const via of ['browser', 'button']) {
  const f=fixture(), pending=f.launch(checkout); f.load(); await pending;
  assert.equal(f.history.length,1);
  const button=f.nodes().find(n=>n.tag==='button');
  assert.equal(button.attrs['aria-label'],'Back from secure checkout');
  if(via==='browser') f.listeners.popstate(); else button.listeners.click();
  f.calls[0][3]({event:'sr-headless-close'});
  assert.deepEqual(f.assigned,['https://astrorekha.com'+checkout.recoveryPath]);
  assert.equal(f.nodes().some(n=>n.tag==='button'),false);
 }
});
