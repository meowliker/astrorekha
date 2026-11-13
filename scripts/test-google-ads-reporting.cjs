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
