// Run against isolated PGlite: set PGLITE_PATH to its temporary installation.
const {PGlite}=require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite();await db.exec(`create table monitoring_balance_digests(date date primary key, status text default 'running'); insert into monitoring_balance_digests values('2026-11-18','sent');`);
await db.exec(fs.readFileSync('supabase/migrations/20261119011000_twice_daily_balance_digest.sql','utf8'));
const old=(await db.query('select * from monitoring_balance_digests')).rows[0];assert.equal(old.status,'sent');assert.equal(old.delivery_slot,'evening');
await db.exec("insert into monitoring_balance_digests(date,delivery_slot) values('2026-11-18','midnight')");
await assert.rejects(()=>db.exec("insert into monitoring_balance_digests(date,delivery_slot) values('2026-11-18','midnight')"),/duplicate key/);
await assert.rejects(()=>db.exec("insert into monitoring_balance_digests(date,delivery_slot) values('2026-11-18','evening')"),/duplicate key/);
await db.exec("update monitoring_balance_digests set status='failed' where date='2026-11-18' and delivery_slot='midnight'");
assert.equal((await db.query("select status from monitoring_balance_digests where delivery_slot='evening'")).rows[0].status,'sent');
console.log('Midnight/evening migration passed: old records preserved, independent slots, duplicate claims rejected.');await db.close();})().catch(e=>{console.error(e.message);process.exitCode=1});
