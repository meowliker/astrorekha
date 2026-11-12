const assert=require('node:assert/strict'),{test}=require('node:test'),Module=require('node:module'),path=require('node:path');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';process.env.ANTHROPIC_API_KEY='fixture';
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,...rest)};
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {NextRequest}=require('next/server'),auth=require('../src/lib/report-session'),admin=require('../src/lib/supabase-admin'),usage=require('../src/lib/ai-usage-logger');
let generated=0;const originalLoad=Module._load;Module._load=function(name,...rest){if(name==='@anthropic-ai/sdk')return class{messages={create:async()=>{generated++;return {id:'ai_fixture',usage:{},content:[{type:'text',text:JSON.stringify({tabs:{love:{}},meta:{}})}]}}}};return originalLoad.call(this,name,...rest)};
const api=require('../src/app/api/palm-reading/route');Module._load=originalLoad;
const image='data:image/jpeg;base64,aGVsbG8=';
test('palm recovery uses authenticated account, server inputs and durable writes',async t=>{
 let uid='owner',locked=false,existing=null,saveError=false,saved=null;const selected=[];
 t.mock.method(auth,'reportSessionUser',()=>uid);t.mock.method(usage,'logClaudeUsage',async()=>{});
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(table){const q={select(){return q},eq(k,v){selected.push([table,k,v]);return q},maybeSingle:async()=>({error:null,data:table==='users'?{unlocked_features:{palmReading:!locked}}:table==='user_profiles'?{palm_image:image,birth_year:'2001',birth_month:'01',birth_day:'01',gender:'male'}:existing}),upsert:async(row)=>{saved=row;return {error:saveError?new Error('write failed'):null}}};return q}}));
 const req=(body={},origin='http://127.0.0.1:3195')=>new NextRequest('http://localhost:3195/api/palm-reading',{method:'POST',headers:{host:'127.0.0.1:3195',origin,'content-type':'application/json'},body:JSON.stringify(body)});
 uid=null;assert.equal((await api.POST(req())).status,403);assert.equal(generated,0);
 uid='owner';locked=true;assert.equal((await api.GET(req())).status,403);locked=false;
 assert.equal((await api.POST(req({},'https://evil.invalid'))).status,403);
 const res=await api.POST(req({userId:'victim'}));assert.equal(res.status,200);assert.equal(saved.id,'owner');assert.equal(saved.palm_image_url,image);assert.equal(saved.birth_date,'2001-01-01');assert.ok(selected.every(x=>x[2]==='owner'));assert.equal(generated,1);
 existing={reading:saved.reading,birth_date:saved.birth_date,palm_image_url:image,zodiac_sign:saved.zodiac_sign};assert.equal((await (await api.POST(req())).json()).cached,true);assert.equal(generated,1);
 const recovered=await (await api.GET(req())).json();assert.ok(recovered.reading);assert.equal(recovered.image,image);
 existing.deleted_at=new Date().toISOString();assert.equal((await (await api.GET(req())).json()).reading,null);
 assert.equal((await api.POST(req())).status,200);assert.equal(generated,2);assert.equal(saved.deleted_at,null);
 existing={...saved,zodiac_sign:'Wrong stale sign'};assert.equal((await api.POST(req())).status,200);assert.equal(generated,3);
 existing=null;saveError=true;assert.equal((await api.POST(req())).status,500);
 assert.equal((await api.POST(req({imageData:'https://untrusted.invalid/photo'}))).status,400);
});

test('normal registration returns a signed report session only after account creation',async t=>{
 process.env.REPORT_SESSION_SECRET='local-regression-secret';
 const loader=Module._load;
 Module._load=function(name,...rest){
  if(name==='@/lib/payment-reconciliation')return {reconcilePaidPaymentsForEmail:async()=>{}};
  if(name==='@/lib/whatsapp-subscriber')return {upsertWhatsappSubscriber:async()=>{}};
  return loader.call(this,name,...rest);
 };
 const registration=require('../src/app/api/auth/register/route');Module._load=loader;
 let created=null,existing=null,fail=false;
 t.mock.method(admin,'getSupabaseAdmin',()=>({from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:existing,error:null}),upsert:async row=>{created=row;return {error:fail?new Error('write failure'):null}}};return q}}));
 const request=()=>new NextRequest('http://localhost/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'fixture@example.invalid',password:'Testing123!'})});
 let res=await registration.POST(request());assert.equal(res.status,200);
 assert.equal(auth.verifyReportSession(res.cookies.get(auth.REPORT_SESSION_COOKIE)?.value),created.id);
 assert.notEqual(created.password_hash,'Testing123!');
 existing={id:created.id,password_hash:created.password_hash};res=await registration.POST(request());assert.equal(res.status,409);assert.equal(res.cookies.get(auth.REPORT_SESSION_COOKIE),undefined);
 existing=null;fail=true;res=await registration.POST(request());assert.equal(res.status,500);assert.equal(res.cookies.get(auth.REPORT_SESSION_COOKIE),undefined);
});
