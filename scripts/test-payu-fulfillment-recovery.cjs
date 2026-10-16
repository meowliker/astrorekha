const assert=require('node:assert/strict');
const {test,beforeEach}=require('node:test');
const Module=require('node:module'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
let payment,user,profile,failAccess,verifyCount,coreSavedAtAnalytics,reconciliationFilter;
const db={from(table){let op='read',values,columns='*';const q={select(value){columns=value;return q},eq(){return q},not(){return q},or(value){reconciliationFilter=value;return q},gte(){return q},order(){return q},limit(){return q},maybeSingle(){return run()},update(v){op='update';values=v;return q},upsert(v){op='update';values=v;return q},then(a,b){return run(true).then(a,b)}};
 async function run(many=false){if(table==='user_profiles'&&(columns.split(',').map(c=>c.trim()).includes('timezone')||Object.hasOwn(values||{},'timezone')))return {error:{message:'column user_profiles.timezone does not exist',code:'42703'},data:null};if(op==='update'){if(table==='users'&&failAccess)return {error:{message:'user write failed',code:'57014'}};Object.assign(table==='payments'?payment:table==='user_profiles'?profile:user,values);return {error:null}}return {error:null,data:table==='payments'?(many?[{...payment}]:{...payment}):table==='users'?{...user}:table==='user_profiles'?{...profile}:null}};return q}};
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>db});
stub('../src/lib/ga4-purchase',{sendGa4Purchase:async()=>{coreSavedAtAnalytics=!!payment.fulfilled_at}});
stub('../src/lib/meta-purchase',{sendMetaPurchase:async()=>{coreSavedAtAnalytics=!!payment.fulfilled_at}});
stub('../src/lib/vastu-guide-email',{sendVastuGuideEmail:async()=>{}});
stub('../src/lib/marketing-events',{recordMarketingEvent:async()=>{assert.ok(payment.fulfilled_at);return true}});
stub('../src/lib/whatsapp-subscriber',{upsertWhatsappSubscriber:async()=>{}});
stub('../src/lib/payu-api',{getPayUTransactions:async()=>[{txnid:payment.payu_txn_id,status:'success',amount:'659.62',email:'buyer@example.com'}],verifyPayUTransaction:async()=>{verifyCount++;return {txnid:payment.payu_txn_id,status:'success',amt:'659.62',mihpayid:'fixture-payu',email:'buyer@example.com'}}});
const {fulfillPayUPayment}=require('../src/lib/payu-fulfillment');
const {GET}=require('../src/app/api/payu/status/route');
const {POST}=require('../src/app/api/payu/success/route');
const {NextRequest}=require('next/server');
const reconcile=require('../src/app/api/cron/reconcile-payu-payments/route');
beforeEach(()=>{payment={id:'fixture',payu_txn_id:'fixture',user_id:'canonical',type:'bundle',bundle_id:'palm-reading',amount:65962,payment_status:'created',fulfilled_at:null};user={id:'canonical',email:'buyer@example.com',coins:0,unlocked_features:{birthChart:true}};profile={};failAccess=false;verifyCount=0;coreSavedAtAnalytics=false});
const payload=()=>({txnid:'fixture',status:'success',amount:'659.62',email:'buyer@example.com'});
test('paid is not fulfilled when access write fails; retry repairs access before analytics',async()=>{
 failAccess=true;await assert.rejects(fulfillPayUPayment(payload(),{verifiedByPayUApi:true}));assert.equal(payment.payment_status,'paid');assert.equal(payment.fulfilled_at,null);assert.equal(coreSavedAtAnalytics,false);
 failAccess=false;const res=await fulfillPayUPayment(payload(),{verifiedByPayUApi:true});assert.equal(res.success,true);assert.ok(payment.fulfilled_at);assert.equal(user.unlocked_features.palmReading,true);assert.equal(user.unlocked_features.birthChart,true);assert.equal(coreSavedAtAnalytics,true);
});
test('status repairs incomplete fulfillment and returns canonical identity and rupee amount',async()=>{
 payment.payment_status='paid';const response=await GET(new NextRequest('http://localhost/api/payu/status?txnid=fixture'));const data=await response.json();assert.equal(data.status,'paid');assert.equal(data.amount,659.62);assert.equal(data.userId,'canonical');assert.equal(verifyCount,1);assert.ok(payment.fulfilled_at);
 const again=await GET(new NextRequest('http://localhost/api/payu/status?txnid=fixture'));assert.equal((await again.json()).status,'paid');assert.equal(verifyCount,1,'fulfilled payment needs no further gateway query');
});
test('status does not report paid if access persistence fails',async()=>{
 failAccess=true;const response=await GET(new NextRequest('http://localhost/api/payu/status?txnid=fixture'));assert.equal(response.status,500);assert.equal((await response.json()).success,false);assert.equal(payment.fulfilled_at,null);
});
test('untrusted popup/return data cannot mark a payment paid and returns to server verification',async()=>{
 const res=await POST(new NextRequest('http://localhost/api/payu/success',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())}));assert.equal(res.status,303);assert.match(res.headers.get('location'),/payment\/processing\?txnid=fixture/);assert.equal(payment.payment_status,'created');
});

