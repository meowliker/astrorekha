/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness replaces module boundaries before loading TypeScript. */
// Exercise the real purchase sender with isolated database/HTTP boundaries.
// No environment files are loaded and no requests reach Google or Supabase.
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
let row, requests, status;
const db = { from(table) {
  assert.equal(table, 'payments');
  let patch, conditions = [];
  const run = async () => {
    if (!conditions.every(condition => condition(row))) return { data: null, error: null };
    Object.assign(row, patch);
    return { data: { id: row.id }, error: null };
  };
  const query = {
    update(value) { patch = value; return query; },
    eq(key, value) { conditions.push(record => record[key] === value); return query; },
    is(key, value) { conditions.push(record => record[key] === value); return query; },
    or(expression) {
      const cutoff = expression.split('.lt.')[1];
      conditions.push(record => !record.ga_purchase_claimed_at || record.ga_purchase_claimed_at < cutoff);
      return query;
    },
    select() { return query; },
    maybeSingle: run,
    then(ok, fail) { return run().then(ok, fail); },
  };
  return query;
} };
const admin = require.resolve('../src/lib/supabase-admin');
require.cache[admin] = { id: admin, filename: admin, loaded: true, exports: { getSupabaseAdmin: () => db } };
const { sendGa4Purchase } = require('../src/lib/ga4-purchase');
beforeEach(() => {
  row = { id: 'fixture-purchase', ga_purchase_sent_at: null, ga_purchase_claimed_at: null };
  requests = [];
  status = 204;
  process.env.GA4_MEASUREMENT_ID = 'G-FIXTURE';
  process.env.GA4_API_SECRET = 'fixture-secret';
  delete process.env.GA4_MP_DEBUG;
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), body: JSON.parse(options.body) });
    return new Response(status === 204 ? null : JSON.stringify({ validationMessages: [] }), { status });
  };
});
const order = () => ({ id: row.id, amount: 100, bundle_id: 'palm-reading', ga_client_id: '123.456', ga_session_id: '123456', utm_source: 'fixture-source', utm_campaign: 'fixture-campaign' });

test('concurrent verified purchase sends preserve one INR event, client identity and attribution', async () => {
  await Promise.all([sendGa4Purchase(order()), sendGa4Purchase(order())]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, '/mp/collect');
  const body = requests[0].body, event = body.events[0];
  assert.equal(body.client_id, '123.456');
  assert.equal(event.name, 'purchase');
  assert.equal(event.params.transaction_id, row.id);
  assert.equal(event.params.value, 1);
  assert.equal(event.params.currency, 'INR');
  assert.equal(event.params.session_id, '123456');
  assert.equal(event.params.source, 'fixture-source');
  assert.equal(event.params.campaign, 'fixture-campaign');
  assert.equal(event.params.items[0].price, 1);
  assert.ok(row.ga_purchase_sent_at);
  await sendGa4Purchase(order());
  assert.equal(requests.length, 1, 'a stale caller must not resend a stamped purchase');
});

test('HTTP failure releases the claim so recovery can send the same transaction', async () => {
  status = 503;
  await assert.rejects(sendGa4Purchase(order()), /503/);
  assert.equal(row.ga_purchase_sent_at, null);
  assert.equal(row.ga_purchase_claimed_at, null);
  status = 204;
  await sendGa4Purchase(order());
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.events[0].params.transaction_id, requests[1].body.events[0].params.transaction_id);
  assert.ok(row.ga_purchase_sent_at);
});

test('debug validation never marks a purchase as collected', async () => {
  process.env.GA4_MP_DEBUG = 'true'; status = 200;
  await sendGa4Purchase(order());
  assert.equal(requests[0].url.pathname, '/debug/mp/collect');
  assert.equal(row.ga_purchase_sent_at, null);
  assert.equal(row.ga_purchase_claimed_at, null);
});

test('missing configuration sends nothing and stale claims can recover', async () => {
  delete process.env.GA4_API_SECRET;
  await sendGa4Purchase(order());
  assert.equal(requests.length, 0);
  assert.equal(row.ga_purchase_claimed_at, null);
  process.env.GA4_API_SECRET = 'fixture-secret';
  row.ga_purchase_claimed_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  await sendGa4Purchase(order());
  assert.equal(requests.length, 1);
  assert.ok(row.ga_purchase_sent_at);
});
