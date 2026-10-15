/* Local worker: keep running alongside Next.js for local paid-order tests. */
const path = require('node:path');
const Module = require('node:module');
require('dotenv').config({ path: path.join(__dirname, '../.env.local'), quiet: true });
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { retrySoulmateConfirmations } = require('../src/lib/soulmate-invoice');
const { runSoulmateFulfillment } = require('../src/lib/soulmate-fulfillment');
const { getSupabaseAdmin } = require('../src/lib/supabase-admin');
const { reconcileSoulmateOrder, payuConfig } = require('../src/lib/soulmate-payu');
let stopped = false;
let lastReconcile = 0;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
async function tick() {
  if (Date.now() - lastReconcile > 15 * 60000) {
    const { mode } = payuConfig();
    const { data, error } = await getSupabaseAdmin().from('soulmate_orders').select('*')
      .eq('payment_mode', mode).in('payment_status', ['created', 'pending', 'failed'])
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('last_verified_at', { ascending: true, nullsFirst: true }).limit(12);
    if (error) throw new Error('Unable to reconcile local payments');
    for (let i = 0; i < data.length; i += 3) {
      const results = await Promise.allSettled(data.slice(i, i + 3).map(reconcileSoulmateOrder));
      if (results.some(r => r.status === 'rejected')) console.error('Some payment checks failed; will retry next reconciliation.');
    }
    lastReconcile = Date.now();
  }
  await retrySoulmateConfirmations();
  const result = await runSoulmateFulfillment();
  console.log(new Date().toISOString(), JSON.stringify(result));
}
(async () => {
  do {
    try { await tick(); } catch { console.error('Delivery worker tick failed; check configuration, connectivity and saved job errors.'); if (process.argv.includes('--once')) process.exitCode = 1; }
    if (process.argv.includes('--once') || stopped) break;
    await new Promise(resolve => setTimeout(resolve, 60000));
  } while (!stopped);
})();
