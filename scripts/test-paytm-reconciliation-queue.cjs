const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
const stub = (file, exports) => {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
const MINUTE = 60_000, HOUR = 60 * MINUTE;
const NOW = Date.parse('2026-11-03T07:30:00Z');
const iso = ago => new Date(NOW - ago).toISOString();
let rows, calls, failQuery, runCheck;

// Interpret the logical filters actually emitted by the Supabase query builder.
function split(value) {
  const parts = []; let start = 0, depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start)); return parts;
}
function matches(row, expression) {
  for (const operator of ['or', 'and']) {
    if (expression.startsWith(operator + '(')) {
      const parts = split(expression.slice(operator.length + 1, -1));
      return operator === 'or' ? parts.some(part => matches(row, part)) : parts.every(part => matches(row, part));
    }
  }
  const [, key, operator, value] = expression.match(/^([a-z_]+)\.([a-z]+)\.(.*)$/) || [];
  assert.ok(key, 'Recognized database filter: ' + expression);
  if (operator === 'is') return row[key] == null && value === 'null';
  if (operator === 'eq') return row[key] === value;
  if (operator === 'in') return split(value.slice(1, -1)).includes(row[key]);
  if (row[key] == null) return false;
  if (operator === 'lt') return Date.parse(row[key]) < Date.parse(value);
  if (operator === 'lte') return Date.parse(row[key]) <= Date.parse(value);
  throw Error('Unhandled filter ' + expression);
}
const db = {
  from(table) {
    const filters = [], sorts = []; let limit = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      is(key, value) { filters.push(row => value === null && row[key] == null); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      gte(key, value) { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return query; },
      lt(key, value) { filters.push(row => Date.parse(row[key]) < Date.parse(value)); return query; },
      or(expression) { filters.push(row => split(expression).some(part => matches(row, part))); return query; },
      order(key, options) { sorts.push({ key, ...options }); return query; },
      limit(value) { limit = value; return query; },
      then(ok, bad) {
        if (failQuery) return Promise.resolve({ data: null, error: Error('DB unavailable') }).then(ok, bad);
        const data = rows.filter(row => row.table === table && filters.every(filter => filter(row))).sort((a, b) => {
          for (const sort of sorts) {
            if (a[sort.key] === b[sort.key]) continue;
            if (a[sort.key] == null) return sort.nullsFirst ? -1 : 1;
            if (b[sort.key] == null) return sort.nullsFirst ? 1 : -1;
            return (a[sort.key] < b[sort.key] ? -1 : 1) * (sort.ascending ? 1 : -1);
          }
          return 0;
        }).slice(0, limit).map(({ id }) => ({ id }));
        return Promise.resolve({ data, error: null }).then(ok, bad);
      },
    };
    return query;
  },
};
stub('../src/lib/supabase-admin', { getSupabaseAdmin: () => db });
stub('../src/lib/paytm-api', { paytmConfig: () => ({ mode: 'live' }) });
stub('../src/lib/paytm-reconciliation', { reconcilePaytmOrder: async id => { calls.push(id); return runCheck(id); } });
const { selectPaytmReconciliationCandidates: select } = require('../src/lib/paytm-reconciliation-queue');
const { GET } = require('../src/app/api/cron/reconcile-paytm-payments/route');
const { NextRequest } = require('next/server');
const originalNow = Date.now;
const originalSecret = process.env.CRON_SECRET, originalMid = process.env.PAYTM_MID;
beforeEach(() => {
  rows = []; calls = []; failQuery = false;
  runCheck = async () => ({ payment_status: 'pending' });
  Date.now = () => NOW;
  process.env.CRON_SECRET = 'fixture-secret'; process.env.PAYTM_MID = 'fixture-mid';
});
afterEach(() => {
  Date.now = originalNow;
  for (const [key, value] of [['CRON_SECRET', originalSecret], ['PAYTM_MID', originalMid]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function seed(id, extra = {}) {
  const row = { id, table: 'payments', gateway: 'paytm', payment_mode: 'live', payment_status: 'pending',
    created_at: iso(10 * MINUTE), gateway_checked_at: null, last_verified_at: null, gateway_check_until: null, ...extra };
  rows.push(row); return row;
}
function request(authorized = true) {
  return new NextRequest('https://astrorekha.com/api/cron/reconcile-paytm-payments', {
    headers: authorized ? { authorization: 'Bearer fixture-secret' } : {},
  });
}
test('a 500-order historical failure backlog cannot displace fresh regular or Soulmate payments', async () => {
  for (let i = 0; i < 500; i++) seed('failed-' + i, { payment_status: 'failed', created_at: iso(2 * 24 * HOUR) });
  seed('new-report'); seed('new-soulmate', { table: 'soulmate_orders' });
  const selected = await select(db, 'live', new Date(NOW));
  assert.deepEqual(selected.slice(0, 2), [{ id: 'new-report', lane: 'recent' }, { id: 'new-soulmate', lane: 'recent' }]);
  assert.equal(selected.filter(row => row.lane === 'recovery').length, 4);
  assert.equal(new Set(selected.map(row => row.id)).size, selected.length);
});
test('full lanes reserve room for paid access recovery, both funnels and older verification', async () => {
  seed('paid-unfulfilled', { payment_status: 'paid', created_at: iso(3 * 24 * HOUR) });
  seed('paid-complete', { payment_status: 'paid', fulfilled_at: iso(MINUTE) });
  for (const table of ['payments', 'soulmate_orders']) {
    for (let i = 0; i < 50; i++) {
      seed(table + '-fresh-' + i, { table });
      seed(table + '-aging-' + i, { table, created_at: iso(3 * HOUR) });
      seed(table + '-failed-' + i, { table, payment_status: 'failed' });
    }
  }
  const selected = await select(db, 'live', new Date(NOW));
  assert.equal(selected[0].id, 'paid-unfulfilled');
  assert.equal(selected.some(row => row.id === 'paid-complete'), false);
  assert.deepEqual(Object.fromEntries(['fulfillment', 'recent', 'aging', 'recovery'].map(lane =>
    [lane, selected.filter(row => row.lane === lane).length])), { fulfillment: 1, recent: 36, aging: 9, recovery: 6 });
  assert.ok(selected.slice(0, 7).some(row => row.lane === 'aging'));
  assert.ok(selected.slice(0, 7).some(row => row.lane === 'recovery'));
  assert.equal(new Set(selected.map(row => row.id)).size, selected.length);
});
test('polling backoff, active leases, environment and gateway isolation are enforced before limiting', async () => {
  seed('recently-checked', { gateway_checked_at: iso(30_000) });
  seed('leased', { gateway_check_until: iso(-30_000) });
  seed('aging-too-soon', { created_at: iso(3 * HOUR), gateway_checked_at: iso(10 * MINUTE) });
  seed('failed-too-soon', { payment_status: 'failed', gateway_checked_at: iso(5 * HOUR) });
  seed('other-gateway', { gateway: 'payu' }); seed('other-mode', { payment_mode: 'test' });
  seed('expired-lease', { gateway_check_until: iso(MINUTE), gateway_checked_at: iso(2 * MINUTE) });
  seed('soulmate-due', { table: 'soulmate_orders', last_verified_at: iso(2 * MINUTE) });
  seed('soulmate-too-soon', { table: 'soulmate_orders', last_verified_at: iso(30_000) });
  seed('failed-due', { payment_status: 'failed', gateway_checked_at: iso(6 * HOUR) });
  assert.deepEqual(new Set((await select(db, 'live', new Date(NOW))).map(row => row.id)),
    new Set(['expired-lease', 'soulmate-due', 'failed-due']));
});
test('age boundaries are exclusive between lanes, and late successes remain recoverable for 14 days', async () => {
  seed('at-two-hours', { created_at: iso(2 * HOUR) });
  seed('past-two-hours', { created_at: iso(2 * HOUR + 1) });
  seed('at-one-day', { created_at: iso(24 * HOUR) });
  seed('past-one-day', { created_at: iso(24 * HOUR + 1) });
  seed('at-fourteen-days', { created_at: iso(14 * 24 * HOUR) });
  seed('expired', { created_at: iso(14 * 24 * HOUR + 1) });
  const selected = await select(db, 'live', new Date(NOW));
  const lanes = Object.fromEntries(selected.map(row => [row.id, row.lane]));
  assert.deepEqual(lanes, { 'at-two-hours': 'recent', 'at-one-day': 'aging',
    'at-fourteen-days': 'recovery', 'past-two-hours': 'aging', 'past-one-day': 'recovery' });
});
test('least recently checked orders rotate within a lane instead of starving behind newly created orders', async () => {
  for (let i = 0; i < 30; i++) seed('new-' + i, { gateway_checked_at: iso(3 * MINUTE) });
  seed('oldest-check', { gateway_checked_at: iso(20 * MINUTE) });
  const selected = await select(db, 'live', new Date(NOW));
  assert.equal(selected[0].id, 'oldest-check');
  assert.equal(selected.length, 24);
});
test('cron is authorized, uses only the existing reconciler and counts per-order errors without stopping the queue', async () => {
  seed('paid'); seed('failed'); seed('offline');
  assert.equal((await GET(request(false))).status, 401); assert.equal(calls.length, 0);
  runCheck = async id => { if (id === 'offline') throw Error('provider timeout'); return { payment_status: id }; };
  const response = await GET(request()); const result = await response.json();
  assert.equal(response.status, 503); assert.equal(result.scanned, 3); assert.equal(result.errors, 1);
  assert.equal(result.paid, 1); assert.equal(result.deferred, 0); assert.equal(result.lanes.recent, 3);
  assert.deepEqual(new Set(calls), new Set(['paid', 'failed', 'offline']));
});
test('four workers bound concurrency and defer unstarted work after the outage deadline', async () => {
  for (let i = 0; i < 24; i++) seed('pending-' + i);
  let clock = NOW, inFlight = 0, maximum = 0;
  Date.now = () => clock;
  runCheck = async () => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    await new Promise(resolve => setImmediate(resolve));
    clock += 15_000; inFlight--;
    throw Error('timeout');
  };
  const response = await GET(request()); const result = await response.json();
  assert.equal(response.status, 503); assert.equal(maximum, 4);
  assert.ok(result.deferred > 0); assert.equal(result.scanned + result.deferred, 24);
  // Selection and deferral never stamp or change the unstarted orders.
  assert.ok(rows.every(row => row.gateway_checked_at === null && row.payment_status === 'pending'));
});
test('database query errors do not start reconciliation or silently skip a queue lane', async () => {
  seed('new-report'); failQuery = true;
  assert.equal((await GET(request())).status, 503); assert.equal(calls.length, 0);
});
