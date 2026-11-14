const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exports_ = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/profit-report-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:exports_,require,Response,URLSearchParams,Date,console});
const {cachedProfitReport,profitReportCacheKey,invalidateProfitReports} = exports_;
function fixture(initial) {
  let row=initial; const tasks=[]; let loadCount=0; let failed=false;
  const db={from(){ const filters={};return {
    select(){return this},eq(k,v){filters[k]=v;return this},maybeSingle:async()=>({data:row}),
    update(value){return {eq(k,v){filters[k]=v;return this},then(resolve){if(row?.refresh_token===filters.refresh_token)row={...row,...value};resolve({error:null})}}},
    delete(){return {neq:async()=>{row=null;return {error:null}}}},
  }},async rpc(_,args){if(row?.refresh_token)return {data:false};row={...row,refresh_token:args.p_token};return {data:true}}};
  return {db,tasks,get row(){return row},get count(){return loadCount},fail(){failed=true},async run(){return cachedProfitReport(db,'key',async()=>{loadCount++;if(failed)throw Error('provider unavailable');return Response.json({rows:[{revenue:123.45}],dayMode:'calendar_ist'})},fn=>tasks.push(fn))}};
}
test('keys isolate timing, source, range and rate, but never user credentials',()=>{
 const base=new URLSearchParams('startDate=2026-11-01&endDate=2026-11-14&token=secret');const key=profitReportCacheKey(base);
 base.set('token','other');assert.equal(profitReportCacheKey(base),key);
 for(const [k,v] of [['dayMode','calendar_ist'],['adSource','google'],['endDate','2026-11-13'],['exchangeRate','90']]){const p=new URLSearchParams(base);p.set(k,v);assert.notEqual(profitReportCacheKey(p),key)}
});
test('first result persists; repeated reads make no provider calls',async()=>{
 const f=fixture();const first=await(await f.run()).json();assert.equal(first.rows[0].revenue,123.45);assert.ok(f.row.fetched_at);
 await f.run();assert.equal(f.count,1);assert.equal(f.tasks.length,0);
});
test('stale report is returned immediately; background refresh replaces it',async()=>{
 const f=fixture({payload:{rows:[{revenue:50}]},fetched_at:'2020-01-01'});const result=await(await f.run()).json();assert.equal(result.rows[0].revenue,50);assert.equal(result.refreshing,true);assert.equal(f.count,0);
 await f.tasks[0]();assert.equal(f.row.payload.rows[0].revenue,123.45);
});
test('failed background refresh retains known totals and stores a visible warning',async()=>{
 const f=fixture({payload:{rows:[{revenue:50}]},fetched_at:'2020-01-01'});f.fail();await f.run();await f.tasks[0]();assert.equal(f.row.payload.rows[0].revenue,50);assert.match(f.row.refresh_error,/Refresh failed/);assert.equal(f.row.refresh_token,null);
});
test('in-flight first request reports preparing, not zero sales; manual invalidation removes old snapshot',async()=>{
 const f=fixture({refresh_token:'other'});const result=await f.run();assert.equal(result.status,202);assert.equal((await result.json()).preparing,true);assert.equal(f.count,0);
 await invalidateProfitReports(f.db);assert.equal(f.row,null);
});
