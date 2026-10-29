const assert=require('node:assert/strict'),{test,beforeEach}=require('node:test'),Module=require('node:module'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
let active,failRead,schema,token;
const db={rpc:async()=>({data:schema?1:null,error:schema?null:{message:'missing migration'}}),from(table){assert.ok(['settings','admin_sessions'].includes(table));let id;const q={select(){return q},eq(k,v){id=v;return q},maybeSingle:async()=>table==='settings'?{data:active?{value:{active}}:null,error:failRead?{}:null}:{data:id===token?{id:token,expires_at:new Date(Date.now()+60000).toISOString()}:null,error:null},upsert:async row=>{active=row.value.active;return {error:null}}};return q}};
const id=require.resolve('../src/lib/supabase-admin');require.cache[id]={id,filename:id,loaded:true,exports:{getSupabaseAdmin:()=>db}};
const {activePaymentGateway}=require('../src/lib/payment-gateway'),route=require('../src/app/api/admin/payment-gateway/route'),{NextRequest}=require('next/server');
const req=(method='GET',value,authorized=true)=>new NextRequest('https://example.com/api/admin/payment-gateway',{method,headers:{authorization:authorized?'Bearer admin-fixture':'','content-type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
beforeEach(()=>{active=null;failRead=false;schema=true;token='admin-fixture';process.env.PAYTM_MID='fixtureMID';process.env.PAYTM_MERCHANT_KEY='1234567890123456';process.env.PAYTM_ENVIRONMENT='production';process.env.PAYTM_ENABLED='true';process.env.PAYU_MERCHANT_KEY='fixture';process.env.PAYU_MERCHANT_SALT='fixture'});
test('default is PayU; missing configuration and database errors never silently switch gateways',async()=>{assert.equal(await activePaymentGateway(),'payu');active='paytm';assert.equal(await activePaymentGateway(),'paytm');process.env.PAYTM_ENABLED='false';await assert.rejects(activePaymentGateway());active='payu';failRead=true;await assert.rejects(activePaymentGateway())});
test('gateway setting and readiness require an authenticated admin',async()=>{assert.equal((await route.GET(req('GET',null,false))).status,401);assert.equal((await route.POST(req('POST',{active:'paytm'},false))).status,401);assert.equal(active,null)});
test('readiness hides secrets and requires applied schema',async()=>{let r=await (await route.GET(req())).json();assert.deepEqual(r,{active:'payu',paytmReady:true,pineLabsReady:false});schema=false;r=await (await route.GET(req())).json();assert.equal(r.paytmReady,false)});
test('switching Paytm on requires explicit enablement, production credentials and schema',async()=>{schema=false;assert.equal((await route.POST(req('POST',{active:'paytm'}))).status,400);schema=true;process.env.PAYTM_ENVIRONMENT='staging';assert.equal((await route.POST(req('POST',{active:'paytm'}))).status,400);process.env.PAYTM_ENVIRONMENT='production';process.env.PAYTM_ENABLED='false';assert.equal((await route.POST(req('POST',{active:'paytm'}))).status,400);assert.equal(active,null)});
test('authorized gateway switch only updates the selector; switching back remains available',async()=>{assert.equal((await route.POST(req('POST',{active:'paytm'}))).status,200);assert.equal(active,'paytm');assert.equal((await route.POST(req('POST',{active:'payu'}))).status,200);assert.equal(active,'payu');assert.equal((await route.POST(req('POST',{active:'other'}))).status,400)});
test('local override selects Paytm without reading or writing the shared setting and is ignored in production',async()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL:process.env.VERCEL,LOCAL_PAYMENT_GATEWAY:process.env.LOCAL_PAYMENT_GATEWAY};
 try {
  process.env.NODE_ENV='development';delete process.env.VERCEL;process.env.LOCAL_PAYMENT_GATEWAY='paytm';failRead=true;
  assert.equal(await activePaymentGateway(),'paytm');failRead=false;
  assert.equal((await (await route.GET(req())).json()).active,'paytm');
  assert.equal((await route.POST(req('POST',{active:'paytm'}))).status,400);assert.equal(active,null);
  process.env.NODE_ENV='production';assert.equal(await activePaymentGateway(),'payu');
  process.env.NODE_ENV='development';process.env.VERCEL='1';assert.equal(await activePaymentGateway(),'payu');
 } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('Pine Labs is opt-in, requires signing keys and schema, and local switching cannot write shared settings',async()=>{
 const keys=['NODE_ENV','VERCEL','LOCAL_PAYMENT_GATEWAY','PINELABS_CLIENT_ID','PINELABS_CLIENT_SECRET','PINELABS_MERCHANT_ID','PINELABS_ENVIRONMENT','PINELABS_ENABLED','PINELABS_CALLBACK_SECRET','PINELABS_WEBHOOK_SECRET'];const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {Object.assign(process.env,{PINELABS_CLIENT_ID:'fixture',PINELABS_CLIENT_SECRET:'fixture',PINELABS_MERCHANT_ID:'421588',PINELABS_ENVIRONMENT:'production',PINELABS_ENABLED:'true',PINELABS_CALLBACK_SECRET:'ab'.repeat(32)});
 assert.equal((await (await route.GET(req())).json()).pineLabsReady,true);
 assert.equal((await route.POST(req('POST',{active:'pinelabs'}))).status,200);assert.equal(active,'pinelabs');
 assert.equal(await activePaymentGateway(),'pinelabs');schema=false;await assert.rejects(activePaymentGateway(),/migration/);schema=true;
 delete process.env.PINELABS_CALLBACK_SECRET;delete process.env.PINELABS_WEBHOOK_SECRET;assert.equal(await activePaymentGateway(),'pinelabs');
 active='payu';process.env.NODE_ENV='development';delete process.env.VERCEL;process.env.LOCAL_PAYMENT_GATEWAY='pinelabs';assert.equal(await activePaymentGateway(),'pinelabs');assert.equal((await route.POST(req('POST',{active:'pinelabs'}))).status,400);assert.equal(active,'payu');
 process.env.NODE_ENV='production';assert.equal(await activePaymentGateway(),'payu');
 }finally{for(const[k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
