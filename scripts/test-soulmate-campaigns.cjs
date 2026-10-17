/* Offline shared-account regression tests: no real Meta mutations or data writes. */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path'), Module = require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const scope=require('../src/lib/soulmate-campaigns');
const {fetchSoulmateMetaSpend}=require('../src/lib/soulmate-meta-spend');
const {fetchMetaTrackingAccount,fetchMetaTrackingExactHourlySpend}=require('../src/lib/soulmate-tracking-meta');
const credential={accountId:'123456',accessToken:'fixture-token',campaignIds:['111111'],startDate:'2026-10-15',startTime:'11:30',active:true};
const day='2026-10-15';
function response(data){return Response.json(data)}
function fixtureFetch(url,options) {
 const u=new URL(url);assert.ok(!options?.method || options.method==='GET','All test calls must be read-only');
 if(u.pathname.endsWith('/campaigns')) return response({data:[{id:'111111',name:'Soulmate',effective_status:'ACTIVE'},{id:'222222',name:'Main',effective_status:'ACTIVE'}]});
 if(u.pathname.endsWith('/insights')) {
  assert.deepEqual(JSON.parse(u.searchParams.get('filtering')),[{field:'campaign.id',operator:'IN',value:['111111']}]);
  // Deliberately include an unselected campaign, even though the request filters it.
  return response({data:[['111111',100],['222222',900]].map(([id,spend])=>({campaign_id:id,campaign_name:id==='111111'?'Soulmate':'Main',date_start:day,spend:String(spend),impressions:'100',inline_link_clicks:'10',hourly_stats_aggregated_by_advertiser_time_zone:'00:00:00 - 00:59:59',actions:[{action_type:'purchase',value:id==='111111'?'2':'99'}]}))});
 }
 return response({name:'Shared account',currency:'USD',timezone_name:'America/Costa_Rica',timezone_offset_hours_utc:-6,balance:'999999'});
}
test('selection is required, bounded, numeric and deduplicated',()=>{
 for(const campaignIds of [undefined,[],['bad'],Array(101).fill('111111')]) assert.throws(()=>scope.selectedCampaignIds({...credential,campaignIds}),/Select/);
 assert.deepEqual(scope.selectedCampaignIds({...credential,campaignIds:['111111','111111']}),['111111']);
});
test('tracking totals, Meta purchases, daily GST inputs and hourly spend exclude other campaigns',async()=>{
 global.fetch=fixtureFetch;
 const result=await fetchMetaTrackingAccount(credential,{start:day,end:day},95,'business_1130_ist');
 assert.equal(result.account.error,undefined);
 assert.deepEqual(result.campaigns.map(row=>row.campaignId),['111111']);
 assert.equal(result.campaigns[0].spendInr,9500);
 assert.equal(result.campaigns[0].metaPurchases,2);
 assert.equal(result.dailySpendInr[day].total,9500);
 assert.deepEqual(Object.keys(result.hourlySpendInr),['meta:123456:111111']);
 const hourly=await fetchMetaTrackingExactHourlySpend(credential,day,95);
 assert.deepEqual(Object.keys(hourly.hourlySpendInr),['meta:123456:111111']);
 assert.equal(hourly.hourlySpendInr['meta:123456:111111'].reduce((a,b)=>a+b,0),9500);
});
test('profit spend is scoped before sums and never includes shared account balances',async()=>{
 global.fetch=fixtureFetch;
 const rows=await fetchSoulmateMetaSpend([credential],day,day,95,Date.parse('2026-10-16T12:00:00Z'));
 assert.equal(rows[0].adsInr,950000);assert.equal(rows[0].adsUsd,10000);
 assert.equal(rows[0].balance,null);assert.equal(rows[0].balanceCapturedAt,null);
 let calls=0;global.fetch=async()=>{calls++;throw new Error('Should not fetch without scope')};
 await assert.rejects(fetchSoulmateMetaSpend([{...credential,campaignIds:[]}],day,day,95),/Select/);assert.equal(calls,0);
});
test('campaign and ad-set ownership protects read/write endpoints on shared accounts',async()=>{
 let calls=0;
 global.fetch=async(url)=>{calls++;const id=new URL(url).pathname.split('/').pop();return response({id,account_id:'123456',campaign_id:'222222'})};
 await assert.rejects(scope.assertSoulmateCampaignObject(credential,'campaign','222222'),/not selected/);assert.equal(calls,0);
 await assert.rejects(scope.assertSoulmateCampaignObject(credential,'adset','333333'),/not in/);
 global.fetch=async(url)=>response({id:new URL(url).pathname.split('/').pop(),account_id:'123456',campaign_id:'111111'});
 await scope.assertSoulmateCampaignObject(credential,'adset','333333');
 global.fetch=async(url)=>response({id:new URL(url).pathname.split('/').pop(),account_id:'999999',campaign_id:'111111'});
 await assert.rejects(scope.assertSoulmateCampaignObject(credential,'adset','333333'),/not in/);
});
test('campaign picker paginates without exposing access tokens in returned options',async()=>{
 global.fetch=async(url,options)=>{
  const u=new URL(url);assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(u.searchParams.has('access_token'),false);
  return u.searchParams.has('after') ? response({data:[{id:'222222',name:'Paused campaign',effective_status:'PAUSED'}]}) : response({data:[{id:'111111',name:'Soulmate',effective_status:'ACTIVE'}],paging:{next:'yes',cursors:{after:'page2'}}});
 };
 const rows=await scope.listSoulmateCampaigns(credential);assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('fixture-token'));
});
