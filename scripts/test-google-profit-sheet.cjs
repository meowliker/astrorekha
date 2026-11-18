const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {googleProfitRow,googleProfitCacheKey,usGoogleFinanceDay}=require('../src/lib/google-profit-sheet');
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
test('the primary section uses its account day and unmatched orders are queried separately',async()=>{
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
  assert.equal(source,'google');assert.equal(mode,'account_day');assert.equal(scope.timezone,googleProfitRegion(requested.funnel).timezone);
  return scope.include({id:'unique-order',google_campaign_id:'verified-campaign'},'2026-11-14T12:00:00Z') ? [day] : [];
 };
 cache.cachedProfitReport=async(_db,key,load)=>{assert.match(key,/^[a-f0-9]{64}$/);return load();};
 try{
  for(const funnel of ['astrorekha','soulmate','us-main','us-soulmate']){
   const response=await googleProfitResponse(new Request('https://astrorekha.com/api/admin/profit?start=2026-11-14&end=2026-11-16&exchangeRate=90'),funnel);
   assert.equal(response.status,200);const result=await response.json();
   assert.deepEqual(requested,{id:googleProfitRegion(funnel).id,funnel});
   assert.equal(result.account.id,googleProfitRegion(funnel).id);assert.equal(result.attributionComplete,true);
   assert.equal(result.rows.length,1); const expected = funnel==='us-main'?{...googleProfitRow(usGoogleFinanceDay(day,day,90),1000000,result.account,funnel,90,true),originalInrReceived:day.received,originalInrRefund:day.refund,originalInrOrders:day.orders}:googleProfitRow(day,1000000,result.account,funnel,90,true);assert.deepEqual(result.rows[0],expected);
  }
 }finally{
  [reporting.readGoogleProfitContext,finance.readAdSourceFinance,cache.cachedProfitReport]=originals;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});

test('USA historical INR receipts appear only in the US main workspace; unmatched receipts remain separate',async()=>{
 const reporting=require('../src/lib/google-ads-reporting'),finance=require('../src/lib/admin-source-finance'),cache=require('../src/lib/profit-report-cache');
 const originals=[reporting.readGoogleProfitContext,finance.readAdSourceFinance,cache.cachedProfitReport];
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
 const india={id:'6752275511',name:'Astro India',currency:'INR',timezone:'Asia/Calcutta',rows:[{date:day.date,costMicros:2000000,status:'reported'}]};
 const usa={id:'4870113996',name:'Astro USA',currency:'USD',timezone:'America/New_York',rows:[{date:day.date,costMicros:1000000,status:'reported'}]};
 reporting.readGoogleProfitContext=async(id)=>({account:id===usa.id?usa:india,accounts:[india,usa],campaigns:[{id:'us-campaign',name:'USA campaign',accountId:usa.id}],fetchedAt:'2026-11-18T10:00:00Z'});
 finance.readAdSourceFinance=async(_db,funnel,source,_start,_end,_mode,scope)=>{
  assert.ok(['astrorekha','us-main'].includes(funnel));assert.equal(source,'google');
  const base={...day,received:0,bundleReceived:0,bundleOrders:0,orders:0};
  for(const campaign of funnel==='astrorekha'?['us-campaign','unmatched']:[]){
   if(scope.include({id:campaign,google_campaign_id:campaign},'2026-11-14T12:00:00Z')) {
    if(campaign==='us-campaign'){assert.equal(scope.timezone,usa.timezone);base.received+=296888;base.orders+=4;}
    else {base.received+=4366;base.orders++;}
   }
  }
  return [base];
 };
 cache.cachedProfitReport=async(_db,_key,load)=>load();
 try{
  const response=await googleProfitResponse(new Request('https://astrorekha.com/api/admin/profit?start=2026-11-14&end=2026-11-16&exchangeRate=90'),'astrorekha');
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.rows[0].salesCount,0);assert.equal(data.rows[0].adsCostINR,2);
  assert.equal(data.additionalReports.length,0);const us=await (await googleProfitResponse(new Request('https://astrorekha.com/api/admin/profit?start=2026-11-14&end=2026-11-16&exchangeRate=90'),'us-main')).json();
  assert.equal(us.account.id,usa.id);assert.equal(us.rows[0].orders,4);assert.equal(us.rows[0].originalInrReceived,296888);assert.equal(us.rows[0].received,3299);assert.equal(us.rows[0].adsUsd,100);
  assert.equal(data.unassigned.rows[0].orders,1);assert.deepEqual(data.unassigned.campaigns,['unmatched']);
  assert.equal(data.attributionComplete,true);assert.equal(us.attributionComplete,true);
 }finally{
  [reporting.readGoogleProfitContext,finance.readAdSourceFinance,cache.cachedProfitReport]=originals;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});

test('INR conversion preserves refunds, original money and the existing tax formula without changing inputs',()=>{
 const zero={...day,received:0,refund:0,orders:0,refunds:0,bundleReceived:0,bundleRefund:0,bundleOrders:0,salesTax:0};
 const legacy={...day,received:296888,refund:65962,orders:4,refunds:1};
 const before=JSON.stringify(legacy);const combined=usGoogleFinanceDay(zero,legacy,93.96);
 assert.equal(JSON.stringify(legacy),before);assert.equal(combined.originalInrReceived,296888);assert.equal(combined.originalInrRefund,65962);
 assert.equal(combined.received,Math.round(296888/93.96));assert.equal(combined.refund,Math.round(65962/93.96));
 const old=googleProfitRow(legacy,0,{id:'usa',name:'USA',currency:'USD'},'astrorekha',93.96,true);
 assert.equal(combined.salesTax,Math.round(Math.round(old.gst*100)/93.96));assert.throws(()=>usGoogleFinanceDay(zero,legacy,0));
});
