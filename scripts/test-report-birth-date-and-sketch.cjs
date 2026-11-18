const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module'), path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...rest); };
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
process.env.REPORT_SESSION_SECRET='fixture-report-secret';
const {NextRequest}=require('next/server');
const admin=require('../src/lib/supabase-admin');
const auth=require('../src/lib/report-session');
const birth=require('../src/lib/birth-details');
const provider=require('../src/lib/soulmate-sketch');
const {loadPaidReportProfile}=require('../src/lib/paid-report-profile');
const {reconcileSoulmateSketch,collectPendingSoulmateSketches}=require('../src/lib/soulmate-sketch-reconcile');
const clone=x=>JSON.parse(JSON.stringify(x));
function database(tables){
 const writes=[];
 return {writes,from(table){let filters=[],action=null,payload=null,sort=null,maximum=Infinity,ignore=false;
  const run=()=>{tables[table]||=[];let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(action){writes.push({table,action,payload:clone(payload)});
    if(action==='update')rows.forEach(r=>Object.assign(r,payload));
    else {const old=tables[table].find(r=>payload.id ? r.id===payload.id:r.user_id===payload.user_id); if(old&&ignore)rows=[];else if(old){Object.assign(old,payload);rows=[old];}else{tables[table].push(clone(payload));rows=[tables[table].at(-1)];}}
   }
   if(sort)rows.sort((a,b)=>String(a[sort.key]).localeCompare(String(b[sort.key]))*(sort.asc?1:-1));
   return {data:clone(rows.slice(0,maximum)),error:null};};
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]==v);return q},not(k,op,v){assert.equal(op,'is');filters.push(r=>r[k]!=v);return q},lt(k,v){filters.push(r=>r[k]<v);return q},order(key,opts){sort={key,asc:opts?.ascending};return q},limit(n){maximum=n;return q},update(p){action='update';payload=p;return q},upsert(p,opts){action='upsert';payload=p;ignore=opts?.ignoreDuplicates;return q},maybeSingle:async()=>{const r=run();return {...r,data:r.data[0]||null}},then(a,b){return Promise.resolve(run()).then(a,b)}};return q;
 }};
}
const valid={birthMonth:'January',birthDay:'1',birthYear:'2000',birthHour:'12',birthMinute:'00',birthPeriod:'AM',birthPlace:'New York',knowsBirthTime:true};
const req=(url,body)=>new NextRequest('https://astrorekha.com'+url,{method:body?'POST':'GET',headers:{host:'astrorekha.com',origin:'https://astrorekha.com','content-type':'application/json',cookie:'ar_report_session='+auth.createReportSession('owner')},...(body?{body:JSON.stringify(body)}:{})});
const queued=()=>({id:'sketch',user_id:'owner',status:'generating',provider_job_id:'job-one',sketch_image_url:null,generation_count:0,updated_at:'2026-01-01T00:00:00.000Z',support_recovery_action_id:null});
test('January 1 2000 is a real date across snapshot, ISO, profile and user persistence; invalid dates stay invalid',()=>{
 for(const month of ['January','Jan','01',1]){
  const snapshot=birth.normalizeBirthDetailsSnapshot({...valid,birthMonth:month,isDefaultPlaceholder:true,completeForPalm:false});
  assert.equal(snapshot.completeForPalm,true);assert.equal(snapshot.completeForBirthChart,true);assert.equal(snapshot.isDefaultPlaceholder,false);
  assert.equal(birth.getBirthDateIso({...valid,birthMonth:month}),'2000-01-01');
  for(const fields of [birth.birthSnapshotToDbFields(snapshot),birth.birthSnapshotToUserDbFields(snapshot)]) assert.equal(fields.birth_year,'2000');
 }
 for(const input of [{},{...valid,birthDay:''},{...valid,birthMonth:'February',birthDay:'30'},{...valid,birthYear:'2100'}])assert.equal(birth.normalizeBirthDetailsSnapshot(input)?.completeForPalm||false,false);
 assert.equal(birth.getBirthDateIso({...valid,birthMonth:'February',birthDay:'29'}),'2000-02-29');
 assert.equal(birth.getBirthDateIso({...valid,birthMonth:'February',birthDay:'29',birthYear:'2001'}),null);
});
test('paid IN and US legacy snapshots recover Jan 1 and the uploaded palm without replaying payments; edited dates win',async t=>{
 let currentDb; t.mock.method(admin,'getSupabaseAdmin',()=>currentDb);
 for(const market of ['IN','US']){
 const snapshot={...valid,isDefaultPlaceholder:true,completeForPalm:false};const tables={user_profiles:[],users:[],payments:[],us_main_orders:[],checkout_report_inputs:[{market,order_id:'paid',palm_image:'data:image/jpeg;base64,aGVsbG8='}]};
 tables[market==='US'?'us_main_orders':'payments'].push({id:'paid',user_id:'owner',payment_status:'paid',fulfilled_at:'yes',created_at:'2026-11-18',[market==='US'?'birth_details':'birth_details_snapshot']:snapshot});
 const db=database(tables);currentDb=db;
 let p=await loadPaidReportProfile('owner',true);assert.equal(p.birth_year,'2000');assert.equal(p.birth_day,'1');assert.ok(p.palm_image);
 assert.deepEqual(await loadPaidReportProfile('stranger',true),{});
 tables.user_profiles=[{id:'owner',birth_year:'2000',birth_month:'January',birth_day:'2'}];p=await loadPaidReportProfile('owner',true);assert.equal(p.birth_day,'2');assert.equal(p.palm_image,undefined);assert.equal(db.writes.length,0);
 }
});
test('authenticated US profile endpoint saves the default birthday and palm, touching profile only',async t=>{
 const db=database({us_main_orders:[{user_id:'owner',fulfilled_at:'yes',customer_email:'test@example.invalid'}]});t.mock.method(admin,'getSupabaseAdmin',()=>db);
 const r=await require('../src/app/api/us/main/profile/route').POST(req('/api/us/main/profile',{...valid,palmImage:'data:image/jpeg;base64,aGVsbG8='}));assert.equal(r.status,200);assert.equal(db.writes.length,1);assert.equal(db.writes[0].table,'user_profiles');assert.equal(db.writes[0].payload.birth_day,'1');
});
test('queued provider job stays pending; completion is collected once without browser, grants or tracking writes',async t=>{
 const tables={soulmate_sketches:[queued()]};const db=database(tables);t.mock.method(admin,'getSupabaseAdmin',()=>db);let state='waiting',calls=0;
 t.mock.method(provider,'getSoulmateSketchJobStatusFromKie',async()=>{calls++;return {state,imageUrl:state==='success'?'https://example.invalid/sketch.jpg':null,raw:{data:{createTime:Date.now()-300000}}}});
 let r=await reconcileSoulmateSketch(clone(tables.soulmate_sketches[0]));assert.equal(r.providerState,'waiting');assert.equal(r.providerDelayed,true);assert.equal(r.sketch.status,'generating');
 await reconcileSoulmateSketch(r.sketch);assert.equal(calls,1,'cooldown avoids redundant provider calls');
 tables.soulmate_sketches[0].updated_at='2026-01-01';state='success';r=await collectPendingSoulmateSketches();assert.equal(r.complete,1);assert.equal(tables.soulmate_sketches[0].generation_count,1);
 await collectPendingSoulmateSketches();assert.equal(calls,2);assert.ok(db.writes.every(w=>w.table==='soulmate_sketches'));
});
test('late result cannot overwrite a newer job or support correction; provider errors do not destroy queued jobs',async t=>{
 const old=queued(),tables={soulmate_sketches:[{...old,provider_job_id:'new-job'}]};const db=database(tables);t.mock.method(admin,'getSupabaseAdmin',()=>db);
 let providerFails=false; t.mock.method(provider,'getSoulmateSketchJobStatusFromKie',async()=>{if(providerFails)throw new Error('provider temporarily unavailable');return {state:'success',imageUrl:'https://example.invalid/old.jpg'};});
 let r=await reconcileSoulmateSketch(old);assert.equal(r.sketch.provider_job_id,'new-job');assert.equal(r.sketch.sketch_image_url,null);
 tables.soulmate_sketches[0]={...old,support_recovery_action_id:'support-action',status:'complete',sketch_image_url:'private:corrected'};
 r=await reconcileSoulmateSketch(old);assert.equal(r.sketch.sketch_image_url,'private:corrected');
 tables.soulmate_sketches[0]=queued();providerFails=true;
 r=await collectPendingSoulmateSketches();assert.equal(r.errors,1);assert.equal(tables.soulmate_sketches[0].status,'generating');assert.equal(tables.soulmate_sketches[0].provider_job_id,'job-one');
});
test('generate saves job ID before returning; repeated generate and late answers reuse it without creating another',async t=>{
 const tables={users:[{id:'owner',unlocked_features:{soulmateSketch:true}}],soulmate_sketches:[]};const db=database(tables);t.mock.method(admin,'getSupabaseAdmin',()=>db);let creates=0;
 t.mock.method(provider,'generateSoulmateSketchFromKie',async opts=>{creates++;assert.equal(opts.deferPolling,true);await opts.onJobCreated('new-job');assert.equal(tables.soulmate_sketches[0].provider_job_id,'new-job');throw new provider.KieTimeoutError('waiting','new-job')});
 const route=require('../src/app/api/soulmate-sketch/generate/route');
 let r=await route.POST(req('/api/soulmate-sketch/generate',{answers:{connection:'Partnership'}}));assert.equal(r.status,200);assert.equal((await r.json()).pending,true);
 r=await route.POST(req('/api/soulmate-sketch/generate',{answers:{connection:'Other'}}));assert.equal(r.status,202);assert.equal(creates,1);
 const before=clone(tables.soulmate_sketches[0]);r=await require('../src/app/api/soulmate-sketch/answers/route').POST(req('/api/soulmate-sketch/answers',{answers:{connection:'Other'}}));assert.equal(r.status,200);assert.deepEqual(tables.soulmate_sketches[0],before);
 assert.ok(db.writes.every(w=>w.table==='soulmate_sketches'));
});
test('provider HTTP-200 application errors are errors, not successful progress',async t=>{
 process.env.KIE_API_KEY='fixture-only';t.mock.method(global,'fetch',async()=>Response.json({code:402,msg:'Insufficient credits'}));
 await assert.rejects(()=>provider.getSoulmateSketchJobStatusFromKie('fixture'),/Kie status request failed/);
});
test('background collection requires cron authorization',async()=>{
 process.env.CRON_SECRET='fixture-cron';const r=await require('../src/app/api/cron/collect-soulmate-sketches/route').GET(req('/api/cron/collect-soulmate-sketches'));assert.equal(r.status,401);
});
