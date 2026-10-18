/* Offline shared-account regression tests: no real Meta mutations or data writes. */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path'), Module = require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const scope=require('../src/lib/us-soulmate-campaigns');
const {fetchSoulmateMetaSpend}=require('../src/lib/us-soulmate-meta-spend');
const {fetchMetaTrackingAccount,fetchMetaTrackingExactHourlySpend}=require('../src/lib/us-soulmate-tracking-meta');
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
test('tracking totals, Meta purchases, daily spend and hourly spend exclude other campaigns',async()=>{
 global.fetch=fixtureFetch;
 const result=await fetchMetaTrackingAccount(credential,{start:day,end:day},1,'business_1130_ist');
 assert.equal(result.account.error,undefined);
 assert.deepEqual(result.campaigns.map(row=>row.campaignId),['111111']);
 assert.equal(result.campaigns[0].spendInr,100);
 assert.equal(result.campaigns[0].metaPurchases,2);
 assert.equal(result.dailySpendInr[day].total,100);
 assert.deepEqual(Object.keys(result.hourlySpendInr),['meta:123456:111111']);
 const hourly=await fetchMetaTrackingExactHourlySpend(credential,day,1);
 assert.deepEqual(Object.keys(hourly.hourlySpendInr),['meta:123456:111111']);
 assert.equal(hourly.hourlySpendInr['meta:123456:111111'].reduce((a,b)=>a+b,0),100);
});
test('profit spend is scoped before sums and never includes shared account balances',async()=>{
 global.fetch=fixtureFetch;
 const rows=await fetchSoulmateMetaSpend([credential],day,day,1,Date.parse('2026-10-16T12:00:00Z'));
 assert.equal(rows[0].adsInr,10000);assert.equal(rows[0].adsUsd,10000);
 assert.equal(rows[0].balance,null);assert.equal(rows[0].balanceCapturedAt,null);
 let calls=0;global.fetch=async()=>{calls++;throw new Error('Should not fetch without scope')};
 await assert.rejects(fetchSoulmateMetaSpend([{...credential,campaignIds:[]}],day,day,1),/Select/);assert.equal(calls,0);
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

const settingsModule=require('../src/lib/us-soulmate-profit-settings');
test('saved US settings retain their own token, persist the selection, and redact secrets',()=>{
 const [saved]=settingsModule.validateSoulmateAccounts([{...credential,accessToken:'',campaignIds:['111111','111111']}],[credential]);
 assert.equal(saved.accessToken,credential.accessToken);assert.deepEqual(saved.campaignIds,['111111']);
 const publicSettings=settingsModule.publicSoulmateSettings({accounts:[saved],revision:2,exchange_rate:1});
 assert.deepEqual(publicSettings.accounts[0].campaignIds,['111111']);
 assert.equal(publicSettings.accounts[0].hasAccessToken,true);
 assert.ok(!JSON.stringify(publicSettings).includes('fixture-token'));
});
const state={settings:{accounts:[credential],revision:3,exchange_rate:1},rows:[],calls:[]};
const db={from(table){
 assert.ok(['us_soulmate_admin_settings','us_soulmate_profit_sheet','admin_sessions'].includes(table),'No other flow settings or tables');
 const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},
 single:async()=>({data:state.settings,error:null}),maybeSingle:async()=>({data:{id:'fixture',expires_at:'2099-01-01'},error:null}),
 then(a,b){return Promise.resolve({data:state.rows,error:null}).then(a,b)}};return q;
},async rpc(name,args){state.calls.push({name,args});return {data:4,error:null}}};
const adminPath=require.resolve('../src/lib/us-soulmate-admin');
require.cache[adminPath]={id:adminPath,filename:adminPath,loaded:true,exports:{soulmateAdmin:async req=>req.headers.get('authorization')==='Bearer fixture'?db:null}};
const supabasePath=require.resolve('../src/lib/supabase-admin');
require.cache[supabasePath]={id:supabasePath,filename:supabasePath,loaded:true,exports:{getSupabaseAdmin:()=>db}};
const accountsRoute=require('../src/app/api/admin/us-soulmate/ad-accounts/route');
const pickerRoute=require('../src/app/api/admin/us-soulmate/ad-accounts/campaigns/route');
const budgetRoute=require('../src/app/api/admin/us-soulmate/tracking/budget/route');
const bidRoute=require('../src/app/api/admin/us-soulmate/tracking/bid/route');
const {NextRequest}=require('next/server');
const request=(body,auth=true)=>new NextRequest('http://localhost/api/admin/us-soulmate/ad-accounts',{
 method:'POST',headers:auth?{'authorization':'Bearer fixture','x-admin-session':'fixture'}:{},body:JSON.stringify(body)});
