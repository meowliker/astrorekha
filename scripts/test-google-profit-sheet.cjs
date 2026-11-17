const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {googleProfitRow,googleProfitCacheKey}=require('../src/lib/google-profit-sheet');
const day={date:'2026-11-14',received:118000,refund:0,orders:1,refunds:0,bundleReceived:118000,bundleRefund:0,bundleOrders:1,salesTax:18000,gateways:{}};
test('native Google cost converts once and preserves workspace financial formulas',()=>{
 const usa={id:'usa',name:'USA',currency:'USD'},india={id:'india',name:'India',currency:'INR'};
 const row=googleProfitRow(day,1000000,usa,'astrorekha',90,true);
 assert.equal(row.adsCostUSD,1);assert.equal(row.adsCostINR,90);assert.equal(row.netRevenue,1180-212.4-90);assert.equal(row.financialBounds,undefined);
 const indian=googleProfitRow(day,90000000,india,'astrorekha',90,true);assert.equal(indian.gst,196.2);assert.equal(indian.netRevenue,1180-196.2-90);
 const us=googleProfitRow(day,90000000,india,'us-main',90,true);assert.equal(us.adsInr,100);assert.equal(us.profit,99900);
});
test('missing attribution never manufactures exact profit but preserves exact spend',()=>{
 const row=googleProfitRow(day,1000000,{id:'usa',name:'USA',currency:'USD'},'astrorekha',90,false);
 assert.equal(row.adsCostINR,90);assert.equal(row.netRevenue,null);assert.equal(row.roas,null);assert.equal(row.spendUnavailable,false);assert.equal(row.profitUnavailable,true);
 const missing=googleProfitRow(day,null,{id:'usa',name:'USA',currency:'USD'},'astrorekha',90,true);assert.equal(missing.adsCostINR,null);assert.equal(missing.netRevenue,null);
});
test('saved reports separate account, workspace, dates and FX without including credentials',()=>{
 const key=(f='astrorekha',a='4870113996',s='2026-11-14',e='2026-11-16',r=null)=>googleProfitCacheKey(f,a,s,e,r);
 assert.equal(new Set([key(),key('us-main'),key('astrorekha','6752275511'),key('astrorekha','4870113996','2026-11-15'),key('astrorekha','4870113996','2026-11-14','2026-11-16','90')]).size,5);
});

const {googleProfitRegion,googleProfitToday}=require('../src/lib/google-profit-region');
const {googleProfitResponse}=require('../src/lib/google-profit-sheet');
test('Indian and US workspaces use their own Google account and calendar day',()=>{
 for(const funnel of ['astrorekha','soulmate']) {
  assert.equal(googleProfitRegion(funnel).id,'6752275511');
  assert.equal(googleProfitRegion(funnel).timezone,'Asia/Calcutta');
  assert.equal(googleProfitToday(funnel,new Date('2026-11-17T02:00:00Z')),'2026-11-17');
 }
 for(const funnel of ['us-main','us-soulmate']) {
  assert.equal(googleProfitRegion(funnel).id,'4870113996');
  assert.equal(googleProfitRegion(funnel).timezone,'America/New_York');
  assert.equal(googleProfitToday(funnel,new Date('2026-11-17T02:00:00Z')),'2026-11-16');
  // New York observes daylight saving; it is not a fixed IST/UTC offset.
  assert.equal(googleProfitToday(funnel,new Date('2026-07-17T04:30:00Z')),'2026-07-17');
  assert.equal(googleProfitToday(funnel,new Date('2026-11-17T04:30:00Z')),'2026-11-16');
 }
});
test('a stale or tampered account selector cannot cross workspace regions',async()=>{
 for(const funnel of ['astrorekha','soulmate','us-main','us-soulmate']) {
  const wrong=googleProfitRegion(funnel).id==='6752275511'?'4870113996':'6752275511';
  const response=await googleProfitResponse(new Request(`https://astrorekha.com/api/admin/profit?start=2026-11-14&end=2026-11-16&googleAccount=${wrong}`),funnel);
  assert.equal(response.status,400);
  assert.match((await response.json()).error,new RegExp(googleProfitRegion(funnel).name));
 }
});
test('requests without an account select the workspace region for both spend and receipts',async()=>{
 const reporting=require('../src/lib/google-ads-reporting');
 const finance=require('../src/lib/admin-source-finance');
 const cache=require('../src/lib/profit-report-cache');
 const originals=[reporting.readGoogleProfitContext,finance.readAdSourceFinance,cache.cachedProfitReport];
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 let requested;
 reporting.readGoogleProfitContext=async(id,funnel)=>{
  const region=googleProfitRegion(funnel);assert.equal(id,region.id);requested={id,funnel};
  return {account:{...region,currency:id==='6752275511'?'INR':'USD',rows:[{date:day.date,costMicros:1000000}]},campaigns:[{id:'verified-campaign',name:'Verified',accountId:id}],fetchedAt:'2026-11-17T10:00:00Z'};
 };
 finance.readAdSourceFinance=async(_db,funnel,source,_start,_end,mode,scope)=>{
  assert.equal(source,'google');assert.equal(mode,'account_day');assert.equal(scope.timezone,googleProfitRegion(funnel).timezone);
  assert.equal(scope.include({id:'unique-order',google_campaign_id:'verified-campaign'},'2026-11-14T12:00:00Z'),true);
  return [day];
 };
 cache.cachedProfitReport=async(_db,key,load)=>{assert.match(key,/^[a-f0-9]{64}$/);return load();};
 try{
  for(const funnel of ['astrorekha','soulmate','us-main','us-soulmate']){
   const response=await googleProfitResponse(new Request('https://astrorekha.com/api/admin/profit?start=2026-11-14&end=2026-11-16&exchangeRate=90'),funnel);
   assert.equal(response.status,200);const result=await response.json();
   assert.deepEqual(requested,{id:googleProfitRegion(funnel).id,funnel});
   assert.equal(result.account.id,googleProfitRegion(funnel).id);assert.equal(result.attributionComplete,true);
   assert.equal(result.rows.length,1);assert.deepEqual(result.rows[0],googleProfitRow(day,1000000,result.account,funnel,90,true));
  }
 }finally{
  [reporting.readGoogleProfitContext,finance.readAdSourceFinance,cache.cachedProfitReport]=originals;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
