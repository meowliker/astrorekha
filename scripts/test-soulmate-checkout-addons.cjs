const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const Module = require('node:module'), path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { checkoutAddOns, addOnsForPlan, checkoutTotals, sanitizeAddOnIds } = require('../src/app/soulmate/checkout-addons');

test('approved extra prices are exclusive of GST', () => {
  assert.deepEqual(Object.fromEntries(checkoutAddOns.map(({ id, price }) => [id, price])), { description: 399, colour: 299, priority: 249, timeline: 399 });
});
test('standard gets three extras; express gets only the timeline, with correct GST', () => {
  const standard = addOnsForPlan('standard');
  const express = addOnsForPlan('express');
  assert.deepEqual(standard.map(item => item.id), ['description', 'colour', 'priority']);
  assert.deepEqual(express.map(item => item.id), ['timeline']);
  for (let mask = 0; mask < 8; mask++) {
    const selected = standard.filter((_, index) => mask & (1 << index));
    const subtotal = 999 + selected.reduce((sum, item) => sum + item.price, 0);
    const gst = Math.round(subtotal * 18) / 100;
    assert.deepEqual(checkoutTotals(999, selected.map(item => item.id), standard), { subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 });
  }
  assert.equal(checkoutTotals(999, ['description', 'colour', 'priority'], standard).total, 2296.28);
  assert.deepEqual(checkoutTotals(1499, ['timeline'], express), { subtotal: 1898, gst: 341.64, total: 2239.64 });
  assert.equal(checkoutTotals(1499, [], express).total, 1768.82);
  assert.equal(checkoutTotals(1499, ['priority'], express), null);
  assert.equal(checkoutTotals(999, ['timeline'], standard), null);
  assert.deepEqual(sanitizeAddOnIds(['description', 'timeline', 'colour'], 'express'), ['timeline']);
});
test('duplicate selections cannot double-charge and unknown or unpriced extras never become free', () => {
  assert.deepEqual(sanitizeAddOnIds(['colour', 'colour', 'unknown', 'description']), ['description', 'colour']);
  assert.equal(checkoutTotals(999, ['colour', 'colour']).subtotal, 1298);
  assert.equal(checkoutTotals(999, ['unknown']), null);
  assert.equal(checkoutTotals(999, ['colour'], [{ id: 'colour', price: null }]), null);
});
