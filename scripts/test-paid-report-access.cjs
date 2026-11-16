const assert=require('node:assert/strict'),{test}=require('node:test'),Module=require('node:module'),path=require('node:path');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
process.env.REPORT_SESSION_SECRET='fixture-only-secret';
const {NextRequest}=require('next/server'),auth=require('../src/lib/report-session'),admin=require('../src/lib/supabase-admin');
const palm='data:image/jpeg;base64,aGVsbG8=';
function database(tables,fail=()=>false){
 const mutations=[];
 return {mutations,from(table){let filters=[],action=null,payload,sort,limit=Infinity;
  const run=()=>{if(fail(table,action))return {data:null,error:{message:'fixture outage'}};let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
   if(action){mutations.push({table,action,payload});if(action==='upsert'){tables[table]||=[];const old=tables[table].find(r=>r.email===payload.email);if(old)Object.assign(old,payload);else tables[table].push({...payload});}if(action==='update')rows.forEach(r=>Object.assign(r,payload));if(action==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));}
   if(sort)rows.sort((a,b)=>String(b[sort]).localeCompare(String(a[sort])));return {data:rows.slice(0,limit),error:null};};
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},not(k,op,v){assert.equal(op,'is');filters.push(r=>r[k]!=v);return q},is(k,v){filters.push(r=>r[k]==v);return q},order(k){sort=k;return q},limit(n){limit=n;return q},upsert(row){action='upsert';payload=row;return q},update(row){action='update';payload=row;return q},delete(){action='delete';return q},maybeSingle:async()=>{const r=run();return {...r,data:r.data?.[0]||null}},then(ok,no){return Promise.resolve(run()).then(ok,no)}};return q;}};
}
const req=(route,body,cookie)=>new NextRequest('https://astrorekha.com'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie:'ar_report_session='+cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('paid customer who closed checkout before registration signs in by email code on a clean device; no grants replayed',async t=>{
 const tables={users:[{id:'paid-owner',email:'owner@example.invalid',password_hash:null,coins:7,unlocked_features:{palmReading:true,birthChart:true},bundle_purchased:'palm-birth',internal_secret:'never-return'}],otp_codes:[]};
 let failedTable=null;const db=database(tables,table=>table===failedTable);t.mock.method(admin,'getSupabaseAdmin',()=>db);
 const brevo=require('../src/lib/brevo');let mails=0;t.mock.method(brevo,'sendEmail',async()=>{mails++;return true});
 const login=require('../src/app/api/auth/login/route'),send=require('../src/app/api/auth/send-otp/route'),verify=require('../src/app/api/auth/verify-otp/route'),session=require('../src/app/api/auth/session/route');
 assert.equal((await login.POST(req('/api/auth/login',{email:'OWNER@example.invalid',password:'unused'}))).status,400);
 assert.equal((await send.POST(req('/api/auth/send-otp',{email:'OWNER@example.invalid'}))).status,200);assert.equal(mails,1);
 assert.equal((await verify.POST(req('/api/auth/verify-otp',{email:'owner@example.invalid',otp:'000000'}))).status,400);
 const result=await verify.POST(req('/api/auth/verify-otp',{email:'owner@example.invalid',otp:tables.otp_codes[0].otp}));assert.equal(result.status,200);
 const cookie=result.cookies.get(auth.REPORT_SESSION_COOKIE).value;assert.equal(auth.verifyReportSession(cookie),'paid-owner');
 const restored=await session.GET(req('/api/auth/session',null,cookie));const user=(await restored.json()).user;
 assert.equal(user.id,'paid-owner');assert.equal(user.coins,7);assert.equal(user.unlocked_features.birthChart,true);assert.equal(user.password_hash,undefined);assert.equal(user.internal_secret,undefined);
 assert.ok(db.mutations.every(m=>m.table==='otp_codes'||(m.table==='users'&&Object.keys(m.payload).join(',')==='updated_at')));
 assert.equal(tables.users.length,1);assert.equal(tables.users[0].coins,7);assert.equal(tables.otp_codes.length,0);
 failedTable='users';assert.equal((await login.POST(req('/api/auth/login',{email:'owner@example.invalid',password:'unused'}))).status,503);assert.equal((await session.GET(req('/api/auth/session',null,cookie))).status,503);
 failedTable='otp_codes';assert.equal((await send.POST(req('/api/auth/send-otp',{email:'owner@example.invalid'}))).status,503);assert.equal(mails,1,'never send an unsaved OTP');
});
test('paid report input recovery uses only fulfilled orders owned by the signed-in user; edited profiles remain authoritative',async t=>{
 const birth={birthYear:'1995',birthMonth:'March',birthDay:'9',birthHour:'4',birthMinute:'20',birthPeriod:'PM',birthPlace:'New York',knowsBirthTime:true};
 const tables={checkout_report_inputs:[{market:'US',order_id:'paid-us',palm_image:palm}],user_profiles:[],payments:[{user_id:'another',payment_status:'paid',fulfilled_at:'yes',created_at:'2026-11-16',birth_details_snapshot:birth},{user_id:'owner',payment_status:'created',fulfilled_at:null,created_at:'2026-11-17',birth_details_snapshot:{...birth,birthYear:'2000'}}],us_main_orders:[{id:'paid-us',user_id:'owner',payment_status:'paid',fulfilled_at:'yes',created_at:'2026-11-15',birth_details:birth}]};
 const db=database(tables);t.mock.method(admin,'getSupabaseAdmin',()=>db);const {loadPaidReportProfile}=require('../src/lib/paid-report-profile');
 let p=await loadPaidReportProfile('owner',true);assert.equal(p.palm_image,palm);assert.equal(p.birth_year,'1995');assert.equal(p.birth_place,'New York');assert.equal(db.mutations.length,0);
 assert.deepEqual(await loadPaidReportProfile('not-owner',true),{});
 tables.user_profiles=[{id:'owner',birth_year:'1988',birth_month:'9',birth_day:'5',birth_place:'Delhi'}];p=await loadPaidReportProfile('owner',true);assert.equal(p.birth_year,'1988');assert.equal(p.palm_image,undefined,'do not attach a different birth profile photo');
 tables.user_profiles[0]={id:'owner',birth_year:'1995',birth_month:'3',birth_day:'9',birth_place:'Edited place'};p=await loadPaidReportProfile('owner',true);assert.equal(p.birth_place,'Edited place');assert.equal(p.palm_image,palm);
 tables.us_main_orders[0].fulfilled_at=null;tables.user_profiles=[];assert.deepEqual(await loadPaidReportProfile('owner',true),{});
 tables.users=[{id:'owner',birth_year:'1984',birth_month:'June',birth_day:'12',birth_place:'Edited legacy place',password_hash:'secret'}];
 p=await loadPaidReportProfile('owner');assert.equal(p.birth_year,'1984');assert.equal(p.birth_place,'Edited legacy place');assert.equal(p.password_hash,undefined);
 const {validCheckoutPalm}=require('../src/lib/report-input-snapshot');assert.equal(validCheckoutPalm('https://untrusted.invalid/photo'),false);assert.equal(validCheckoutPalm(palm),true);
});
test('report APIs reject stale browser/header/body identity without a signed account',async()=>{
 for(const [folder,method] of [['birth-chart-report/status','GET'],['birth-chart-report/generate','POST'],['future-partner-report/status','GET'],['future-partner-report/generate','POST'],['past-life-report/status','GET'],['past-life-report/generate','POST'],['astrocartography/status','GET'],['astrocartography/generate','POST'],['aura-color-report/status','GET'],['aura-color-report/submit','POST'],['spirit-animal-report/status','GET'],['spirit-animal-report/submit','POST']]){
  const handler=require('../src/app/api/'+folder+'/route')[method];
  const request=new NextRequest('https://astrorekha.com/api/'+folder+'?userId=someone',{method,headers:{cookie:'ar_access=someone','x-user-id':'someone','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({userId:'someone',answers:[]})}:{})});
  assert.equal((await handler(request)).status,401,folder);
 }
});
test('saved report is returned for signed account even when query identifies a different user',async t=>{
 const tables={birth_chart_reports:[{user_id:'owner',id:'existing-report',status:'complete',created_at:'2026-01-01'},{user_id:'other',id:'wrong-report',status:'complete'}]};const db=database(tables);
 t.mock.method(admin,'getSupabaseAdmin',()=>db);t.mock.method(require('../src/lib/customer-market'),'customerMarket',async()=> 'IN');
 const result=await require('../src/app/api/birth-chart-report/status/route').GET(req('/api/birth-chart-report/status?userId=other',null,auth.createReportSession('owner')));
 assert.equal(result.status,200);assert.equal((await result.json()).report_id,'existing-report');assert.equal(db.mutations.length,0);
});
test('return links preserve report location and reject external redirects; logout clears both cookies',async()=>{
 const {customerReturnPath}=require('../src/lib/customer-login-path');
 for(const p of ['/palm-reading','/birth-chart/report?id=123','/reports','/soulmate-sketch'])assert.equal(customerReturnPath(p),p);
 for(const p of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/admin','/onboarding/step-1'])assert.equal(customerReturnPath(p),'/reports');
 const response=await require('../src/app/api/session/clear/route').POST(req('/api/session/clear',{}));assert.equal(response.cookies.get('ar_report_session').maxAge,0);assert.equal(response.cookies.get('ar_access').maxAge,0);
});
test('private input migration is additive, inaccessible to browser roles, and retry-safe',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');const db=new PGlite();
 try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116010000_checkout_report_inputs.sql'),'utf8'));
 await db.exec("set role service_role");
 await db.query('insert into checkout_report_inputs(market,order_id,palm_image) values($1,$2,$3)',['IN','paid-fixture',palm]);
 await db.query('insert into checkout_report_inputs(market,order_id,palm_image) values($1,$2,$3) on conflict do nothing',['IN','paid-fixture',palm]);
 assert.equal((await db.query('select count(*)::int as n from checkout_report_inputs')).rows[0].n,1);
 await db.exec('reset role; set role anon');await assert.rejects(()=>db.query('select * from checkout_report_inputs'),/permission denied/);
 await db.exec('reset role; set role authenticated');await assert.rejects(()=>db.query('select * from checkout_report_inputs'),/permission denied/);
 }finally{await db.close()}
});
test('input save failure is retryable, and checkouts without a photo keep their existing behavior',async t=>{
 const db=database({},()=>true);let calls=0;t.mock.method(admin,'getSupabaseAdmin',()=>{calls++;return db});const {saveCheckoutReportInputs}=require('../src/lib/checkout-report-inputs');
 await saveCheckoutReportInputs('IN','fixture',undefined);assert.equal(calls,0);
 await assert.rejects(()=>saveCheckoutReportInputs('IN','fixture',palm),/retry before paying/);
 await assert.rejects(()=>saveCheckoutReportInputs('IN','fixture','https://invalid/photo'),/retry the upload/);
 assert.equal(db.mutations.length,0);
});
