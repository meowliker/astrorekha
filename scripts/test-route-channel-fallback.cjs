const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {parseTrackedUtmVisit,readTrackedUtmVisits}=require('../src/lib/tracking-utm-visits');
test('mapped arrivals count once as arrivals; unrelated and downstream pages do not become arrivals',async()=>{
 const at='2026-11-11T10:00:00Z';
 for(const [url,channel] of [['/discover','google'],['/soulmate/discover','google'],['/us/soulmate/discover','google'],['/','meta'],['/soulmate','meta'],['/us/soulmate','meta']])assert.equal(parseTrackedUtmVisit({created_at:at,url:'https://astrorekha.com'+url}).channel,channel);
 for(const path of ['/discover/onboarding/step-1','/reports','/discover?utm_source=newsletter&utm_medium=email'])assert.equal(parseTrackedUtmVisit({created_at:at,url:'https://astrorekha.com'+path}),null);
 const rows=['/discover','/soulmate/discover','/us/soulmate/discover'].map(path=>({created_at:at,url:'https://astrorekha.com'+path}));
 const db={from(){const q={};for(const m of ['select','eq','or','gte','lt','order'])q[m]=()=>q;q.range=async()=>({data:rows,error:null});return q}};
 const main=await readTrackedUtmVisits(db,at,at);assert.equal(main.length,1);assert.equal(main[0].channel,'google');
});
test('partner migration groups configured pages without altering recorded events or permissions',async()=>{
 const db=new PGlite();try {
 await db.exec('create role anon;create role authenticated;create role service_role;create table marketing_events(created_at timestamptz,event_name text,path text,route text,url text,utm_source text);create table us_soulmate_marketing_events(like marketing_events);');
 const rows=[['marketing_events','page_view','/discover','google'],['marketing_events','page_view','/soulmate/discover','google'],['us_soulmate_marketing_events','us_soulmate_landing_view','/us/soulmate/discover','google'],['marketing_events','page_view','/','meta'],['marketing_events','page_view','/soulmate','meta'],['us_soulmate_marketing_events','us_soulmate_landing_view','/us/soulmate','meta']];
 for(const [table,event,path] of rows)await db.query(`insert into ${table} values (now(),$1,$2,null,$3,null)`,[event,path,'https://astrorekha.com'+path]);
 await db.exec(fs.readFileSync('supabase/migrations/20261111200000_partner_route_channel_fallback.sql','utf8'));
 const {rows:result}=await db.query("select * from read_partner_funnel_live_traffic('Asia/Kolkata',now())");assert.equal(result.length,6);for(const r of result){assert.equal(Number(r.today_views),1);assert.ok(['meta','google'].includes(r.channel));}
 await db.exec('set role anon');await assert.rejects(db.query("select * from read_partner_funnel_live_traffic('Asia/Kolkata',now())"),/permission denied/);
 }finally{await db.close()}
});
