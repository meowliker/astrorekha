const assert = require('node:assert/strict');
const {test} = require('node:test');
const Module = require('node:module'), path = require('node:path'), fs = require('node:fs');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...rest); };
require('ts-node').register({transpileOnly:true, compilerOptions:{module:'CommonJS', moduleResolution:'node'}});
const {NextRequest} = require('next/server');
const admin = require('../src/lib/supabase-admin');
const session = require('../src/lib/report-session');
const market = require('../src/lib/customer-market');
const {quoteInrCoupon} = require('../src/lib/inr-coupons');
const redeem = require('../src/app/api/coupons/redeem/route');
const quoteApi = require('../src/app/api/coupons/quote/route');
const {DEFAULT_PRICING, normalizePricing} = require('../src/lib/pricing');
const {quotePaymentOrder} = require('../src/lib/payment-quote');
const hash = require('node:crypto').createHash('sha256').update('ASTROFREE').digest('hex');
function setup(t, {enabled=true, dbError=false}={}) {
  const calls=[];
  t.mock.method(admin, 'getSupabaseAdmin', () => ({
    from(table) { let filters={}; const q={ select(){return q}, eq(k,v){filters[k]=v;return q},
      async maybeSingle(){
        if(dbError) return {error:{code:'offline'}};
        if(table==='inr_free_coupons')return {data:filters.code_hash===hash?{id:'astrofree-v1',enabled}:null};
        if(table==='settings')return {data:{value:DEFAULT_PRICING}};
        throw new Error(`Unexpected table ${table}`);
      }}; return q;
    },
    async rpc(name,args){calls.push({name,args});return {data:{userId:args.p_user,email:'fixture@example.invalid',coins:15,unlockedFeatures:{palmReading:true}}};},
  }));
  t.mock.method(session,'reportSessionUser',()=> 'verified-user');
  t.mock.method(market,'customerMarket',async()=> 'IN');
  return calls;
}
function request(body, origin='https://astrorekha.com') {
  return new NextRequest('https://astrorekha.com/api/coupons/redeem', {method:'POST', headers:{origin,host:'astrorekha.com','Content-Type':'application/json'}, body:JSON.stringify(body)});
}
test('every active bundle keeps its normal entitlements; original prices are unchanged',async t=>{
  setup(t); const pricing=normalizePricing(DEFAULT_PRICING); pricing.bundles=pricing.bundles.map(p=>p.id==="palm-birth-sketch-aura-astro"?{...p,active:true}:p); const before=JSON.stringify(pricing);
  for(const plan of pricing.bundles.filter(p=>p.active)) {
    const result=await quoteInrCoupon({code:' astrofree ',type:'bundle',productId:plan.id,amount:0,features:['all'],coins:9999});
    assert.deepEqual(result.quote,quotePaymentOrder(pricing,{type:'bundle',bundleId:plan.id}));
  }
  assert.equal(JSON.stringify(pricing),before);
});
test('all available individual reports work; paused reports, coins, US and unrelated funnels do not',async t=>{
  setup(t);const {isReportAvailableForPurchase}=require('../src/lib/customer-report-visibility');
  for(const p of normalizePricing(DEFAULT_PRICING).reports) {
    const call=()=>quoteInrCoupon({code:'astrofree',type:'report',productId:p.id});
    if(p.active&&isReportAvailableForPurchase(p.feature)) assert.deepEqual((await call()).quote.features,[p.feature]);
    else await assert.rejects(call);
  }
  for(const type of ['coins','chat_pass','soulmate','us_main']) await assert.rejects(()=>quoteInrCoupon({code:'astrofree',type,productId:'anything'}));
  const calls=setup(t);t.mock.method(market,'customerMarket',async()=> 'US');
  assert.equal((await redeem.POST(request({code:'astrofree',type:'bundle',productId:'palm-reading'}))).status,400);
  assert.equal(calls.length,0);
});
test('invalid, disabled or unavailable coupons fail closed',async t=>{
  setup(t); await assert.rejects(()=>quoteInrCoupon({code:'incorrect',type:'bundle',productId:'palm-reading'}));
  setup(t,{enabled:false});await assert.rejects(()=>quoteInrCoupon({code:'astrofree',type:'bundle',productId:'palm-reading'}));
  setup(t,{dbError:true});await assert.rejects(()=>quoteInrCoupon({code:'astrofree',type:'bundle',productId:'palm-reading'}));
});
test('preview is read-only and returns a zero total; grant trusts session and server quote only',async t=>{
  const calls=setup(t), body={code:'astrofree',type:'bundle',productId:'palm-reading',userId:'victim',email:'victim@example.invalid',amount:999,coins:99999,features:['all']};
  const preview=await quoteApi.POST(request(body));assert.equal(preview.status,200);assert.equal((await preview.json()).amount,0);assert.equal(calls.length,0);
  const result=await redeem.POST(request(body));assert.equal(result.status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'redeem_inr_free_coupon');
  assert.equal(calls[0].args.p_user,'verified-user');assert.equal(calls[0].args.p_coins,15);assert.deepEqual(calls[0].args.p_features,['palmReading']);
  assert.equal(result.cookies.get('ar_report_session'),undefined);assert.equal(result.cookies.get('ar_access').value,'1');
});
test('cross-origin and unauthenticated grants are denied without writes',async t=>{
  const calls=setup(t),body={code:'astrofree',type:'bundle',productId:'palm-reading'};
  assert.equal((await redeem.POST(request(body,'https://attacker.invalid'))).status,403);
  t.mock.method(session,'reportSessionUser',()=>null);
  assert.equal((await redeem.POST(request(body))).status,401);assert.equal(calls.length,0);
});

