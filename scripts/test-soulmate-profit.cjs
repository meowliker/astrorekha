const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path'), Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { profitDay, validProfitDate, soulmateProfitRows, latestSoulmateProfitRange, soulmateBackfillRanges } = require('../src/lib/soulmate-profit');
const {validateSoulmateAccounts,publicSoulmateSettings}=require('../src/lib/soulmate-profit-settings');
const meta=require('../src/lib/soulmate-meta-spend');
const actualFetchMeta=meta.fetchSoulmateMetaSpend;
const now=Date.parse('2026-10-16T12:00:00Z');
const account={accountId:'12345',accessToken:'fixture-token',active:true,startDate:'2026-10-15',startTime:'11:30',label:'Soulmate',campaignIds:['111111']};
test('backfill only targets unsynced dates, skips current rows and batches seven days',()=>{
 assert.deepEqual(soulmateBackfillRanges(['2026-10-15']),[{start:'2026-10-15',end:'2026-10-15'}]);
 assert.deepEqual(soulmateBackfillRanges(['2026-10-18','2026-10-15','2026-10-15','2026-10-19']),[{start:'2026-10-15',end:'2026-10-15'},{start:'2026-10-18',end:'2026-10-19'}]);
 assert.deepEqual(soulmateBackfillRanges(Array.from({length:8},(_,i)=>`2026-10-${15+i}`)),[{start:'2026-10-15',end:'2026-10-21'},{start:'2026-10-22',end:'2026-10-22'}]);
});
test('reporting boundary, launch floor and exact paise aggregation',()=>{
 assert.equal(profitDay('2026-10-16T05:59:59Z'),'2026-10-15');
 assert.equal(profitDay('2026-10-16T06:00:00Z'),'2026-10-16');
 assert.deepEqual(latestSoulmateProfitRange(Date.parse('2026-10-15T12:00Z')),{start:'2026-10-15',end:'2026-10-15'});
 assert.deepEqual(latestSoulmateProfitRange(Date.parse('2026-11-04T12:00Z')),{start:'2026-11-03',end:'2026-11-04'});
 const rows=soulmateProfitRows('2026-10-15','2026-10-16',[{paid_at:'2026-10-16T05:59:59Z',amount:223964,gst_amount:34164}]);
 assert.equal(rows[0].received,223964);assert.equal(rows[1].received,0);assert.equal(rows[0].profit,null);
 assert.equal(validProfitDate('2026-02-30'),false);
});
test('separate account settings retain only their own saved token and never expose it',()=>{
 const saved=validateSoulmateAccounts([{...account,accessToken:''}],[account]);assert.equal(saved[0].accessToken,'fixture-token');
 assert.throws(()=>validateSoulmateAccounts([{...account,accessToken:''}],[]),/access token/);
 assert.throws(()=>validateSoulmateAccounts([account,account],[]),/unique/);
 assert.throws(()=>validateSoulmateAccounts([{...account,startDate:'2026-10-01'}],[]),/15 October/);
 assert.throws(()=>validateSoulmateAccounts([{...account,active:false,endDate:'2026-10-14'}],[]),/valid/);
 assert.equal(JSON.stringify(publicSoulmateSettings({accounts:[account],revision:1,exchange_rate:95})).includes('fixture-token'),false);
});
test('hour allocation honors IST boundary, partial current hour, account windows and DST',()=>{
 assert.equal(meta.accountHourMillis('2026-10-15',0,'America/Costa_Rica'),Date.parse('2026-10-15T06:00Z'));
 assert.equal(meta.accountHourMillis('2026-07-15',0,'America/New_York'),Date.parse('2026-07-15T04:00Z'));
 assert.equal(meta.accountHourMillis('2026-01-15',0,'America/New_York'),Date.parse('2026-01-15T05:00Z'));
 const bucket=Date.parse('2026-10-16T05:30Z');
 const portions=meta.allocateSoulmateHour(bucket,100,{startMillis:bucket,endMillis:bucket+3600000},now);
 assert.equal(portions.get('2026-10-15'),50);assert.equal(portions.get('2026-10-16'),50);
 const partial=meta.allocateSoulmateHour(bucket,40,{startMillis:bucket,endMillis:bucket+3600000},bucket+900000);
 assert.equal(partial.get('2026-10-15'),40);
});
test('Meta pagination, isolated authorization, currency conversion and failure propagation',async()=>{
 const original=global.fetch;let calls=[];
 global.fetch=async(url,init)=>{
  const u=new URL(url);calls.push(u);assert.equal(init.headers.Authorization,'Bearer fixture-token');assert.equal(u.searchParams.has('access_token'),false);
  if(!u.pathname.endsWith('/insights'))return Response.json({name:'Soulmate',currency:'INR',timezone_name:'Asia/Kolkata',balance:'1000'});
  if(!u.searchParams.has('breakdowns'))return Response.json({data:[{campaign_id:'111111',date_start:'2026-10-16',spend:'200'}]});
  if(!u.searchParams.has('after'))return Response.json({data:[{campaign_id:'111111',date_start:'2026-10-16',spend:'100',hourly_stats_aggregated_by_advertiser_time_zone:'11:00:00 - 11:59:59'}],paging:{next:'yes',cursors:{after:'next-page'}}});
  return Response.json({data:[{campaign_id:'111111',date_start:'2026-10-16',spend:'100',hourly_stats_aggregated_by_advertiser_time_zone:'12:00:00 - 12:59:59'}]});
 };
 try{
  const rows=await actualFetchMeta([account],'2026-10-15','2026-10-16',100,now);
  assert.equal(rows[0].adsInr,5000);assert.equal(rows[1].adsInr,15000);assert.equal(rows[1].adsUsd,150);assert.equal(rows[1].adGst,2700);
  assert.equal(rows[0].balance,null);assert.equal(rows[1].balance,null);
  assert.ok(calls.some(u=>u.searchParams.get('after')==='next-page'));
  global.fetch=async()=>Response.json({error:{message:'secret never surface'}},{status:403});
  await assert.rejects(actualFetchMeta([account],'2026-10-15','2026-10-16',95,now),/Saved figures/);
 }finally{global.fetch=original;}
});
const state={settings:{accounts:[],exchange_rate:null,revision:1},saved:[],orders:[{amount:223964,gst_amount:34164,paid_at:'2026-10-15T16:20:00Z'}],filters:[],tables:[],rpcs:[],gateway:[],fail:false};
const db={from(table){state.tables.push(table);let update=false;const q={select(){return q},eq(k,v){state.filters.push([table,k,v]);return q},gte(k,v){state.filters.push([table,k,v]);return q},lt(k,v){state.filters.push([table,k,v]);return q},lte(){return q},in(){return q},not(){return q},order(){return q},update(){update=true;return q},range:async()=>({data:state.orders,error:null}),single:async()=>({data:state.settings,error:null}),then(a,b){let data=table==='soulmate_profit_sheet'?state.saved:[];return Promise.resolve({data,error:null}).then(a,b)}};return q},async rpc(name,args){state.rpcs.push([name,args]);if(name==='claim_soulmate_profit_sync')return {data:true,error:null};return {data:null,error:null}}};
const payu=require('../src/lib/payu-api');payu.getPayUTransactions=async(...args)=>{state.gateway.push(args);if(state.fail)throw new Error('Gateway offline');return []};
meta.fetchSoulmateMetaSpend=async()=>[{date:'2026-10-15',accountId:'12345',adsUsd:100,adsInr:9500,adGst:0,balance:null,balanceCapturedAt:null}];
const {readSoulmateProfitLedger,syncSoulmateProfitLedger}=require('../src/lib/soulmate-profit-ledger');
process.env.PAYU_MODE='live';
test('cached reads do not call PayU, Meta, orders or writes; mark missing/stale rows',async()=>{
 state.tables=[];state.gateway=[];state.rpcs=[];state.saved=[{date:'2026-10-15',data:{date:'2026-10-15',received:223964,adsInr:99999,profit:12345},synced_at:'2026-10-16T12:00Z',config_revision:0}];
 const result=await readSoulmateProfitLedger(db,'2026-10-15','2026-10-16');
 assert.deepEqual(result.missing,['2026-10-16']);assert.equal(result.rows[0].stale,true);assert.equal(result.rows[0].adsInr,null);assert.equal(result.rows[0].profit,null);
 assert.deepEqual(state.tables.sort(),['soulmate_admin_settings','soulmate_profit_sheet']);assert.equal(state.gateway.length,0);assert.equal(state.rpcs.length,0);
});
test('sync only saves requested Soulmate dates and uses verified live production receipts',async()=>{
 state.tables=[];state.filters=[];state.rpcs=[];state.settings={accounts:[account],exchange_rate:95,revision:2};
 await syncSoulmateProfitLedger(db,'2026-10-15','2026-10-16',now);
 const saved=state.rpcs.find(([n])=>n==='finish_soulmate_profit_sync')[1];
 assert.deepEqual(saved.p_rows.map(r=>r.date),['2026-10-15','2026-10-16']);
 assert.equal(saved.p_rows[0].adScope,'selected_campaigns_v1');assert.equal(saved.p_rows[0].profit,180300);assert.equal(saved.p_rows[0].roas,223964/9500);
 for(const [k,v]of [['funnel','soulmate_standalone'],['payment_mode','live'],['payment_status','paid'],['attribution->>trackingEnvironment','production'],['paid_at','2026-10-15T06:00:00Z']])assert.ok(state.filters.some(f=>f[1]===k&&f[2]===v));
 assert.ok(state.tables.every(t=>t.startsWith('soulmate_')));
 assert.deepEqual(state.gateway.at(-1),['2026-10-15','2026-10-17','11:30:00','11:29:59']);
});
test('failed refresh never replaces saved ledger; oversized backfills are rejected',async()=>{
 state.rpcs=[];state.fail=true;
 await assert.rejects(syncSoulmateProfitLedger(db,'2026-10-15','2026-10-16',now),/Gateway offline/);
 assert.equal(state.rpcs.some(([n])=>n==='finish_soulmate_profit_sync'),false);state.fail=false;
 await assert.rejects(syncSoulmateProfitLedger(db,'2026-10-15','2026-10-23',Date.parse('2026-10-24T12:00Z')),/seven days/);
});
const admin=require.resolve('../src/lib/soulmate-admin');require.cache[admin]={id:admin,filename:admin,loaded:true,exports:{soulmateAdmin:async req=>req.headers.get('authorization')==='Bearer fixture'?db:null}};
const {NextRequest}=require('next/server'),{GET,POST}=require('../src/app/api/admin/soulmate/profit/route');
test('routes reject unauthorized access and pre-launch dates, default to launch',async()=>{
 assert.equal((await GET(new NextRequest('http://localhost/api/admin/soulmate/profit'))).status,401);
 assert.equal((await POST(new NextRequest('http://localhost/api/admin/soulmate/profit',{method:'POST',body:'{}'}))).status,401);
 const res=await GET(new NextRequest('http://localhost/api/admin/soulmate/profit?start=2026-10-01&end=2026-10-16',{headers:{authorization:'Bearer fixture'}}));assert.equal(res.status,400);
 const cached=await GET(new NextRequest('http://localhost/api/admin/soulmate/profit',{headers:{authorization:'Bearer fixture'}}));assert.equal(cached.status,200);
});
