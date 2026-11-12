/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...args);};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {canAccess,workspaceForPath}=require('../src/lib/admin-workspaces');
const {experimentVariant}=require('../src/lib/us-main/experiments');
const {usRevenuePayment}=require('../src/lib/us-main-admin-revenue');
const {buildRevenueDashboard,resolveRevenueRange}=require('../src/lib/revenue-dashboard');
const {usPricing,INTRO_PRICES}=require('../src/lib/us-main/catalog');
test('workspace boundaries cannot be escaped by route prefixes',()=>{
 const a={id:'Staff',isAdministrator:false,workspaces:['us-main']};
 for(const p of ['/admin/us-main/tracking','/api/admin/us-main/pricing','/api/admin/us-main/tracking/budget'])assert.equal(canAccess(a,workspaceForPath(p)),true);
 for(const p of ['/api/admin/access','/api/admin/pricing','/api/admin/us-soulmate/orders','/api/admin/soulmate/orders','/api/admin/payment-gateway','/api/admin/us-main-other'])assert.equal(canAccess(a,workspaceForPath(p)),false,p);
 assert.equal(canAccess({...a,isAdministrator:true},'administrator'),true);
});
test('all admin API handlers except authentication have the central permission guard',()=>{
 function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else if(e.name==='route.ts'&&!/\/(login|logout|session)\/route.ts$/.test(p)){const code=fs.readFileSync(p,'utf8');assert.ok(!/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/.test(code),p);for(const match of code.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([^;\n]+)/g))assert.ok(match[2].startsWith('withAdminAccess('),p);}}}visit(path.join(__dirname,'../src/app/api/admin'));
});
test('API authorization denies expired/revoked sessions and cross-workspace writes before handlers',async t=>{
 const sup=require('../src/lib/supabase-admin'),{NextRequest,NextResponse}=require('next/server');let member={admin_id:'Staff',active:true,is_administrator:false,workspaces:['us-main']},expired=false;
 t.mock.method(sup,'getSupabaseAdmin',()=>({from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='admin_sessions'?{admin_id:'Staff',expires_at:new Date(Date.now()+(expired?-1:3600000)).toISOString()}:member,error:null};}};}}));
 const {withAdminAccess}=require('../src/lib/admin-access');let calls=0;const wrapped=withAdminAccess(async req=>{calls++;assert.equal(req.headers.get('authorization'),'Bearer '+'a'.repeat(64));return NextResponse.json({ok:true});});
 const request=(p,headers={},method='GET')=>new NextRequest('https://astrorekha.com'+p,{method,headers});
 assert.equal((await wrapped(request('/api/admin/us-main/orders'))).status,401);
 const headers={Authorization:'Bearer '+'a'.repeat(64)};
 assert.equal((await wrapped(request('/api/admin/us-main/orders',headers))).status,200);
 assert.equal((await wrapped(request('/api/admin/pricing',headers,'PUT'))).status,403);
 assert.equal((await wrapped(request('/api/admin/access',headers))).status,403);
 assert.equal((await wrapped(request('/api/admin/us-main/pricing',{cookie:'ar_admin_session='+'a'.repeat(64)},'PUT'))).status,403);
 expired=true;assert.equal((await wrapped(request('/api/admin/us-main/orders',headers))).status,401);expired=false;
 member.active=false;assert.equal((await wrapped(request('/api/admin/us-main/orders',headers))).status,401);
 assert.equal(calls,1);
});
test('US totals use actual Stripe captured cents, retain INR default, and do not count pending orders as sales',()=>{
 const order={id:'us_ar_test',type:'bundle',bundle_id:'palm-reading',amount_cents:704,paid_amount_cents:100,currency:'USD',payment_status:'paid',customer_email:'test@example.invalid',user_id:'u',fulfillment_features:['palmReading'],fulfillment_coins:15,line_items:[],attribution:{marketing:{utm_source:'facebook'}},created_at:'2026-11-12T07:00:00Z',paid_at:'2026-11-12T08:00:00Z',fulfilled_at:'2026-11-12T08:00:01Z'};
 const p=usRevenuePayment(order);assert.equal(p.amount,100);assert.equal(p.created_at,order.paid_at);
 const input={payments:[p],events:[],pricing:usPricing(INTRO_PRICES),range:resolveRevenueRange('2026-11-12','2026-11-12',new Date('2026-11-13')),attribution:'last'};
 const usd=buildRevenueDashboard({...input,currency:'USD'});assert.equal(usd.totals.collectedPaise,100);assert.equal(usd.totals.paid,1);
 assert.equal(buildRevenueDashboard(input).totals.paid,0);
 assert.equal(buildRevenueDashboard({...input,currency:'USD',payments:[{...p,payment_status:'pending'}]}).totals.paid,0);
});
test('US experiments assign stable variants and both variants receive traffic',()=>{const counts={A:0,B:0};for(let i=0;i<200;i++){const v=experimentVariant('experiment',String(i));assert.equal(v,experimentVariant('experiment',String(i)));counts[v]++;}assert.ok(counts.A>60&&counts.B>60);});
test('migration grants Anay management, enforces workspace permissions, atomic price edits, isolated experiments and no payment changes',async()=>{
 const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role;');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8'));
 await db.exec("insert into admins(id,password_hash)values('Anay','fixture'),('Staff','fixture');");
 for(const file of ['20261112010000_us_main_funnel.sql','20261112010100_us_main_environment_reports.sql','20261112020000_us_account_commerce.sql','20261112030000_us_main_stripe_discounts.sql','20261113010000_us_main_admin_workspaces.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 const query=async(sql,params=[]) => (await db.query(sql,params)).rows;
 assert.equal((await query("select is_administrator from admin_workspace_members where admin_id='Anay'"))[0].is_administrator,true);
 await assert.rejects(query("select set_admin_workspace_access('Staff','Anay',false,'{}')"));
 await assert.rejects(query("select set_admin_workspace_access('Anay','Anay',false,'{}')"));
 await query("select set_admin_workspace_access('Anay','Staff',true,array['us-main'])");assert.deepEqual((await query("select workspaces from admin_workspace_members where admin_id='Staff'"))[0].workspaces,['us-main']);
 await assert.rejects(query("select set_admin_workspace_access('Anay','Staff',true,array['fake'])"));
 const old=(await query("select value from us_main_settings where key='prices_usd_cents'"))[0].value;
 const next={...old,'palm-reading':805};await query('select save_us_main_prices($1,$2,$3)',['Anay',JSON.stringify(old),JSON.stringify(next)]);await assert.rejects(query('select save_us_main_prices($1,$2,$3)',['Anay',JSON.stringify(old),JSON.stringify(next)]));
 assert.equal((await query("select value->>'palm-reading' as price from us_main_settings where key='prices_usd_cents'"))[0].price,'805');
 assert.equal((await query('select count(*)::int as n from us_main_admin_audit'))[0].n,1);
 await query("insert into us_main_experiments(name,status,bundle_a,bundle_b,created_by)values('A','active','palm-reading','palm-birth','Anay')");await assert.rejects(query("insert into us_main_experiments(name,status,bundle_a,bundle_b,created_by)values('B','active','palm-reading','palm-birth','Anay')"));
 await query("select create_workspace_admin('Anay','NewAdmin','$2b$12$fixture',array['us-main'])");assert.deepEqual((await query("select workspaces from admin_workspace_members where admin_id='NewAdmin'"))[0].workspaces,['us-main']);
 await db.exec('set role anon;');await assert.rejects(query('select * from admin_workspace_members'));await assert.rejects(query("select set_admin_workspace_access('Anay','Staff',true,'{}')"));await assert.rejects(query('select * from us_main_experiment_assignments'));await db.exec('reset role;');
 assert.equal((await query('select count(*)::int as n from us_main_orders'))[0].n,0);
 }finally{await db.close();}
});