// Run the actual migration/RPC against an isolated Postgres engine, never production.
test('SQL atomic grants preserve payments, block duplicates and US accounts, and can be disabled',async()=>{
  const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table users(id text primary key,email text,coins integer,unlocked_features jsonb,scans_allowed integer,updated_at timestamptz,payment_status text,bundle_purchased text);
      create table customer_markets(user_id text primary key,market text);
      insert into users values('in','in@example.invalid',10,'{"numerologyReport":true}',3,now(),'paid','previous-bundle'),('us','us@example.invalid',5,'{}',0,now(),'paid','us-bundle');
      insert into customer_markets values('us','US');`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261112200000_inr_free_coupons.sql'),'utf8'));
    const args=['astrofree-v1',hash,'in','bundle','palm-reading','Palm Reading',65962,JSON.stringify(['palmReading']),15];
    const call=(values=args)=>db.query('select redeem_inr_free_coupon($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) as result',values);
    const results=await Promise.all([call(),call(),call()]);
    assert.equal(results.filter(r=>!r.rows[0].result.alreadyRedeemed).length,1);
    const u=(await db.query("select * from users where id='in'")).rows[0];
    assert.equal(u.coins,25);assert.equal(u.scans_allowed,3);assert.equal(u.payment_status,'paid');assert.equal(u.bundle_purchased,'previous-bundle');
    assert.deepEqual(u.unlocked_features,{numerologyReport:true,palmReading:true});
    assert.equal((await db.query('select count(*)::int as n from inr_coupon_redemptions')).rows[0].n,1);
    assert.equal((await db.query('select amount_paise::int as n from inr_coupon_redemptions')).rows[0].n,0);
    const other=[...args];other[2]='us';await assert.rejects(()=>call(other),/INR/);
    const invalid=[...args];invalid[4]='invalid';invalid[7]='["unexpectedFeature"]';await assert.rejects(()=>call(invalid),/Unknown report/);
    const report=[...args];report[3]='report';report[4]='report-birth-chart';report[7]='["birthChart"]';report[8]=0;await call(report);
    assert.equal((await db.query("select coins from users where id='in'")).rows[0].coins,25);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>call(),/permission denied/);
      await assert.rejects(()=>db.query('select * from inr_free_coupons'),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('update inr_free_coupons set enabled=false');await assert.rejects(()=>call(),/inactive/);
  } finally {await db.close();}
});
