const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const crypto = require('node:crypto');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { dispatchSoulmateWhatsApp, prepareSoulmateWhatsApp, soulmateWhatsAppKinds, soulmateWhatsAppPhone, runSoulmateWhatsApp } = require('../src/lib/soulmate-whatsapp');
let order, invoice, assets, files, calls, state, ledger;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
beforeEach(() => {
  process.env.AISENSY_API_KEY = 'fixture'; delete process.env.SOULMATE_WHATSAPP_ENABLED;
  order = { id: 'sm_fixture', customer_name: 'Anay Example', customer_phone: '919131695346', answer_revision: 1,
    catalog_version: 2, funnel: 'soulmate_standalone', payment_status: 'paid', review_status: 'approved',
    amount: 223964, scheduled_send_at: new Date(Date.now() - 1000).toISOString(),
    entitlements: { sketch: 'colour', description: true, timeline: true, required_assets: ['sketch', 'description', 'timeline'] } };
  files = {}; assets = []; calls = []; state = {};
  for (const kind of ['invoice', 'sketch', 'description', 'timeline']) {
    const bytes = Buffer.from(`%PDF-${kind}`), storage_path = `${order.id}/${kind}.pdf`;
    files[storage_path] = bytes;
    const asset = { kind, storage_path, filename: `${kind}.pdf`, sha256: sha(bytes), size_bytes: bytes.length };
    if (kind === 'invoice') invoice = { ...asset, pdf_sha256: asset.sha256, invoice_number: 'ARS-26-0000009', snapshot: { orderId: order.id, total: order.amount } };
    else assets.push(asset);
  }
  ledger = {
    async claim(kind) { if (state[kind] === 'accepted') return 'accepted'; if (state[kind]) return 'blocked'; state[kind] = 'submitting'; return 'claimed'; },
    async accepted(kind) { state[kind] = 'accepted'; }, async uncertain(kind) { state[kind] = 'needs_review'; },
  };
  global.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return Response.json({ success: true, messageId: `id-${calls.length}` }); };
});
const db = {
  from(table) {
    const q = { select() { return q; }, eq() { return q; }, single() { return q; }, then(ok, bad) {
      return Promise.resolve({ data: table === 'soulmate_orders' ? order : table === 'soulmate_order_invoices' ? invoice : assets, error: null }).then(ok, bad);
    } }; return q;
  }, storage: { from(bucket) { assert.equal(bucket, 'soulmate-sketches-private'); return {
    async download(path) { return { data: files[path] ? new Blob([files[path]]) : null }; },
    async createSignedUrl(path, expiry) { assert.equal(expiry, 86400); return { data: { signedUrl: `https://storage.example/${path}?token=fixture` } }; },
  }; } },
};
test('invoice first, exactly four accepted messages and correct template parameters', async () => {
  const prepared = await prepareSoulmateWhatsApp(db, order.id);
  const result = await dispatchSoulmateWhatsApp(prepared.order, prepared.documents, ledger);
  assert.deepEqual(result.map(r => r.kind), ['invoice', 'sketch', 'description', 'timeline']);
  assert.equal(calls[0].campaignName, 'soulmate_invoice_delivery_api');
  assert.deepEqual(calls[0].templateParams, ['Anay', order.id, 'ARS-26-0000009', '2,239.64']);
  assert.equal(calls[1].campaignName, 'soulmate_report_delivery_api');
  assert.equal(calls[1].templateParams[1], 'Soulmate Sketch');
  assert.ok(calls.every(c => c.destination === '919131695346' && c.templateParams.length === 4));
});
test('all purchased combinations send only invoice plus purchased files', async () => {
  for (const description of [false, true]) for (const timeline of [false, true]) {
    order.entitlements = { ...order.entitlements, description, timeline, required_assets: ['sketch', ...(description ? ['description'] : []), ...(timeline ? ['timeline'] : [])] };
    const { documents } = await prepareSoulmateWhatsApp(db, order.id);
    assert.deepEqual(documents.map(d => d.kind), ['invoice', ...order.entitlements.required_assets]);
  }
});
test('accepted messages never resend on rerun', async () => {
  const { documents } = await prepareSoulmateWhatsApp(db, order.id);
  await dispatchSoulmateWhatsApp(order, documents, ledger);
  await dispatchSoulmateWhatsApp(order, documents, ledger);
  assert.equal(calls.length, 4);
});
test('invoice rejection stops all reports and cannot blindly retry', async () => {
  global.fetch = async () => { calls.push('rejected'); return Response.json({ success: false }); };
  const { documents } = await prepareSoulmateWhatsApp(db, order.id);
  await assert.rejects(dispatchSoulmateWhatsApp(order, documents, ledger), /invoice submission/);
  await assert.rejects(dispatchSoulmateWhatsApp(order, documents, ledger), /already in progress/);
  assert.equal(calls.length, 1); assert.equal(state.invoice, 'needs_review');
});
test('ambiguous second send preserves invoice acceptance and stops later reports', async () => {
  const first = global.fetch;
  global.fetch = async (...args) => { if (calls.length) throw new Error('timeout'); return first(...args); };
  const { documents } = await prepareSoulmateWhatsApp(db, order.id);
  await assert.rejects(dispatchSoulmateWhatsApp(order, documents, ledger), /sketch submission/);
  assert.equal(state.invoice, 'accepted'); assert.equal(state.sketch, 'needs_review'); assert.equal(state.description, undefined);
});
test('overlapping dispatches claim each document once', async () => {
  const { documents } = await prepareSoulmateWhatsApp(db, order.id);
  await Promise.allSettled([dispatchSoulmateWhatsApp(order, documents, ledger), dispatchSoulmateWhatsApp(order, documents, ledger)]);
  assert.equal(calls.length, 4);
});
test('wrong order file and corrupted PDF fail before any submission', async () => {
  assets[0].storage_path = 'another_order/sketch.pdf';
  await assert.rejects(prepareSoulmateWhatsApp(db, order.id), /Missing sketch/);
  assets[0].storage_path = `${order.id}/sketch.pdf`; files[assets[0].storage_path] = Buffer.from('bad');
  await assert.rejects(prepareSoulmateWhatsApp(db, order.id), /integrity/); assert.equal(calls.length, 0);
});
test('missing purchased report blocks the entire batch before invoice submission', async () => {
  assets = assets.filter(a => a.kind !== 'timeline');
  await assert.rejects(prepareSoulmateWhatsApp(db, order.id), /Missing timeline/); assert.equal(calls.length, 0);
});
test('unpaid, unapproved, wrong funnel, early delivery and invoice mismatch are rejected', async () => {
  for (const [field, value] of [['payment_status', 'failed'], ['review_status', 'pending'], ['funnel', 'normal'], ['scheduled_send_at', new Date(Date.now() + 60000).toISOString()]]) {
    const old = order[field]; order[field] = value;
    await assert.rejects(prepareSoulmateWhatsApp(db, order.id)); order[field] = old;
  }
  invoice.snapshot.total = 1; await assert.rejects(prepareSoulmateWhatsApp(db, order.id), /mismatched/);
});
test('rejects reordered documents, inconsistent entitlements and invalid phone', async () => {
  const { documents } = await prepareSoulmateWhatsApp(db, order.id);
  await assert.rejects(dispatchSoulmateWhatsApp(order, documents.reverse(), ledger), /Invoice-first/);
  assert.throws(() => soulmateWhatsAppKinds({ ...order.entitlements, required_assets: ['sketch'] }));
  assert.equal(soulmateWhatsAppPhone('+91 9131695346'), '919131695346');
  assert.throws(() => soulmateWhatsAppPhone('12345')); assert.equal(calls.length, 0);
});
test('automatic worker remains disabled and requires launch cutoff when enabled', async () => {
  assert.equal((await runSoulmateWhatsApp()).disabled, true);
  process.env.SOULMATE_WHATSAPP_ENABLED = 'true'; delete process.env.SOULMATE_WHATSAPP_START_AT;
  await assert.rejects(runSoulmateWhatsApp(), /launch date/); assert.equal(calls.length, 0);
});

