// Isolated PostgreSQL-compatible migration test. Install PGlite in a temporary directory and set PGLITE_PATH.
const {PGlite}=require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');await db.exec(fs.readFileSync('supabase/migrations/20261119010000_admin_account_balances.sql','utf8'));
await db.exec('set role service_role');
const claim=async key=>(await db.query('select claim_admin_balance_refresh($1) as claimed',[key])).rows[0].claimed;
assert.equal(await claim('2026-11-19:midnight'),true);assert.equal(await claim('another'),false);
const good={accountId:'test1',accountName:'Test',funnels:['AstroRekha'],at:'2026-11-18T18:30:01Z',source:'midnight',status:'ok',currency:'INR',remaining:5500};
const evt={id:'event1',accountId:'test1',at:'2026-11-18T18:00:00Z',kind:'limit_change',amount:500,currency:'INR'};
await db.query('select save_admin_balance_refresh($1,$2::jsonb,$3::jsonb,$4)',['2026-11-19:midnight',JSON.stringify([good]),JSON.stringify([evt]),null]);assert.equal(await claim('2026-11-19:midnight'),false);
assert.equal(await claim('2026-11-19:morning'),true);const failed={...good,source:'morning',at:'2026-11-19T06:00:00Z',status:'error'};delete failed.remaining;
await db.query('select save_admin_balance_refresh($1,$2::jsonb,$3::jsonb,$4)',['2026-11-19:morning',JSON.stringify([failed]),JSON.stringify([evt]),null]);
const current=(await db.query('select * from admin_balance_current')).rows[0];assert.equal(current.last_verified.remaining,5500);assert.equal(current.last_verified.at,good.at);assert.equal(current.last_attempt.status,'error');assert.equal((await db.query('select * from admin_balance_snapshots')).rows.length,2);assert.equal((await db.query('select * from admin_balance_history')).rows.length,1);
assert.equal(await claim('2026-11-19:evening'),true);
const evening={...good,source:'evening',at:'2026-11-19T12:30:00Z',remaining:4500};
await db.query('select save_admin_balance_refresh($1,$2::jsonb,$3::jsonb,$4)',['2026-11-19:evening',JSON.stringify([evening]),JSON.stringify([evt]),null]);
assert.equal((await db.query('select * from admin_balance_snapshots')).rows.length,3);
assert.equal((await db.query('select last_verified from admin_balance_current')).rows[0].last_verified.remaining,4500);
assert.equal((await db.query('select payload from admin_balance_snapshots where run_id=$1',['2026-11-19:midnight'])).rows[0].payload.remaining,5500);
await db.exec("update admin_balance_alert_state set activated_at='2026-11-18T12:00:00Z'");
assert.equal(await claim('alert-test'),true);
const events=[
 {id:'past',accountId:'test1',at:'2026-11-18T11:00:00Z',kind:'limit_change',before:100,after:200,amount:100,currency:'INR'},
 {id:'new',accountId:'test1',at:'2026-11-18T13:00:00Z',kind:'limit_change',before:100,after:200,amount:100,currency:'INR'},
 {id:'vedic',accountId:'2022187855078303',at:'2026-11-18T13:00:00Z',kind:'limit_change',before:100,after:200,amount:100,currency:'INR'},
 {id:'decrease',accountId:'test1',at:'2026-11-18T13:00:00Z',kind:'limit_change',before:200,after:100,amount:-100,currency:'INR'},
 {id:'initial',accountId:'test1',at:'2026-11-18T13:00:00Z',kind:'limit_change',before:0,after:100,amount:100,currency:'INR'}];
await db.query('select save_admin_balance_refresh($1,$2::jsonb,$3::jsonb,$4)',['alert-test',JSON.stringify([evening,{...evening,accountId:'2022187855078303'}]),JSON.stringify(events),null]);
assert.deepEqual((await db.query('select id from admin_balance_history where notify')).rows.map(r=>r.id),['new']);
await db.exec("update admin_balance_history set notify=false where id='new'");
assert.equal(await claim('alert-test-replay'),true);
await db.query('select save_admin_balance_refresh($1,$2::jsonb,$3::jsonb,$4)',['alert-test-replay',JSON.stringify([evening]),JSON.stringify(events),null]);
assert.equal((await db.query('select id from admin_balance_history where notify')).rows.length,0);
for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from admin_balance_current'),/permission denied/);await assert.rejects(()=>claim('blocked'),/permission denied/);}
await db.exec('reset role');const rls=await db.query("select relname,relrowsecurity from pg_class where relname like 'admin_balance_%' and relkind='r'");assert.equal(rls.rows.length,6);assert.ok(rls.rows.every(r=>r.relrowsecurity));
console.log('Migration passed: schema, grants/RLS, refresh locking, three-slot isolation, failure preservation and event deduplication.');await db.close();})().catch(e=>{console.error(e.message);process.exitCode=1});
