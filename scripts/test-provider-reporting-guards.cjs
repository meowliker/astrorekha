const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(n,p,...args){return resolve.call(this,n.startsWith('@/')?path.join(__dirname,'../src',n.slice(2)):n,p,...args)};
const {metaReportingFetch,MetaReportingRateLimitError}=require('../src/lib/meta-reporting-fetch');
const graph=(query='',token='cache-fixture')=>`https://graph.facebook.com/v21.0/act_123/insights?access_token=${token}&${query}`;

test('report reads coalesce, cache for 60s, and isolate token, dates, filters and fields',async()=>{
 let calls=0;global.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({data:[{spend:'19.50'}]})};
 const replies=await Promise.all(Array.from({length:12},()=>metaReportingFetch(graph('fields=spend&date=2026-11-16'))));
 assert.equal(calls,1);for(const r of replies)assert.equal((await r.json()).data[0].spend,'19.50');
 await metaReportingFetch(graph('date=2026-11-16&fields=spend'));assert.equal(calls,1);
 for(const q of ['date=2026-11-15&fields=spend','date=2026-11-16&fields=clicks','date=2026-11-16&fields=spend&filtering=other'])await metaReportingFetch(graph(q));
 await metaReportingFetch(graph('fields=spend&date=2026-11-16','different-token'));assert.equal(calls,5);
 const now=Date.now;Date.now=()=>now()+61_000;try{await metaReportingFetch(graph('fields=spend&date=2026-11-16'));assert.equal(calls,6)}finally{Date.now=now}
});
test('rate limits cap concurrent calls, stop queued requests and respect provider recovery header',async()=>{
 let calls=0,active=0,max=0;global.fetch=async()=>{calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,5));active--;return Response.json({error:{code:17,message:'User request limit reached'}},{status:400,headers:{'x-business-use-case-usage':JSON.stringify({123:[{estimated_time_to_regain_access:12}]})}})};
 const results=await Promise.allSettled(Array.from({length:10},(_,i)=>metaReportingFetch(graph(`page=${i}`,'limited'))));
 assert.equal(calls,2);assert.equal(max,2);for(const r of results){assert.equal(r.status,'rejected');assert.ok(r.reason instanceof MetaReportingRateLimitError);assert.ok(r.reason.retryAfterSeconds>=719)}
 await assert.rejects(metaReportingFetch(graph('page=11','limited')),MetaReportingRateLimitError);assert.equal(calls,2);
 const now=Date.now;Date.now=()=>now()+721_000;global.fetch=async()=>{calls++;return Response.json({data:[]})};try{await metaReportingFetch(graph('page=11','limited'));assert.equal(calls,3)}finally{Date.now=now}
});
test('provider failures never become cached zeroes; reporting helper rejects writes and foreign hosts',async()=>{
 let calls=0;global.fetch=async()=>{calls++;return Response.json({error:{code:190,message:'Invalid credential'}},{status:400})};
 assert.equal((await metaReportingFetch(graph('','invalid'))).status,400);assert.equal((await metaReportingFetch(graph('','invalid'))).status,400);assert.equal(calls,2);
 await assert.rejects(metaReportingFetch(graph(),{method:'POST',body:'purchase'}),/only accepts/);
 await assert.rejects(metaReportingFetch('https://example.com/?access_token=private'),/only accepts/);assert.equal(calls,2);
});
test('fresh workspace assignments still exclude newly reassigned campaigns even with cached discovery',async()=>{
 const {scopeNormalMetaCredentials}=require('../src/lib/normal-meta-campaigns');
 let assigned=false,calls=0,dbReads=0;const db={from(table){return{select(){return this},eq(){return this},single:async()=>{dbReads++;return{data:{accounts:assigned&&table==='soulmate_admin_settings'?[{accountId:'123456',campaignIds:['111111']}]:[]},error:null}}}}};
 global.fetch=async()=>{calls++;return Response.json({data:[{id:'111111',name:'Campaign'}]})};
 const credential={accountId:'123456',accessToken:'scope-cache-fixture'};
 assert.equal((await scopeNormalMetaCredentials(db,[credential])).length,1);assigned=true;
 assert.equal((await scopeNormalMetaCredentials(db,[credential])).length,0);assert.equal(calls,1);assert.equal(dbReads,6);
});
test('edit ownership checks remain uncached and can reject revoked object access immediately',async()=>{
 const {assertSoulmateCampaignObject}=require('../src/lib/soulmate-campaigns');
 let calls=0;global.fetch=async()=>{calls++;return Response.json({id:'111111',account_id:calls===1?'123456':'654321'})};
 const c={accountId:'123456',accessToken:'edit-fixture',campaignIds:['111111']};await assertSoulmateCampaignObject(c,'campaign','111111');await assert.rejects(assertSoulmateCampaignObject(c,'campaign','111111'),/not in a selected/);assert.equal(calls,2);
});
test('editable budget and bid amounts are read fresh on the next report refresh',async()=>{
 let value=100;global.fetch=async()=>Response.json({data:[{daily_budget:value++}]});
 const url=graph('fields=daily_budget,bid_amount','editable');assert.equal((await(await metaReportingFetch(url)).json()).data[0].daily_budget,100);assert.equal((await(await metaReportingFetch(url)).json()).data[0].daily_budget,101);
});