test('picker and save routes enforce auth, ownership and revision before saving only US settings',async()=>{
 state.calls=[];global.fetch=async()=>{throw new Error('Unexpected Meta read')};
 assert.equal((await pickerRoute.POST(request({accountId:credential.accountId},false))).status,401);
 assert.equal((await accountsRoute.PUT(request({accounts:[credential],revision:3},false))).status,401);
 assert.equal((await accountsRoute.PUT(request({accounts:[credential],revision:2}))).status,409);
 global.fetch=async()=>Response.json({data:[{id:'111111',name:'US campaign',effective_status:'ACTIVE'}]});
 const listed=await pickerRoute.POST(request({accountId:credential.accountId}));assert.equal(listed.status,200);
 assert.ok(!JSON.stringify(await listed.json()).includes('fixture-token'));
 const invalid=await accountsRoute.PUT(request({accounts:[{...credential,campaignIds:['222222']}],revision:3}));
 assert.equal(invalid.status,400);assert.equal(state.calls.length,0);
 const saved=await accountsRoute.PUT(request({accounts:[{...credential,accessToken:''}],revision:3,exchangeRate:95}));
 assert.equal(saved.status,200);assert.equal(state.calls[0].name,'save_us_soulmate_profit_settings');
 assert.deepEqual(state.calls[0].args.p_accounts[0].campaignIds,['111111']);assert.equal(state.calls[0].args.p_rate,1);
 assert.ok(!JSON.stringify(await saved.json()).includes('fixture-token'));
});
test('budget and bid routes refuse unselected campaigns before any external write',async()=>{
 let reads=0;global.fetch=async(url,init)=>{
  assert.ok(!init?.method || init.method==='GET','No Meta write permitted');reads++;
  return Response.json({id:new URL(url).pathname.split('/').pop(),account_id:'123456',campaign_id:'222222'});
 };
 const input={accountId:'123456',id:'222222',level:'campaign',type:'daily',expectedAmountMinor:100,newAmountMinor:200};
 assert.equal((await budgetRoute.POST(request(input,false))).status,401);
 assert.equal((await budgetRoute.POST(request(input))).status,403);assert.equal(reads,0);
 assert.equal((await budgetRoute.POST(request({...input,id:'333333',level:'adset'}))).status,403);
 assert.equal((await bidRoute.POST(request({accountId:'123456',adsetId:'333333',expectedAmountMinor:100,newAmountMinor:200}))).status,403);
});
test('legacy account-wide profit and outdated selections are hidden until recalculation',async()=>{
 global.fetch=async()=>{throw new Error('Cached ledger reads must not call external services')};
 const {readSoulmateProfitLedger}=require('../src/lib/us-soulmate-profit-ledger');
 for(const [revision,adScope,stale] of [[3,undefined,true],[2,'selected_campaigns_v1',true],[3,'selected_campaigns_v1',false]]){
  state.rows=[{date:day,config_revision:revision,synced_at:'2026-10-16T00:00:00Z',data:{date:day,received:4366,adsInr:100,profit:3600,roas:43.66,balance:999,adScope}}];
  const result=await readSoulmateProfitLedger(db,day,day);
  assert.equal(result.rows[0].stale,stale);assert.equal(result.rows[0].received,4366);
  assert.equal(result.rows[0].adsInr,stale?null:100);assert.equal(result.rows[0].profit,stale?null:3600);assert.equal(result.rows[0].balance,null);
 }
});
