/* Browser-state contracts only. No network, payment or customer records. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const Module = require('node:module'), path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const state = require('../src/app/soulmate/checkout-state');
const rows = new Map();
const answers = { name: 'Maya', heart: 'I feel like I’ve been waiting forever', preferenceSelection: 'I like men', preference: 'I like women', feeling: 'Safe — someone who stays', birthDate: '1995-01-01', ethnicity: 'North Indian' };
beforeEach(() => {
  global.sessionStorage = { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
  rows.clear();
  state.clearCheckoutDetails();
});
test('both plans retain the exact confirmed answers through navigation and reload', () => {
  for (const planId of ['standard', 'express']) {
    state.prepareCheckout(answers, planId);
    state.saveCheckoutDetails({ answers, planId, email: 'maya@example.com', phone: '9876543210' });
    const modulePath = require.resolve('../src/app/soulmate/checkout-state');
    delete require.cache[modulePath];
    const reloaded = require(modulePath).readCheckoutDetails();
    assert.deepEqual(reloaded.answers, answers);
    assert.equal(reloaded.planId, planId);
    assert.equal(reloaded.email, 'maya@example.com');
    assert.equal(reloaded.phone, '9876543210');
    assert.deepEqual(JSON.parse(rows.get(state.CHECKOUT_RECOVERY_KEY)).answers, answers);
  }
});
test('changing the plan preserves contact data; starting a new session clears it', () => {
  state.saveCheckoutDetails({ answers, planId: 'standard', email: 'maya@example.com', phone: '9876543210' });
  state.prepareCheckout(answers, 'express');
  assert.equal(state.readCheckoutDetails().email, 'maya@example.com');
  state.clearCheckoutDetails();
  state.prepareCheckout(answers, 'standard');
  assert.equal(state.readCheckoutDetails().email, '');
});
test('expired, incomplete and malformed snapshots cannot enable payment', () => {
  const key = 'astrorekha-soulmate-checkout-details-v1';
  for (const data of [
    { answers, planId: 'standard', savedAt: Date.now() - 25 * 3600000 },
    { answers: { name: 'Maya' }, planId: 'standard', savedAt: Date.now() },
    { answers, planId: 'unknown', savedAt: Date.now() },
    { answers, planId: 'standard' },
  ]) {
    rows.set(key, JSON.stringify(data));
    assert.equal(state.readCheckoutDetails(), null);
  }
});
test('blocked browser storage retains answers during client-side navigation', () => {
  global.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  state.prepareCheckout(answers, 'express');
  assert.deepEqual(state.readCheckoutDetails().answers, answers);
  assert.equal(state.readCheckoutDetails().planId, 'express');
});

test('optional extras persist on the same plan and cannot leak across delivery plans', () => {
  state.saveCheckoutDetails({ answers, planId: 'standard', email: 'maya@example.com', phone: '9876543210', addOns: ['colour', 'description'] });
  assert.deepEqual(state.readCheckoutDetails().addOns, ['description', 'colour']);
  state.prepareCheckout(answers, 'standard');
  assert.deepEqual(state.readCheckoutDetails().addOns, ['description', 'colour']);
  state.prepareCheckout(answers, 'express');
  assert.deepEqual(state.readCheckoutDetails().addOns, []);
  state.saveCheckoutDetails({ answers, planId: 'express', email: 'maya@example.com', phone: '9876543210', addOns: ['timeline', 'priority'] });
  assert.deepEqual(state.readCheckoutDetails().addOns, ['timeline']);
  state.prepareCheckout(answers, 'standard');
  assert.deepEqual(state.readCheckoutDetails().addOns, []);
  state.prepareCheckout({ ...answers, name: 'Another customer' }, 'standard');
  assert.deepEqual(state.readCheckoutDetails().addOns, []);
});
