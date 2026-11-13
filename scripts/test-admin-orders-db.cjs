const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {acquisitionChannel,acquisitionTouch,isAcquisitionTest}=require('../src/lib/admin-acquisition');
test('database source classifier matches the application and database pagination protects workspace boundaries',async()=>{
 const db=new PGlite();try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table users(id text primary key,email text,name text);
 create table payments(id text primary key,payu_txn_id text,user_id text,type text,bundle_id text,feature text,coins int,customer_email text,amount bigint,currency text,created_at timestamptz,payment_status text,last_touch jsonb,landing_url text,landing_path text,utm_source text,utm_medium text,meta_campaign_id text,meta_adset_id text,meta_ad_id text);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261113100000_admin_orders_pagination.sql','utf8'));
 const cases=[{}, {landing_path:'/'}, {landing_path:'/discover/onboarding/step-1'}, {landing_url:'https://other.com/discover'}, {utm_source:'google',utm_medium:'cpc'}, {utm_source:'facebook',utm_medium:'paid social'}, {landing_path:'/discover',utm_source:'newsletter',utm_medium:'email'}, {landing_path:'/discover',utm_source:'google'}, {last_touch:{landing_path:'/discover'},utm_source:'meta',utm_medium:'cpc'}, {landing_url:'https://astrorekha.com/discover?utm_source=facebook&utm_medium=paid%20social'}, {landing_url:'/?gclid=123'}, {meta_campaign_id:'123',utm_source:'google',utm_medium:'organic'}, {utm_source:'codex_qa',landing_path:'/'}, {attribution:{marketing:{landing_path:'/soulmate/discover'}}}, {attribution:{trackingEnvironment:'local',landing_path:'/discover'}}];
 for(const row of cases){const expected=isAcquisitionTest(row)?'test':acquisitionChannel(acquisitionTouch(row));const actual=(await db.query('select admin_order_channel($1::jsonb) as channel',[JSON.stringify(row)])).rows[0].channel;assert.equal(actual,expected,JSON.stringify(row));}
 await db.exec(`insert into users values('user','fixture@example.com','Fixture');
 insert into payments(id,payu_txn_id,user_id,type,bundle_id,feature,amount,currency,created_at,payment_status,landing_path)
 select 'pnl_'||g,null,'user','bundle','test_bundle','soulmateSketch',100,'INR',now(),'paid',case when g<14 then '/discover' else '/' end from generate_series(1,20) g;
 insert into payments(id,payu_txn_id,payment_status,created_at,landing_path) values ('pay_sm_a',null,'paid',now(),'/discover'),('mirror','us_sm_b','paid',now(),'/discover'),('pending',null,'pending',now(),'/discover');`);
 const read=async(source,page=1,search='')=>(await db.query("select read_admin_main_orders($1,null,null,'all',$2,$3,10,'{\"test_bundle\":\"Palm + Birth Chart\"}') as result",[source,search,page])).rows[0].result;
 let result=await read('google');assert.equal(result.total,13);assert.equal(result.rows.length,10);assert.equal(result.rows[0].email,'fixture@example.com');assert.ok(result.rows.every(r=>r.ad_source==='google'));
 assert.equal((await read('google',2)).rows.length,3);assert.equal((await read('google',3)).total,13);assert.equal((await read('google',3)).rows.length,0);
 assert.equal((await read('all')).total,20);assert.equal((await read('meta')).total,7);assert.equal((await read('all',1,'Palm + Birth Chart')).total,20);assert.equal((await read('all',1,'fixture@example')).total,20);assert.equal((await read('all',1,'pay_sm')).total,0);
 await db.exec("update payments set landing_path='/discover' where id='pnl_20'");
 assert.equal((await read('google')).total,14,'source cache refreshes after attribution repair');
 await db.exec("insert into payments(id,type,payment_status,created_at,landing_path) values('fresh','report','paid',now(),'/discover')");
 assert.equal((await read('google')).total,15,'new paid orders appear without a scheduled refresh');
 await db.exec("update payments set payment_status='failed' where id='fresh'");
 assert.equal((await read('google')).total,14,'cached labels cannot make an unpaid order visible');
 await db.exec('set role anon');await assert.rejects(read('all'),/permission denied/);
 } finally {await db.close()}
});
