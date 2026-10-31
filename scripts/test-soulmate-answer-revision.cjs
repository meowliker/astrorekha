const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};

let rpcResult, called, removed;
const db = {
  rpc: async (name, params) => { called = { name, params }; return rpcResult; },
  storage: { from: () => ({ remove: async (paths) => { removed = paths; return { error: null }; } }) },
};
const adminFile = require.resolve('../src/lib/soulmate-admin');
require.cache[adminFile] = { id: adminFile, filename: adminFile, loaded: true, exports: { soulmateAdmin: async (request) => request.headers.get('authorization') === 'Bearer fixture' ? db : null, validSoulmateId: (id) => /^sm_[a-f0-9]{20}$/.test(id) } };
const fulfillmentFile = require.resolve('../src/lib/soulmate-fulfillment');
require.cache[fulfillmentFile] = { id: fulfillmentFile, filename: fulfillmentFile, loaded: true, exports: { SKETCH_BUCKET: 'fixture-private-bucket' } };

const { NextRequest } = require('next/server');
const { PATCH } = require('../src/app/api/admin/soulmate/orders/[id]/route');
const orderId = 'sm_aaaaaaaaaaaaaaaaaaaa';
const context = { params: Promise.resolve({ id: orderId }) };
const answers = {
  name: 'Anay',
  heart: 'I feel like I’ve been waiting forever',
  preferenceSelection: 'I like women',
  preference: 'I like women',
  feeling: 'Safe — someone who stays',
  birthDate: '1994-06-12',
  ethnicity: 'East / Northeast Indian',
};
const request = (value) => new NextRequest('https://example.com/api/admin/soulmate/orders/' + orderId, { method: 'PATCH', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify({ answers: value }) });

beforeEach(() => { rpcResult = { data: ['old/sketch.png', 'old/report.pdf'], error: null }; called = null; removed = null; });

test('answer revision validates the complete questionnaire and requires admin login', async () => {
  const unauthorized = new NextRequest('https://example.com', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) });
  assert.equal((await PATCH(unauthorized, context)).status, 401);
  assert.equal((await PATCH(request({ name: 'Anay' }), context)).status, 400);
  assert.equal(called, null);
});

test('answer revision uses the audited reset RPC and cleans up superseded private files', async () => {
  const response = await PATCH(request(answers), context);
  assert.equal(response.status, 200);
  assert.equal(called.name, 'revise_soulmate_order_answers');
  assert.equal(called.params.p_order, orderId);
  assert.deepEqual(called.params.p_answers, answers);
  assert.deepEqual(removed, rpcResult.data);
});

test('answer revision is rejected after delivery submission', async () => {
  rpcResult = { data: null, error: { message: 'Delivery has already been submitted' } };
  const response = await PATCH(request(answers), context);
  assert.equal(response.status, 409);
  assert.deepEqual(removed, null);
});
