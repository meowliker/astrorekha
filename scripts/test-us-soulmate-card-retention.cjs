const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
require.extensions['.css'] = module => { module.exports = {}; };
const React = require('react');
const { create, act } = require('react-test-renderer');
function stub(file, exports) { const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('next/image', () => null);
stub('next/link', ({ children, ...props }) => React.createElement('a', props, children));
stub('../src/app/us/soulmate/soulmate-image', { SoulmateImage: () => null });
stub('../src/lib/us-soulmate-tracking', { trackSoulmate() {}, soulmateTrackingContext: () => ({}) });
stub('../src/app/us/soulmate/session-save', { checkoutSession: () => null });
const state = require('../src/app/us/soulmate/checkout-state');
const answers = { name: 'Test', heart: 'I feel like I’ve been waiting forever', preferenceSelection: 'I like men', preference: 'I like men', feeling: 'Safe — someone who stays', birthDate: '1995-01-01', ethnicity: 'White' };
state.readCheckoutDetails = () => ({ answers, email: 'fixture@example.com', planId: 'express', addOns: ['timeline'] });
state.saveCheckoutDetails = () => {};
const client = require('../src/app/us/soulmate/stripe-inline-client');
const { StripePaymentFields } = require('../src/app/us/soulmate/stripe-payment-fields');
const { SoulmateCheckout } = require('../src/app/us/soulmate/soulmate-checkout');
const previousFetch = global.fetch;
let tree;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = undefined; global.fetch = previousFetch; delete global.window; delete global.sessionStorage; delete process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY; });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture({ holdUpdates = false } = {}) {
  process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY = 'pk_test_fixture';
  const store = new Map(), handlers = {}, calls = { mounts: 0, destroys: 0, creates: 0, updates: [], requests: [], confirms: [], methods: 0 }, pending = [];
  global.sessionStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  global.window = { setTimeout, clearTimeout, location: { origin: 'http://localhost', assign: value => { calls.receipt = value; } } };
  // An opaque marker represents Stripe-owned input. Application code cannot read it.
  let entered = false, currentAmount, serverAmount, hiddenBillingFields = {};
  const element = { mount() { calls.mounts++; handlers.ready(); }, destroy() { calls.destroys++; entered = false; }, on(event, handler) { handlers[event] = handler; } };
  const elements = {
    create(type, options) { hiddenBillingFields = options.fields.billingDetails; calls.creates++; return element; },
    async submit() { return entered ? {} : { error: { message: 'Card details missing' } }; },
    async update({ amount }) { calls.updates.push(amount); if (holdUpdates) { const wait = deferred(); pending.push(wait); await wait.promise; } currentAmount = amount; },
  };
  const stripe = {
    elements({ amount }) { currentAmount = amount; return elements; },
    async createPaymentMethod({ params }) {
      // Mirror Stripe's integration contract: `never` delegates collection to the caller.
      for (const [field, mode] of Object.entries(hiddenBillingFields)) {
        if (mode === 'never') assert.notEqual(params.billing_details[field], undefined, `Hidden billing field ${field} must be supplied to Stripe`);
      }
      assert.equal(params.billing_details.phone, '', 'Do not require or fabricate a customer phone');
      calls.methods++; return { paymentMethod: { id: 'pm_fixture' } };
    },
    initCheckoutElementsSdk() {
      const amount = serverAmount;
      return { async loadActions() { return { type: 'success', actions: {
        getSession: () => ({ currency: 'usd', minorUnitsAmountDivisor: 100, canConfirm: true, total: { total: { minorUnitsAmount: amount, amount: '$' + (amount / 100).toFixed(2) } } }),
        async confirm(options) {
          // Our server sets customer_email at session creation; Stripe locks it then.
          assert.equal(Object.hasOwn(options, 'email'), false, 'Cannot override the server-set Checkout Session email in confirm()');
          assert.equal(Object.hasOwn(options, 'phoneNumber'), false, 'Checkout Session phone collection is disabled');
          calls.confirms.push({ amount, options }); return { type: 'success' };
        },
      } }; } };
    },
  };
  client.loadUSStripe = async () => () => stripe;
  global.fetch = async (url, options) => {
    assert.equal(url, '/api/us/soulmate/checkout');
    const body = JSON.parse(options.body); calls.requests.push(body);
    if (body.promotionCode === 'INVALID') return { ok: false, json: async () => ({ error: 'Invalid promo code' }) };
    serverAmount = body.promotionCode ? 304 : currentAmount;
    return { ok: true, json: async () => ({ amount: serverAmount, clientSecret: 'cs_fixture', receiptUrl: '/us/soulmate/payment?order=us_sm_' + 'a'.repeat(20), quote: body.promotionCode ? { subtotal: 8600, discount: 8342, tax: 46, total: 304, code: body.promotionCode } : undefined }) };
  };
  return { calls, pending, stripe, elements, enter: () => { entered = true; handlers.change({ complete: true }); }, preserved: () => entered };
}
async function mount(component) { await act(async () => { tree = create(component, { createNodeMock: () => ({}) }); }); }
function button(label) { return tree.root.findAllByType('button').find(node => node.children.includes(label)); }
async function apply(code) {
  await act(async () => tree.root.findByProps({ id: 'promo-code' }).props.onChange({ target: { value: code } }));
  await act(async () => button('Apply').props.onClick());
}

