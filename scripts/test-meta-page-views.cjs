// Exercise the real Pixel initialization and React effects without loading Meta or sending events.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path'), Module = require('node:module'), vm = require('node:vm');
const React = require('react'), Renderer = require('react-test-renderer');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
let pathname = '/discover', search = '', marketing = [];
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'next/navigation') return { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search) };
  if (name === 'next/script') return { __esModule: true, default: props => React.createElement('script', props) };
  if (name === '@/lib/marketing-events-client') return { captureMarketingAttribution: () => ({ utm_campaign: 'fixture' }), trackMarketingEvent: async value => { marketing.push(value); } };
  return load.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...args);
};
process.env.NEXT_PUBLIC_META_PIXEL_ID = '123456789';
global.IS_REACT_ACT_ENVIRONMENT = true;
const { MetaPixel } = require('../src/components/MetaPixel');

for (const initFirst of [true, false]) test(`one initial Pixel PageView and one per navigation when initialization is ${initFirst ? 'first' : 'delayed'}`, async () => {
  pathname = '/discover'; search = ''; marketing = [];
  const queued = [], inserted = [];
  const context = { document: { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore: item => inserted.push(item) } }] } };
  context.window = context; global.window = context;
  const timeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...args) => ms === 500 ? (queued.push(() => fn(...args)), 1) : timeout(fn, ms, ...args);
  let root;
  try {
    // The component's Script body is the actual production init snippet.
    const init = MetaPixel().props.children[0].props.children;
    if (initFirst) vm.runInNewContext(init, context);
    await Renderer.act(async () => { root = Renderer.create(React.createElement(MetaPixel)); });
    if (!initFirst) { vm.runInNewContext(init, context); queued.splice(0).forEach(fn => fn()); }
    const views = () => context.fbq.queue.filter(x => x[0] === 'track' && x[1] === 'PageView');
    assert.equal(inserted.length, 1); assert.equal(views().length, 1);
    assert.equal(context.fbq.disablePushState, true, 'SDK automatic history tracking must not compete with route effects');
    assert.ok(views()[0][3].eventID);
    await Renderer.act(async () => root.update(React.createElement(MetaPixel)));
    assert.equal(views().length, 1, 'ordinary rerender must not duplicate a view');
    pathname = '/discover/onboarding';
    await Renderer.act(async () => root.update(React.createElement(MetaPixel)));
    assert.equal(views().length, 2);
    search = '?utm_campaign=next-visit';
    await Renderer.act(async () => root.update(React.createElement(MetaPixel)));
    assert.equal(views().length, 3); assert.equal(marketing.length, 3);
    assert.equal(new Set(views().map(x => x[3].eventID)).size, 3);
  } finally {
    if (root) await Renderer.act(async () => root.unmount());
    global.setTimeout = timeout; delete global.window;
  }
});
test('browser and server purchases retain matching transaction IDs, real totals, currency and attribution', () => {
  const { pixelEvents } = require('../src/lib/pixel-events');
  const { buildMetaPurchaseEvent } = require('../src/lib/meta-purchase');
  const events = []; global.window = { fbq: (...args) => events.push(args) };
  try {
    for (const txnId of ['pay_fixture', 'ptm' + 'a'.repeat(24), 'pnl' + 'b'.repeat(24)]) {
      const server = buildMetaPurchaseEvent({ id: 'database-row-' + txnId, payu_txn_id: txnId, amount: 65962, bundle_id: 'palm-reading', fbc: 'fixture-fbc', fbp: 'fixture-fbp', customer_email: 'fixture@example.com' });
      pixelEvents.purchase(659.62, 'palm-reading', 'Palm Reading', txnId);
      const browser = events.at(-1);
      assert.equal(browser[3].eventID, server.event_id); assert.equal(server.event_id, txnId);
      assert.equal(browser[2].value, server.custom_data.value); assert.equal(server.custom_data.value, 659.62);
      assert.equal(browser[2].currency, server.custom_data.currency); assert.equal(server.custom_data.currency, 'INR');
      assert.equal(server.user_data.fbc, 'fixture-fbc'); assert.equal(server.user_data.fbp, 'fixture-fbp');
      assert.match(server.user_data.em[0], /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(server).includes('fixture@example.com'));
    }
  } finally { delete global.window; }
});
