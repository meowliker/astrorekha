// Run with: node --test scripts/test-profit-spend-breakdown.cjs
// Executes the actual route and time-window helpers with isolated DB/Meta fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadTS(file, requireModule, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: requireModule, console, URL, Date, Intl, Map,
    process: { env: {} }, AbortSignal, ...globals }, { filename: file });
  return exports;
}

const helpers = loadTS('src/lib/meta-ad-accounts.ts', require);
const financeEvents = loadTS('src/lib/finance-events.ts', require);
const defaultAccounts = [
  { accountId: 'usd', label: 'USD account', accessToken: 'secret-usd', startDate: '2026-09-07', startTime: '13:00', active: true },
  { accountId: 'inr', label: 'INR account', accessToken: 'secret-inr', startDate: '2026-09-01', startTime: '11:30', active: true },
  { accountId: 'future', label: 'Future account', accessToken: 'secret-future', startDate: '2026-09-08', startTime: '11:30', active: true },
];

function fixture(options = {}) {
  const requests = [];
  const storedRows = options.savedRows ? [...options.savedRows] : [];
  const now = new Date(options.now || '2026-09-07T10:00:00Z').getTime();
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const db = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        gte() { return query; }, lte() { return query; }, order() { return query; },
        upsert(rows) {
          if (table === 'profit_sheet_calendar' || table === 'profit_sheet') storedRows.push(...rows);
          return { error: null };
        },
        then(resolve) { resolve({ data: storedRows, error: null }); },
        async single() { assert.equal(table, 'admin_sessions'); return { data: { expires_at: options.expired ? '2020-01-01' : '2099-01-01' } }; },
        async maybeSingle() {
          if (table === 'settings') return { data: { value: { accounts: options.accounts || defaultAccounts } } };
          assert.equal(table, options.dayMode === 'calendar_ist' ? 'profit_sheet_calendar' : 'profit_sheet');
          return { data: { exchange_rate: 100 } };
        },
      };
      return query;
    },
  };
  const fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    const id = url.pathname.split('/')[2].replace('act_', '');
    assert.notEqual(id, 'future');
    if (options.fail && id === 'inr') return { ok: false, json: async () => ({ error: { message: 'Token failed' } }) };
    if (options.permissionDenied && id === 'inr') return { ok: false, json: async () => ({ error: { code: 200, message: 'Ad account owner has NOT grant ads_read permission' } }) };
    if (!url.pathname.endsWith('/insights')) return { ok: true, json: async () => ({ name: id, currency: id === 'inr' ? 'INR' : 'USD', timezone_offset_hours_utc: id === 'inr' ? 5.5 : -6 }) };
    const hourly = url.searchParams.has('breakdowns');
    const rows = options.zero ? [] : hourly
      ? (options.hourlyByAccount?.[id] || (id === 'inr' ? [[11, 200], [12, 300]] : [[0, 5], [1, 10], [2, 20]])).map(([hour, spend]) => ({
        date_start: '2026-09-07', spend: String(spend), hourly_stats_aggregated_by_advertiser_time_zone: `${String(hour).padStart(2, '0')}:00:00 - ${String(hour).padStart(2, '0')}:59:59`,
      }))
      : [{ date_start: '2026-09-07', spend: String(options.dailyByAccount?.[id] ?? (id === 'inr' ? 500 : 35)) }];
    return { ok: true, json: async () => ({ data: rows, ...(options.paginated && hourly ? { paging: { next: 'more' } } : {}) }) };
  };
  const route = loadTS('src/app/api/admin/profit-sheet/route.ts', (name) => {
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name === '@/lib/meta-ad-accounts') return helpers;
    if (name === '@/lib/finance-events') return financeEvents;
    if (name === '@/lib/payu-api') return { getPayUTransactions: async () => options.payuTransactions || [] };
    return require(name);
  }, { Date: FixedDate, fetch, console: { ...console, error() {} } });
  return { requests, storedRows, get: async (query = 'token=test&breakdownDate=2026-09-07') => {
    const response = await route.GET({ url: `http://localhost/api/admin/profit-sheet?${query}` });
    return { status: response.status, body: await response.json() };
  } };
}

test('requires admin auth and rejects invalid dates before calling Meta', async () => {
  for (const [options, query, status] of [
    [{}, 'breakdownDate=2026-09-07', 401],
    [{ expired: true }, 'token=test&breakdownDate=2026-09-07', 401],
    [{}, 'token=test&breakdownDate=2026-02-31', 400],
    [{}, 'token=test&breakdownDate=2099-01-01', 400],
  ]) {
    const f = fixture(options); assert.equal((await f.get(query)).status, status); assert.equal(f.requests.length, 0);
  }
});

test('splits mixed currency accounts at business/start boundaries and remains read-only even with sync parameter', async () => {
  const f = fixture();
  const { status, body } = await f.get('token=test&breakdownDate=2026-09-07&sync=range');
  assert.equal(status, 200);
  assert.equal(body.accounts.length, 2);
  assert.equal(body.accounts[0].spend, 25); // 50% of $10 + $20 after 1 PM IST
  assert.equal(body.accounts[1].spend, 400); // 50% of ₹200 + ₹300 after 11:30 IST
  assert.equal(body.totalINR, 2900);
  assert.equal(body.totalUSD, 29);
  assert.equal(body.exchangeRate, 100);
  assert.equal(body.accounts.reduce((sum, account) => sum + account.inr, 0), body.totalINR);
  assert.equal(JSON.stringify(body).includes('secret-'), false);
});