test('immediate invoice sends without approval, report files or report due time; reports still wait', async () => {
  order.review_status = 'pending'; order.scheduled_send_at = new Date(Date.now()+8*3600000).toISOString(); assets = [];
  const { documents } = await prepareSoulmateWhatsApp(db, order.id, 'invoice');
  await dispatchSoulmateWhatsApp(order, documents, ledger, 'invoice');
  assert.equal(calls.length, 1); assert.equal(calls[0].campaignName, 'soulmate_invoice_delivery_api');
  await assert.rejects(prepareSoulmateWhatsApp(db, order.id, 'reports'));
  await dispatchSoulmateWhatsApp(order, documents, ledger, 'invoice');
  assert.equal(calls.length, 1, 'invoice does not resend');
  order.payment_status = 'failed'; await assert.rejects(prepareSoulmateWhatsApp(db, order.id, 'invoice'));
});
test('immediate confirmation eligibility excludes old, local, preview and test orders', () => {
  const { soulmateWhatsAppEligible } = require('../src/lib/soulmate-whatsapp');
  process.env.SOULMATE_WHATSAPP_ENABLED = 'true'; process.env.SOULMATE_WHATSAPP_START_AT = '2026-10-23T07:12:30Z';
  const eligible = { paid_at:'2026-10-23T07:12:30Z', payment_mode:'live', attribution:{trackingEnvironment:'production'} };
  assert.equal(soulmateWhatsAppEligible(eligible),true);
  for (const override of [{paid_at:'2026-10-23T07:12:29Z'}, {paid_at:null}, {payment_mode:'test'}, {attribution:{trackingEnvironment:'local'}}, {attribution:{trackingEnvironment:'preview'}}])
    assert.equal(soulmateWhatsAppEligible({...eligible,...override}),false);
  delete process.env.SOULMATE_WHATSAPP_START_AT; assert.equal(soulmateWhatsAppEligible(eligible),false);
});
test('dashboard never calls an accepted submission sent or delivered', () => {
  const { soulmateWhatsAppStatus: status } = require('../src/lib/soulmate-whatsapp-status');
  assert.equal(status({status:'accepted'},true,true,null,'sketch'),'Accepted by AiSensy');
  assert.equal(status(undefined,false,true,null,'sketch'),'Not enrolled for automatic WhatsApp');
  assert.equal(status(undefined,true,false,null,'invoice'),'Queued after payment');
  assert.equal(status(undefined,true,false,null,'sketch'),'Awaiting report preparation');
  assert.equal(status(undefined,true,true,'2099-01-01','sketch'),'Scheduled');
  assert.match(status({status:'submitting',submitted_at:'2000-01-01'},true,true,null,'invoice'),/unconfirmed/);
});
