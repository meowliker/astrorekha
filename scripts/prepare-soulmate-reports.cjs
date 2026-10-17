#!/usr/bin/env node
// Manual setup runner. Default: READ-ONLY plan. No checkout/cron imports this script.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createClient } = require('@supabase/supabase-js');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { initialPreparation, advanceReportPreparation } = require('../src/lib/soulmate-report-preparation');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };

(async () => {
  if (args.includes('--help')) { console.log('node scripts/prepare-soulmate-reports.cjs --order sm_<id> [--env-file .env.local] [--execute]\nDefault is a read-only plan. --execute advances ONE preparation stage into private local output. It never attaches, approves, schedules or emails.'); return; }
  const orderId = option('--order');
  if (!/^sm_[a-f0-9]{20}$/.test(orderId || '')) throw Error('Supply one valid --order ID');
  require('dotenv').config({ path: option('--env-file') || '.env.local' });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) } });
  async function currentOrder() {
    const order = await db.from('soulmate_orders').select('id,catalog_version,payment_status,review_status,answer_revision,answers,entitlements,scheduled_send_at,fulfillment_status').eq('id', orderId).single();
    if (order.error) throw Error('Unable to read Soulmate order');
    const email = await db.from('soulmate_email_deliveries').select('status,provider_message_id').eq('order_id', orderId).single();
    if (email.error || email.data.status !== 'pending' || email.data.provider_message_id) throw Error('Delivery is no longer awaiting preparation');
    return order.data;
  }
  const order = await currentOrder();
  const initial = initialPreparation(order);
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'plan-only', automatic: false, orderId, answerRevision: initial.plan.answerRevision,
      sketch: order.entitlements.sketch, description: initial.plan.description,
      blockedAssets: initial.plan.blockedAssets, providerCalls: 0, writes: 0 }, null, 2));
    return;
  }
  process.umask(0o077);
  const dir = path.join(__dirname, '../output/soulmate-preparation', orderId, `revision-${order.answer_revision}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, '.lock');
  const fd = fs.openSync(lock, 'wx', 0o600); // No concurrent submissions; stale locks require operator inspection.
  const statePath = path.join(dir, 'state.json');
  function atomic(file, value) { const temp = `${file}.tmp`; fs.writeFileSync(temp, value, { mode: 0o600 }); fs.renameSync(temp, file); }
  try {
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : initial;
    const result = await advanceReportPreparation(state, {
      currentOrder,
      checkpoint: async (value) => atomic(statePath, JSON.stringify(value, null, 2)),
      saveAsset: async (asset, bytes) => atomic(path.join(dir, asset.filename), bytes),
    }, { execute: true });
    console.log(JSON.stringify({ orderId, stage: result.stage, blockedAssets: result.plan.blockedAssets, reviewRequired: true,
      attached: false, approved: false, emailed: false, output: dir }, null, 2));
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
