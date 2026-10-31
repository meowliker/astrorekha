// Offline Next 15 request compatibility: no payments or external service calls.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
const originalLoad = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === 'next/navigation') return { redirect: url => { throw Object.assign(new Error('redirect'), { url }); } };
  if (name.endsWith('/soulmate-checkout')) return { SoulmateCheckout: () => null };
  if (name === './payment-status') return { SoulmatePaymentStatus: () => null };
  return originalLoad.call(this, name, parent, ...rest);
};

test('legacy welcome routes preserve attribution and repeated query values with async searchParams', async () => {
  for (const file of ['../src/app/welcome/page', '../src/app/welcome-b/page']) {
    const page = require(file).default;
    await assert.rejects(page({ searchParams: Promise.resolve({ utm_campaign: 'A + B', fbclid: 'fixture-click', repeated: ['a', 'b'] }) }), error => {
      const url = new URL(error.url, 'https://example.com');
      assert.equal(url.pathname, '/');
      assert.equal(url.searchParams.get('utm_campaign'), 'A + B');
      assert.equal(url.searchParams.get('fbclid'), 'fixture-click');
      assert.deepEqual(url.searchParams.getAll('repeated'), ['a', 'b']);
      return true;
    });
    await assert.rejects(page({}), error => error.url === '/');
  }
});

test('India and US checkout selection and payment return IDs survive async query resolution', async () => {
  for (const region of ['', 'us/']) {
    const checkout = require('../src/app/' + region + 'soulmate/checkout/page').default;
    const payment = require('../src/app/' + region + 'soulmate/payment/page').default;
    for (const plan of ['standard', 'express', 'invalid']) {
      const element = await checkout({ searchParams: Promise.resolve({ plan }) });
      assert.equal(element.props.planId, plan === 'express' ? 'express' : 'standard');
    }
    const element = await payment({ searchParams: Promise.resolve({ order: 'fixture-order' }) });
    assert.equal(element.props.orderId, 'fixture-order');
    assert.equal((await payment({ searchParams: Promise.resolve({}) })).props.orderId, '');
  }
});
