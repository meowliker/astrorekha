/* Offline checks: no credentials loaded and no network/database calls allowed. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
const dbPath = require.resolve('../src/lib/supabase-admin');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getSupabaseAdmin() { throw new Error('Disabled automation must not access the database'); },
} };
global.fetch = async () => { throw new Error('Disabled automation must not call providers'); };
const { NextRequest } = require('next/server');
const { runAutomaticSoulmateReports } = require('../src/lib/us-soulmate-report-worker');
const { runSoulmateFulfillment } = require('../src/lib/us-soulmate-fulfillment');
const reports = require('../src/app/api/cron/prepare-us-soulmate-reports/route');
const delivery = require('../src/app/api/cron/fulfill-us-soulmate-orders/route');

test('credentials and obsolete enable envs cannot activate US automation', async () => {
  process.env.VERCEL_ENV = 'production';
  process.env.US_SOULMATE_AUTO_REPORTS_ENABLED = 'true';
  process.env.US_SOULMATE_DELIVERY_ENABLED = 'true';
  process.env.US_SOULMATE_KIE_API_KEY = 'fixture';
  process.env.US_SOULMATE_ANTHROPIC_API_KEY = 'fixture';
  process.env.BREVO_API_KEY = 'fixture';
  assert.deepEqual(await runAutomaticSoulmateReports(), { enabled: false, processed: 0 });
  assert.deepEqual(await runSoulmateFulfillment(), { enabled: false, processed: 0 });
});
test('US worker endpoints authenticate with the existing shared cron secret', async () => {
  process.env.CRON_SECRET = 'shared-fixture';
  process.env.US_SOULMATE_CRON_SECRET = 'obsolete-fixture';
  for (const route of [reports, delivery]) {
    const request = token => new NextRequest('https://example.com/api/cron/us-fixture', { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await route.GET(request('obsolete-fixture'))).status, 401);
    const response = await route.GET(request('shared-fixture'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { enabled: false, processed: 0 });
  }
});
