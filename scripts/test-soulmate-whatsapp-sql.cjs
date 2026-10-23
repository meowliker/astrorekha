// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite install.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table soulmate_orders(id text primary key, funnel text, catalog_version integer, payment_status text,
      payment_mode text, review_status text, answer_revision integer, scheduled_send_at timestamptz,
      paid_at timestamptz, attribution jsonb, entitlements jsonb, answers jsonb);
    insert into soulmate_orders values('sm_fixture','soulmate_standalone',2,'paid','live','approved',1,
      now()-interval '1 hour',now()-interval '9 hours','{"trackingEnvironment":"production"}',
      '{"required_assets":["sketch","description","timeline"]}','{}');`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261023120000_soulmate_whatsapp_delivery.sql'), 'utf8'));
  await db.exec(`create table soulmate_order_invoices(order_id text,source text,storage_path text);
    insert into soulmate_order_invoices values('sm_fixture','purchase','sm_fixture/invoice.pdf');`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261023133000_soulmate_whatsapp_invoice_timing.sql'), 'utf8'));
  const claim = async (kind, revision = 1) => (await db.query(`select claim_soulmate_whatsapp_message('sm_fixture',$1,$2,'00000000-0000-4000-8000-000000000001') result`, [kind, revision])).rows[0].result;
  const due = async (start = '2000-01-01T00:00:00Z') => (await db.query('select * from due_soulmate_whatsapp_jobs($1)', [start])).rows;
  assert.equal((await due()).length, 1);
  assert.equal((await due('2099-01-01T00:00:00Z')).length, 0, 'no historical backfill');
  assert.equal(await claim('sketch'), 'blocked');
  assert.equal(await claim('invoice', 2), 'blocked', 'stale revision');
  assert.equal(await claim('invoice'), 'claimed');
  assert.equal(await claim('invoice'), 'blocked', 'interrupted sends cannot retry');
  assert.equal((await due()).length, 0, 'in-progress orders excluded');
  await db.exec(`update soulmate_orders set answer_revision=2 where id='sm_fixture'; update soulmate_orders set answer_revision=1 where id='sm_fixture'`);
  for (const [i, kind] of ['invoice','sketch','description','timeline'].entries()) {
    if (i) { assert.equal(await claim(kind), 'claimed'); await assert.rejects(db.exec(`update soulmate_orders set answer_revision=2 where id='sm_fixture'`), /WhatsApp report delivery has already started/); }
    await db.query(`update soulmate_whatsapp_deliveries set status='accepted' where order_id='sm_fixture' and kind=$1`, [kind]);
    assert.equal(await claim(kind), 'accepted');
    assert.equal((await due()).length, i === 3 ? 0 : 1);
  }
  await db.exec(`insert into soulmate_orders select 'sm_standard',funnel,catalog_version,payment_status,payment_mode,
    review_status,answer_revision,scheduled_send_at,paid_at,attribution,'{"required_assets":["sketch"]}',answers from soulmate_orders where id='sm_fixture'`);
  await db.exec(`insert into soulmate_order_invoices values('sm_standard','purchase','sm_standard/invoice.pdf')`);
  assert.equal((await db.query(`select claim_soulmate_whatsapp_message('sm_standard','timeline',1,gen_random_uuid()) result`)).rows[0].result, 'blocked');
  for (const mutation of [`payment_status='failed'`, `payment_mode='test'`, `attribution='{"trackingEnvironment":"local"}'`]) {
    await db.exec('begin');
    await db.exec(`update soulmate_orders set ${mutation} where id='sm_standard'`);
    assert.equal((await due()).length, 0);
    await db.exec('rollback');
  }
  // Invoice is immediate, reports are gated, and invoice acceptance survives answer revisions.
  await db.exec(`update soulmate_orders set review_status='pending',scheduled_send_at=now()+interval '8 hours' where id='sm_standard'`);
  assert.equal((await due())[0].phase, 'invoice');
  assert.equal((await db.query(`select claim_soulmate_whatsapp_message('sm_standard','invoice',1,gen_random_uuid()) result`)).rows[0].result,'claimed');
  await db.exec(`update soulmate_whatsapp_deliveries set status='accepted' where order_id='sm_standard'; update soulmate_orders set answer_revision=2 where id='sm_standard'`);
  assert.equal((await due()).length,0,'no reports before approval or due time');
  assert.equal((await db.query(`select claim_soulmate_whatsapp_message('sm_standard','sketch',2,gen_random_uuid()) result`)).rows[0].result,'blocked');
  await db.exec(`update soulmate_orders set review_status='approved',scheduled_send_at=now()-interval '1 minute' where id='sm_standard'`);
  assert.equal((await due())[0].phase,'reports');
  assert.equal((await db.query(`select claim_soulmate_whatsapp_message('sm_standard','invoice',2,gen_random_uuid()) result`)).rows[0].result,'accepted');
  assert.equal((await db.query(`select claim_soulmate_whatsapp_message('sm_standard','sketch',2,gen_random_uuid()) result`)).rows[0].result,'claimed');
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from soulmate_whatsapp_deliveries'), /permission denied/);
  await assert.rejects(db.query(`select * from due_soulmate_whatsapp_jobs(now())`), /permission denied/);
  await db.close();
  console.log('PostgreSQL migration, sequence, dedupe, revision locks, eligibility and permissions passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
