const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

test('manual and scheduled sheet refreshes stay silent; only the authorized addition cron delivers alerts', async () => {
  const calls = [];
  const db = {};
  const deps = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/admin-access': { withAdminAccess: (handler, permission) => {
      assert.equal(permission, 'administrator'); return handler;
    } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/account-balances': {
      refreshBalances: async (client, scheduled = false) => {
        assert.equal(client, db); calls.push(scheduled ? 'snapshot' : 'refresh'); return { refreshed: true };
      },
      getBalancesView: async () => { calls.push('view'); return { accounts: [] }; },
      checkBalanceAdditions: async () => { calls.push('check'); return { checked: 1, failed: 0 }; },
    },
    '@/lib/account-balances-types': { balanceSchedule: () => ({ key: 'scheduled' }) },
    '@/lib/account-balance-alerts': { deliverBalanceAdditionAlerts: async () => {
      calls.push('deliver'); return { sent: 0 };
    } },
  };
  function route(file) {
    const m = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      assert.ok(name in deps, `Unexpected dependency: ${name}`); return deps[name];
    }, m, m.exports);
    return m.exports;
  }
  const manual = route('src/app/api/admin/account-balances/route.ts');
  const snapshots = route('src/app/api/cron/sync-account-balances/route.ts');
  const additions = route('src/app/api/cron/check-balance-additions/route.ts');
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-only';
  const authorized = { headers: new Headers({ authorization: 'Bearer test-only' }) };
  try {
    assert.equal((await manual.GET()).status, 200);
    assert.equal((await manual.POST({ json: async () => ({ action: 'refresh' }) })).status, 200);
    assert.equal((await manual.POST({ json: async () => ({ action: 'wrong' }) })).status, 400);
    assert.equal((await snapshots.GET(authorized)).status, 200);
    assert.deepEqual(calls, ['view', 'refresh', 'snapshot']);
    assert.equal((await additions.GET({ headers: new Headers() })).status, 401);
    assert.deepEqual(calls, ['view', 'refresh', 'snapshot']);
    assert.equal((await additions.GET(authorized)).status, 200);
    assert.deepEqual(calls, ['view', 'refresh', 'snapshot', 'check', 'deliver']);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
