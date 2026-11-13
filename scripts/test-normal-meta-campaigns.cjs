const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(n,p,...args){return resolve.call(this,n.startsWith('@/')?path.join(__dirname,'../src',n.slice(2)):n,p,...args)};
const {scopeNormalMetaCredentials,normalCampaignFilter,assertNormalMetaObject}=require('../src/lib/normal-meta-campaigns');
const {fetchMetaTrackingAccount,fetchMetaTrackingExactHourlySpend}=require('../src/lib/soulmate-tracking-meta');
const cred={accountId:'123456',accessToken:'private-fixture',active:true,startDate:'2026-10-15',startTime:'11:30'};
function db(fail=false){return {from(table){return {select(){return this},eq(){return this},single:async()=>({error:fail?{}:null,data:{accounts:table==='soulmate_admin_settings'?[{accountId:'123456',campaignIds:['222222'],active:false},{accountId:'654321',campaignIds:['333333']}]:[]}})}}}}
test('main workspace excludes reserved historical campaigns, hides fully reserved accounts, and scopes every spend bucket',async()=>{
 global.fetch=async(input)=>{const u=new URL(input);if(u.pathname.endsWith('/campaigns'))return Response.json({data:u.pathname.includes('654321')?[{id:'333333',name:'Other only'}]:[{id:'111111',name:'Main'},{id:'222222',name:'Soulmate'}]});
 if(u.pathname.endsWith('/insights')){assert.deepEqual(JSON.parse(u.searchParams.get('filtering')),[{field:'campaign.id',operator:'IN',value:['111111']}]);return Response.json({data:['111111','222222'].map((id,i)=>({campaign_id:id,date_start:'2026-11-12',spend:String(i?900:100),hourly_stats_aggregated_by_advertiser_time_zone:'00:00:00 - 00:59:59',actions:[{action_type:'purchase',value:String(i?90:1)}]}))});}
 return Response.json({name:'Shared',currency:'USD',timezone_name:'America/Costa_Rica',timezone_offset_hours_utc:-6});};
 const scoped=await scopeNormalMetaCredentials(db(),[cred,{...cred,accountId:'654321'}]);assert.equal(scoped.length,1);assert.deepEqual(scoped[0].campaignIds,['111111']);
 const r=await fetchMetaTrackingAccount(scoped[0],{start:'2026-11-12',end:'2026-11-12'},90);assert.equal(r.account.error,undefined);assert.deepEqual(r.campaigns.map(c=>c.campaignId),['111111']);assert.equal(r.dailySpendInr['2026-11-12'].total,9000);assert.equal(r.campaigns[0].metaPurchases,1);
 const h=await fetchMetaTrackingExactHourlySpend(scoped[0],'2026-11-12',90);assert.deepEqual(Object.keys(h.hourlySpendInr),['meta:123456:111111']);
});
test('assignment or campaign discovery failures cannot fall back to whole-account spend',async()=>{
 let calls=0;global.fetch=async()=>{calls++;throw Error('Meta unavailable')};await assert.rejects(scopeNormalMetaCredentials(db(true),[cred]),/assignments/);assert.equal(calls,0);await assert.rejects(scopeNormalMetaCredentials(db(),[cred]),/Meta unavailable/);assert.throws(()=>normalCampaignFilter({...cred,campaignIds:[]}),/No campaigns/);
});
test('normal workspace cannot read or edit a reserved campaign or its ad set',async()=>{
 const c={...cred,campaignIds:['111111']};let calls=0;global.fetch=async u=>{calls++;return Response.json({id:new URL(u).pathname.split('/').pop(),account_id:'123456',campaign_id:'222222'})};
 await assert.rejects(assertNormalMetaObject(c,'campaign','222222'),/unavailable/);assert.equal(calls,0);await assert.rejects(assertNormalMetaObject(c,'adset','999999'),/unavailable/);
});