test('real checkout Apply, Remove, invalid promo and add-ons preserve the mounted card form', async () => {
  const f = fixture();
  await mount(React.createElement(SoulmateCheckout, { planId: 'express' }));
  await act(async () => f.enter());
  assert.equal(tree.root.findByProps({ type: 'submit' }).props.disabled, false);
  await apply('Soulmate97');
  assert.equal(f.calls.updates.at(-1), 304);
  assert.equal(tree.root.findByProps({ type: 'submit' }).props.disabled, false);
  await act(async () => button('Remove').props.onClick());
  assert.equal(f.calls.updates.at(-1), 10148);
  await apply('INVALID');
  assert.match(JSON.stringify(tree.toJSON()), /Invalid promo code/);
  assert.equal(f.calls.updates.at(-1), 10148);
  const extras = tree.root.findByType(require('../src/app/us/soulmate/checkout-extras').CheckoutExtras);
  await act(async () => extras.props.onChange([]));
  assert.equal(f.calls.updates.at(-1), 7906);
  await act(async () => extras.props.onChange(['timeline']));
  await apply('Soulmate97');
  assert.equal(f.preserved(), true);
  assert.equal(f.calls.mounts, 1); assert.equal(f.calls.creates, 1); assert.equal(f.calls.destroys, 0);
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(f.calls.requests.at(-1).promotionCode, 'Soulmate97');
  assert.deepEqual(f.calls.confirms, [{ amount: 304, options: { redirect: 'if_required', paymentMethod: 'pm_fixture' } }]);
  assert.match(f.calls.receipt, /^\/us\/soulmate\/payment/);
});

test('rapid amount changes wait for Stripe, reject stale handlers and finish on the latest cart', async () => {
  const f = fixture({ holdUpdates: true }); let payment;
  const onPayment = value => { payment = value; };
  const props = (signature, amount) => ({ signature: JSON.stringify({ planId: 'express', revision: signature }), amount, enabled: true, onPayment });
  await mount(React.createElement(StripePaymentFields, props('original', 10148)));
  await act(async () => f.enter()); const original = payment;
  await act(async () => tree.update(React.createElement(StripePaymentFields, props('promo', 304))));
  assert.equal(payment.canPay, false);
  await assert.rejects(original.confirm('fixture@example.com'), /Checkout changed/);
  await act(async () => tree.update(React.createElement(StripePaymentFields, props('removed', 10148))));
  assert.deepEqual(f.calls.updates, [304]);
  await act(async () => f.pending[0].resolve());
  assert.deepEqual(f.calls.updates, [304, 10148]); assert.equal(payment.canPay, false);
  await act(async () => f.pending[1].resolve());
  assert.equal(payment.canPay, true); assert.equal(f.preserved(), true);
  await act(async () => payment.confirm('fixture@example.com'));
  assert.equal(f.calls.confirms[0].amount, 10148);
  assert.equal(f.calls.requests.at(-1).revision, 'removed');
  assert.equal(f.calls.mounts, 1); assert.equal(f.calls.destroys, 0);
});

test('a cart change during async card collection cannot confirm the old order', async () => {
  const f = fixture(); let payment;
  const onPayment = value => { payment = value; };
  const props = { signature: JSON.stringify({ planId: 'express' }), amount: 7906, enabled: true, onPayment };
  await mount(React.createElement(StripePaymentFields, props));
  await act(async () => f.enter());
  const wait = deferred(); f.stripe.createPaymentMethod = () => wait.promise;
  const attempt = payment.confirm('fixture@example.com');
  const rejection = assert.rejects(attempt, /Checkout changed/);
  await act(async () => tree.update(React.createElement(StripePaymentFields, { ...props, signature: JSON.stringify({ planId: 'express', promotionCode: 'SALE' }), amount: 304 })));
  await act(async () => wait.resolve({ paymentMethod: { id: 'pm_fixture' } }));
  await rejection;
  assert.equal(f.calls.requests.length, 0); assert.equal(f.calls.confirms.length, 0);
  assert.equal(f.preserved(), true);
});

test('an amount update failure blocks payment and never silently clears card details', async () => {
  const f = fixture({ holdUpdates: true }); let payment;
  const onPayment = value => { payment = value; };
  const props = { signature: '{}', amount: 7906, enabled: true, onPayment };
  await mount(React.createElement(StripePaymentFields, props));
  await act(async () => f.enter());
  await act(async () => tree.update(React.createElement(StripePaymentFields, { ...props, signature: '{"promotionCode":"SALE"}', amount: 304 })));
  await act(async () => f.pending[0].reject(new Error('Stripe update failed')));
  assert.equal(payment, null); assert.match(JSON.stringify(tree.toJSON()), /Stripe update failed/);
  assert.equal(f.calls.confirms.length, 0); assert.equal(f.calls.destroys, 0); assert.equal(f.preserved(), true);
});