test('scheduled reconciliation includes paid-but-unfulfilled orders and repairs access with the browser closed',async()=>{
 process.env.CRON_SECRET='fixture-cron';payment.payment_status='paid';
 const response=await reconcile.GET(new NextRequest('http://localhost/api/cron/reconcile-payu-payments',{headers:{authorization:'Bearer fixture-cron'}}));
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.lookbackDays,2);assert.equal(data.maxRows,100);assert.match(reconciliationFilter,/and\(payment_status.eq.paid,fulfilled_at.is.null\)/);assert.ok(payment.fulfilled_at);assert.equal(user.unlocked_features.palmReading,true);
});

test('repeated successful callbacks do not regrant spent coins',async()=>{
 await fulfillPayUPayment(payload(),{verifiedByPayUApi:true});user.coins=2;
 const again=await fulfillPayUPayment(payload(),{verifiedByPayUApi:true});assert.equal(again.alreadyPaid,true);assert.equal(user.coins,2);
});

// Production schema regression: selecting OR writing timezone on user_profiles
// breaks paid-order fulfillment. Test both populated and absent birth snapshots.
test('real profile schema accepts full birth snapshot while timezone remains on users',async()=>{
 payment.birth_details_snapshot={birthDay:'12',birthMonth:'May',birthYear:'1994',birthHour:'10',birthMinute:'30',birthPeriod:'AM',knowsBirthTime:true,birthPlace:'Delhi',timezone:'Asia/Kolkata',gender:'male',sunSign:'Taurus'};
 const response=await GET(new NextRequest('http://localhost/api/payu/status?txnid=fixture'));
 assert.equal(response.status,200);assert.equal((await response.json()).status,'paid');
 assert.ok(payment.fulfilled_at);assert.equal(user.timezone,'Asia/Kolkata');
 assert.equal(Object.hasOwn(profile,'timezone'),false);assert.equal(profile.birth_place,'Delhi');assert.equal(profile.knows_birth_time,true);
 assert.equal(user.unlocked_features.palmReading,true);
});

test('legacy checkout email matching is read-only and never fulfils another email payment',async()=>{
 payment.customer_email='owner@example.com';
 for(const [email,matches] of [['other@example.com',false],[' OWNER@example.com ',true]]){
  const response=await GET(new NextRequest(`http://localhost/api/payu/status?txnid=fixture&checkoutEmail=${encodeURIComponent(email)}`));
  assert.deepEqual(await response.json(),{success:true,matchesCheckout:matches});
 }
 assert.equal(verifyCount,0);assert.equal(payment.payment_status,'created');assert.equal(payment.fulfilled_at,null);
});