test('calendar sheet clips account start times and splits Costa Rica hours at midnight IST', async () => {
  const f = fixture({
    dayMode: 'calendar_ist',
    now: '2026-09-08T09:00:00Z',
    accounts: [
      { accountId: 'usd', label: 'Costa Rica account', accessToken: 'secret-usd', startDate: '2026-09-07', startTime: '00:00', active: true },
      { accountId: 'inr', label: 'IST account', accessToken: 'secret-inr', startDate: '2026-09-07', startTime: '13:30', active: true },
    ],
    hourlyByAccount: {
      usd: [[11, 10], [12, 20], [13, 30]],
      inr: [[13, 10], [14, 20]],
    },
    dailyByAccount: { usd: 60, inr: 30 },
  });
  const { status, body } = await f.get('token=test&breakdownDate=2026-09-07&dayMode=calendar_ist');
  assert.equal(status, 200);
  assert.equal(body.dayMode, 'calendar_ist');
  assert.equal(body.accounts.length, 2);
  assert.equal(body.accounts.find((account) => account.accountId === 'usd').spend, 20); // 22:30 hour + half of 23:30 hour
  assert.equal(body.accounts.find((account) => account.accountId === 'inr').spend, 25); // half of 13:00 hour + 14:00 hour
  assert.equal(body.totalINR, 2025);
  assert.equal(body.totalUSD, 20.25);
});

test('calendar sheet uses aligned IST daily totals once for a full day', async () => {
  const f = fixture({
    dayMode: 'calendar_ist',
    now: '2026-09-08T09:00:00Z',
    accounts: [{ accountId: 'inr', label: 'IST account', accessToken: 'secret-inr', startDate: '2026-09-07', startTime: '00:00', active: true }],
  });
  const { status, body } = await f.get('token=test&breakdownDate=2026-09-07&dayMode=calendar_ist');
  assert.equal(status, 200);
  assert.equal(body.accounts.length, 1);
  assert.equal(body.accounts[0].inr, 500);
  assert.equal(body.totalINR, 500);
});

test('calendar sync stores midnight-window PayU revenue in its own ledger', async () => {
  const f = fixture({
    dayMode: 'calendar_ist',
    now: '2026-09-08T09:00:00Z',
    accounts: [],
    payuTransactions: [
      { txnid: 'morning', status: 'success', amount: '100', addedon: '2026-09-07 10:00:00', udf2: 'bundle' },
      { txnid: 'afternoon', status: 'success', amount: '200', addedon: '2026-09-07 12:00:00', udf2: 'bundle' },
      { txnid: 'next-midnight', status: 'success', amount: '300', addedon: '2026-09-08 00:10:00', udf2: 'bundle' },
    ],
  });
  const { status, body } = await f.get('token=test&startDate=2026-09-07&endDate=2026-09-07&dayMode=calendar_ist&sync=range&exchangeRate=100');
  assert.equal(status, 200);
  assert.equal(body.dayMode, 'calendar_ist');
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0].revenue, 300);
  assert.equal(body.rows[0].transactionCount, 2);
  assert.equal(body.rows[0].bundleRevenue, 300);
  assert.equal(f.storedRows.length, 1);
  assert.equal(f.storedRows[0].date, '2026-09-07');
  assert.equal(f.storedRows[0].revenue, 300);
});

test('calendar reads saved rows and identifies missing dates without a sync', async () => {
  const f = fixture({
    dayMode: 'calendar_ist',
    savedRows: [
      { date: '2026-09-05', day: 'Sat', revenue: 100 },
      { date: '2026-09-07', day: 'Mon', revenue: 200 },
    ],
  });
  const { status, body } = await f.get('token=test&startDate=2026-09-05&endDate=2026-09-07&dayMode=calendar_ist&exchangeRate=100');
  assert.equal(status, 200);
  assert.equal(body.rows.length, 2);
  assert.equal(body.missingRanges.length, 1);
  assert.equal(body.missingRanges[0].startDate, '2026-09-06');
  assert.equal(body.missingRanges[0].endDate, '2026-09-06');
  assert.equal(body.missingRanges[0].days, 1);
  assert.equal(f.requests.length, 0);
});

test('aligned full-day daily totals are not counted twice with hourly data', async () => {
  const f = fixture({ accounts: [{ ...defaultAccounts[0], startTime: '11:30' }] });
  const { body } = await f.get(); assert.equal(body.totalUSD, 35); assert.equal(body.accounts[0].usd, 35);
});

test('current partial hour does not leak spend before configured start', async () => {
  const f = fixture({ accounts: [defaultAccounts[0]], now: '2026-09-07T07:15:00Z' }); // 12:45 IST
  const { body } = await f.get(); assert.equal(body.totalUSD, 0);
});

test('zero spend is returned as zero for configured accounts', async () => {
  const { status, body } = await fixture({ zero: true }).get();
  assert.equal(status, 200); assert.equal(body.totalINR, 0); assert.equal(body.accounts.length, 2);
});

test('missing access, failed requests and pagination cannot masquerade as a complete total', async () => {
  for (const options of [{ fail: true }, { paginated: true }, { accounts: [{ ...defaultAccounts[0], accessToken: '' }] }]) {
    const { status, body } = await fixture(options).get();
    assert.equal(status, 500); assert.ok(body.error); assert.equal(body.accounts, undefined);
  }
});

test('Meta read permission failure identifies the blocked account', async () => {
  const { status, body } = await fixture({ permissionDenied: true }).get();
  assert.equal(status, 500);
  assert.match(body.error, /Meta denied ads_read access to INR account/);
});
