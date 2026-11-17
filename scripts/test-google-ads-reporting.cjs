const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {googleDestination,googleClockHours,aggregateGoogleSnapshot,googleSpendForDay,matchGoogleCampaign,validateGoogleRange,googleHourlySpendForDay}=require('../src/lib/google-ads-reporting');
function snapshot({zone='America/New_York',currency='USD',url='https://astrorekha.com/discover',hour=2,cost=2000000,landingCost=cost,date='2026-11-12'}={}){
 const campaign={id:'100',name:'Campaign',status:'ENABLED'};
 return {customer:{id:'4870113996',descriptiveName:'USA',currencyCode:currency,timeZone:zone},campaigns:[{campaign,campaignBudget:{amountMicros:'50000000'}}],destinations:[{campaign,adGroupAd:{ad:{finalUrls:[url]}}}],landing:[{campaign,segments:{date},landingPageView:{unexpandedFinalUrl:url},metrics:{costMicros:String(landingCost)}}],hours:[{campaign,segments:{date,hour},metrics:{costMicros:String(cost),clicks:'2',impressions:'10'}}],fetchedAt:'2026-11-13T00:00:00Z'};
}
test('route maps are exact and country never decides the destination',()=>{
 for(const [path,f]of [['/discover','astrorekha'],['/','astrorekha'],['/soulmate/discover','soulmate'],['/us/soulmate/discover','us-soulmate'],['/us','us-main']])assert.equal(googleDestination('https://astrorekha.com'+path+'?gclid=abc'),f);
 assert.equal(googleDestination('https://evil.com/discover'),null);assert.equal(googleDestination('https://astrorekha.com/discover-fake'),null);
});
test('dates cannot inject GAQL or accept invalid calendar dates',()=>{for(const d of ['2026-02-30',"2026-11-12'",'bad'])assert.throws(()=>validateGoogleRange(d,'2026-11-13'));assert.throws(()=>validateGoogleRange('2025-01-01','2026-11-13'));});
test('USA account cost to /discover is INR main cost, not US main cost',()=>{
 const raw=snapshot(), r=aggregateGoogleSnapshot(raw,'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 assert.equal(r.campaigns[0].spend,2);assert.equal(r.dailySpendInr['2026-11-12'].total,180);assert.equal(r.campaigns[0].clicks,2);assert.equal(r.account.error,undefined);
 const us=aggregateGoogleSnapshot(raw,'us-main','2026-11-12','2026-11-12','business_1130_ist',90);assert.equal(us.campaigns.length,0);assert.equal(us.dailySpendInr['2026-11-12'].total,0);
});
test('US Soulmate remains USD and never gets INR main cost',()=>{
 const raw=snapshot({url:'https://astrorekha.com/us/soulmate/discover'}),r=aggregateGoogleSnapshot(raw,'us-soulmate','2026-11-12','2026-11-12','business_1130_ist',90);
 assert.equal(r.dailySpendInr['2026-11-12'].total,2);assert.equal(r.dailySpendInr['2026-11-12'].indian,0);
});
test('reported historical destination wins over the current edited ad URL',()=>{
 const raw=snapshot();raw.destinations[0].adGroupAd.ad.finalUrls=['https://astrorekha.com/us/soulmate/discover'];
 const r=aggregateGoogleSnapshot(raw,'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);assert.equal(r.dailySpendInr['2026-11-12'].total,180);
 const other=aggregateGoogleSnapshot(raw,'us-soulmate','2026-11-12','2026-11-12','business_1130_ist',90);assert.equal(other.dailySpendInr['2026-11-12'].total,0);
});
test('partial clock hour is unavailable, never divided by two',()=>{
 const r=aggregateGoogleSnapshot(snapshot({zone:'Asia/Calcutta',currency:'INR',hour:11}),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 assert.ok(r.account.error);assert.equal(r.campaigns[0].spendInr,null);assert.equal(googleSpendForDay({complete:false,accounts:[r]},'2026-11-12'),null);
});
test('full days may be exact while offset hourly cells remain unavailable',()=>{
 const r=aggregateGoogleSnapshot(snapshot({zone:'Asia/Calcutta',currency:'INR',hour:12}),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 assert.equal(r.account.error,undefined);assert.equal(r.campaigns[0].spendInr,2);assert.equal(r.campaigns[0].hourlySpendUnavailable,true);
});
test('incomplete landing coverage and mixed funnels cannot create a fabricated profit',()=>{
 const raw=snapshot({landingCost:1000000});let r=aggregateGoogleSnapshot(raw,'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);assert.ok(r.account.error);
 raw.landing.push({...raw.landing[0],landingPageView:{unexpandedFinalUrl:'https://astrorekha.com/us/soulmate/discover'}});
 r=aggregateGoogleSnapshot(raw,'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);assert.ok(r.account.error);assert.equal(r.dailySpendInr['2026-11-12'].total,0);
});
test('DST is respected and repeated clock hour does not duplicate spend',()=>{
 assert.equal(googleClockHours('2026-11-01','America/New_York').get(1).length,2);assert.equal(googleClockHours('2026-03-08','America/New_York').has(2),false);
 const raw=snapshot({date:'2026-11-01',hour:1});const r=aggregateGoogleSnapshot(raw,'astrorekha','2026-10-31','2026-11-01','business_1130_ist',90);
 assert.ok(r.account.error,'repeated hour straddles business-day boundary');
});
test('zero spend is different from unavailable and explicit saved campaign matches cannot cross networks',()=>{
 const r=aggregateGoogleSnapshot(snapshot({cost:0}),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);assert.equal(r.campaigns[0].spendInr,0);assert.equal(r.account.error,undefined);
 const rows=[...r.campaigns,{...r.campaigns[0],network:'meta'}];assert.equal(matchGoogleCampaign(rows,'100'),rows[0]);assert.equal(matchGoogleCampaign(rows,'Campaign'),rows[0]);assert.equal(matchGoogleCampaign(rows,'unknown'),undefined);assert.equal(matchGoogleCampaign([...rows,rows[0]],'Campaign'),undefined);
});

test('hourly endpoint flattens the requested date into 24 numeric cells',()=>{
 const r=aggregateGoogleSnapshot(snapshot(),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 const flat=googleHourlySpendForDay({accounts:[r]},'2026-11-12');assert.equal(flat[r.campaigns[0].key].length,24);assert.equal(flat[r.campaigns[0].key][1],180);
 assert.equal(flat[r.campaigns[0].key].reduce((a,b)=>a+b,0),180);
});

test('account list hides unrelated accounts but incomplete reads still block complete spend',()=>{
 const {googleSpendReport}=require('../src/lib/google-ads-reporting');
 const own=aggregateGoogleSnapshot(snapshot(),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 const other=aggregateGoogleSnapshot(snapshot(),'us-main','2026-11-12','2026-11-12','business_1130_ist',90);
 const results=[own,other].map(report=>({report,fetchedAt:'2026-11-13T00:00:00Z'}));
 let result=googleSpendReport(results);assert.equal(result.accounts.length,1);assert.equal(result.complete,true);
 other.account.error='Access unavailable';other.warnings=['Access unavailable'];result=googleSpendReport(results);assert.equal(result.accounts.length,2);assert.equal(result.complete,false);assert.deepEqual(result.warnings,['Access unavailable']);assert.equal(googleSpendForDay(result,'2026-11-12'),null);
});

test('zero-cost boundary impressions cannot suppress exact spend',()=>{
 const r=aggregateGoogleSnapshot(snapshot({zone:'Asia/Calcutta',currency:'INR',hour:11,cost:0}),'astrorekha','2026-11-12','2026-11-12','business_1130_ist',90);
 assert.equal(r.account.error,undefined);
 assert.deepEqual(googleSpendForDay({complete:true,accounts:[r]},'2026-11-12'),{total:0,indian:0});
});
test('paid split hours bound both days and leave unrelated days exact',()=>{
 const {googleSpendBoundsForDay,googleSpendReport}=require('../src/lib/google-ads-reporting');
 const r=aggregateGoogleSnapshot(snapshot({zone:'Asia/Calcutta',currency:'INR',hour:11}),'astrorekha','2026-11-11','2026-11-13','business_1130_ist',90);
 const report=googleSpendReport([{report:r,fetchedAt:'now'}]);
 for(const date of ['2026-11-11','2026-11-12'])assert.deepEqual(googleSpendBoundsForDay(report,date),{total:{min:0,max:2},indian:{min:0,max:2}});
 assert.equal(googleSpendForDay(report,'2026-11-12'),null);
 assert.deepEqual(googleSpendForDay(report,'2026-11-13'),{total:0,indian:0});
});
test('unknown attribution never produces a numeric range',()=>{
 const {googleSpendBoundsForDay,googleSpendReport}=require('../src/lib/google-ads-reporting');
 const r=aggregateGoogleSnapshot(snapshot({landingCost:1}),'astrorekha','2026-11-12','2026-11-13','business_1130_ist',90);
 const report=googleSpendReport([{report:r,fetchedAt:'now'}]);
 assert.equal(googleSpendBoundsForDay(report,'2026-11-12'),null);
 assert.deepEqual(googleSpendForDay(report,'2026-11-13'),{total:0,indian:0});
});
test('profit bounds use GST credit correctly and totals cannot become false zero',()=>{
 const {profitFinancialBounds,sumProfitFinancialBounds}=require('../src/lib/profit-financial-bounds');
 const b=profitFinancialBounds({total:{min:100,max:200},indian:{min:50,max:150}},1000,.18,'2026-11-12',100);
 assert.deepEqual(b.netRevenue,{min:629,max:747});
 assert.deepEqual(b.gst,{min:153,max:171});
 assert.equal(sumProfitFinancialBounds([{adsCostINR:null,adsCostUSD:null,gst:null,netRevenue:null}]),undefined);
 assert.deepEqual(sumProfitFinancialBounds([{financialBounds:b}]).netRevenue,b.netRevenue);
});

test('account-day view returns original integer micros without splitting India or USA hours',()=>{
 const {aggregateGoogleAccountDays}=require('../src/lib/google-ads-reporting');
 for(const zone of ['Asia/Calcutta','America/New_York']){
  const raw=snapshot({zone,currency:zone==='Asia/Calcutta'?'INR':'USD',hour:11,cost:314800000});
  const result=aggregateGoogleAccountDays(raw,'astrorekha','2026-11-12','2026-11-12',Date.parse('2026-11-20'));
  assert.equal(result.currency,raw.customer.currencyCode);assert.equal(result.timezone,zone);
  assert.deepEqual(result.rows,[{date:'2026-11-12',costMicros:314800000,status:'reported'}]);
  assert.equal(result.error,undefined);
 }
});
test('account-day totals preserve repeated DST hour once and do not include adjacent dates',()=>{
 const {aggregateGoogleAccountDays}=require('../src/lib/google-ads-reporting');
 const raw=snapshot({date:'2026-11-01',hour:1,cost:2345678});
 raw.hours.push({...raw.hours[0],segments:{date:'2026-11-02',hour:1},metrics:{costMicros:'999000000'}});
 const result=aggregateGoogleAccountDays(raw,'astrorekha','2026-11-01','2026-11-01',Date.parse('2026-11-20'));
 assert.equal(result.rows[0].costMicros,2345678);
 const spring=aggregateGoogleAccountDays(snapshot({date:'2026-03-08',hour:3}),'astrorekha','2026-03-08','2026-03-08',Date.parse('2026-11-20'));
 assert.equal(spring.rows[0].costMicros,2000000);
});
test('account-day view never counts another workspace or turns missing coverage into zero',()=>{
 const {aggregateGoogleAccountDays}=require('../src/lib/google-ads-reporting');
 const raw=snapshot({url:'https://astrorekha.com/us/soulmate/discover'});
 const other=aggregateGoogleAccountDays(raw,'astrorekha','2026-11-12','2026-11-12',Date.parse('2026-11-20'));
 assert.equal(other.rows[0].costMicros,0);
 const missing=aggregateGoogleAccountDays(snapshot({landingCost:1}),'astrorekha','2026-11-12','2026-11-12',Date.parse('2026-11-20'));
 assert.equal(missing.rows[0].costMicros,null);assert.equal(missing.rows[0].status,'unavailable');
});
test('today and future labels follow the account timezone rather than the viewer timezone',()=>{
 const {aggregateGoogleAccountDays}=require('../src/lib/google-ads-reporting');
 const now=Date.parse('2026-11-13T01:00:00Z');
 const usa=aggregateGoogleAccountDays(snapshot(),'astrorekha','2026-11-12','2026-11-13',now);
 assert.equal(usa.rows[0].status,'updating');assert.equal(usa.rows[1].status,'not_started');assert.equal(usa.rows[1].costMicros,null);
 const india=aggregateGoogleAccountDays(snapshot({zone:'Asia/Calcutta',currency:'INR'}),'astrorekha','2026-11-12','2026-11-13',now);
 assert.equal(india.rows[0].status,'reported');assert.equal(india.rows[1].status,'updating');
});

test('account day windows honor IST and both New York DST boundaries',()=>{
 const {googleAccountDayWindow,googleAccountDate}=require('../src/lib/google-ads-reporting');
 const ist=googleAccountDayWindow('2026-11-12','Asia/Calcutta');
 assert.equal(new Date(ist.start).toISOString(),'2026-11-11T18:30:00.000Z');
 assert.equal(ist.end-ist.start,24*3600000);
 for(const [date,hours] of [['2026-03-08',23],['2026-11-01',25]]){
  const w=googleAccountDayWindow(date,'America/New_York');assert.equal(w.end-w.start,hours*3600000);
  assert.equal(googleAccountDate(w.start,'America/New_York'),date);assert.equal(googleAccountDate(w.end-1,'America/New_York'),date);assert.notEqual(googleAccountDate(w.end,'America/New_York'),date);
 }
});
test('account attribution requires a unique saved campaign, never currency or funnel alone',()=>{
 const {googleOrderAccount}=require('../src/lib/google-ads-reporting');
 const campaigns=[{id:'100',name:'USA campaign',accountId:'usa'},{id:'200',name:'India campaign',accountId:'india'},{id:'300',name:'Shared',accountId:'usa'},{id:'400',name:'Shared',accountId:'india'}];
 assert.equal(googleOrderAccount({last_touch:{gad_campaignid:'100'}},campaigns),'usa');
 assert.equal(googleOrderAccount({utm_campaign:'India campaign'},campaigns),'india');
 assert.equal(googleOrderAccount({landing_url:'https://astrorekha.com/discover?gad_campaignid=200'},campaigns),'india');
 assert.equal(googleOrderAccount({utm_campaign:'Shared'},campaigns),null);
 assert.equal(googleOrderAccount({currency:'USD',landing_url:'https://astrorekha.com/discover?gclid=abc'},campaigns),null);
});
