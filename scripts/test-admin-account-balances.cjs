const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Module = require('node:module');
const cache = {};
function load(file, replacements = {}) {
  file = path.resolve(file); if (cache[file]) return cache[file].exports;
  const m = { exports: {} }; cache[file] = m; const req = Module.createRequire(file);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(n => n in replacements ? replacements[n] : n.startsWith('./') ? load(path.resolve(path.dirname(file), n + '.ts')) : req(n), m, m.exports);
  return m.exports;
}
const domain = load('src/lib/account-balances-types.ts');
const service = load('src/lib/account-balances.ts');
const permissions = load('src/lib/admin-workspaces.ts');
const account = { accountId: '123', accountName: 'Account', funnels: ['AstroRekha'] };
const reading = service.parseBalance({ id: 'act_123', currency: 'INR', spend_cap: '1000000', amount_spent: '250000', balance: '100' }, account, 'manual', '2026-11-18T10:00:00Z');
test('reads remaining limit in minor units; absent cap is unavailable, never zero or negative debt', () => {
  assert.equal(reading.remaining, 7500); assert.equal(reading.outstanding, 1);
  const r = service.parseBalance({ id: 'act_123', currency: 'USD', spend_cap: '0', amount_spent: '200', balance: '3000' }, account, 'manual', '2026-11-18T10:00:00Z');
  assert.equal(r.remaining, null); assert.equal(r.outstanding, 30);
  assert.equal(service.parseBalance({ id: 'act_456', currency: 'INR' }, account, 'manual', reading.at).status, 'error');
  assert.equal(service.parseBalance({ id: 'act_123', currency: 'INR', spend_cap: '', amount_spent: null, balance: '0' }, account, 'manual', reading.at).status, 'error');
});
test('failed refresh preserves exact last good balance and timestamp; out-of-order results do not regress it', () => {
  const first = domain.mergeBalance(undefined, reading);
  const failed = domain.mergeBalance(first, { ...account, at: '2026-11-18T10:01:00Z', status: 'error', source: 'manual' });
  assert.equal(failed.last_attempt.status, 'error'); assert.deepEqual(failed.last_verified, reading);
  assert.deepEqual(domain.mergeBalance(failed, { ...reading, remaining: 9999, at: '2026-11-18T09:00:00Z' }), failed);
});
test('schedules have correct IST calendar date, boundary windows and three distinct keys', () => {
  for (const [stamp, key] of [['2026-11-18T18:30:00Z','2026-11-19:midnight'], ['2026-11-19T06:00:00Z','2026-11-19:morning'], ['2026-11-19T12:30:00Z','2026-11-19:evening']]) assert.equal(domain.balanceSchedule(new Date(stamp)).key, key);
  for (const stamp of ['2026-11-18T18:29:59Z', '2026-11-18T18:35:00Z', '2026-11-19T06:05:00Z', '2026-11-19T12:35:00Z']) assert.equal(domain.balanceSchedule(new Date(stamp)), null);
  const crons = JSON.parse(fs.readFileSync('vercel.json')).crons.filter(c => c.path === '/api/cron/sync-account-balances').map(c => c.schedule).sort();
  assert.deepEqual(crons, ['0 6 * * *', '30 12 * * *', '30 18 * * *']);
});
test('active accounts are deduplicated across funnels; inactive and future accounts excluded; missing-token accounts remain visible', () => {
  const rows = service.selectActiveBalanceAccounts([
    { funnel: 'AstroRekha', settings: { accounts: [{accountId:'2022187855078303',active:true,accessToken:'fixture'}, {accountId:'2366717340763776',active:true,accessToken:'fixture'}, {accountId:'a', active:false}, {accountId:'b',active:true}, {accountId:'future',active:true,startDate:'2027-01-01'}] } },
    { funnel: 'Soulmate', settings: { accounts: [{accountId:'a',active:true,accessToken:'fixture'}, {accountId:'b',active:true,accessToken:'fixture'}] } },
  ], new Date('2026-11-18T10:00:00Z'));
  assert.ok(!rows.some(r=>['2022187855078303','2366717340763776'].includes(r.accountId)));
  assert.equal(rows.filter(r => r.accountId === 'b').length, 1);
  assert.deepEqual(rows.find(r=>r.accountId==='b').funnels, ['AstroRekha','Soulmate']);
  assert.deepEqual(rows.find(r=>r.accountId==='a').funnels, ['Soulmate']);
  assert.ok(!rows.some(r=>r.accountId==='future')); assert.equal(rows.find(r=>r.accountId==='b').accessToken,'fixture');
});
test('Meta limit increases are never called recharges; stable IDs deduplicate reimports and distinguish decreases', () => {
  const raw = {event_time:'2026-11-18T10:00:00+0000',event_type:'ad_account_update_spend_limit',object_id:'123',extra_data:JSON.stringify({currency:'INR',old_value:100000,new_value:150000,type:'payment_amount'})};
  const entry = service.parseLimitActivity(raw,account); assert.equal(entry.kind,'limit_change'); assert.equal(entry.amount,500);
  assert.deepEqual(service.parseLimitActivity(raw,account),entry);
  assert.equal(service.parseLimitActivity({...raw,object_id:'456'},account),null);
  assert.equal(service.parseLimitActivity({...raw,event_type:'ad_account_billing_charge'},account),null);
  assert.equal(service.parseLimitActivity({...raw,extra_data:'not json'},account),null);
});
test('global page and API require administrator; workspace-only members cannot read all balances', () => {
  for(const p of ['/admin/account-balances','/api/admin/account-balances']) {
    assert.equal(permissions.workspaceForPath(p),'administrator');
    assert.equal(permissions.canAccess({isAdministrator:false,workspaces:['astrorekha','operations']},permissions.workspaceForPath(p)),false);
    assert.equal(permissions.canAccess({isAdministrator:true,workspaces:[]},permissions.workspaceForPath(p)),true);
  }
});
test('production cannot use local preview even when flag is accidentally set', () => {
  const store = load('src/lib/account-balances-store.ts'), old = process.env.NODE_ENV;
  process.env.ACCOUNT_BALANCES_LOCAL_PREVIEW='1'; process.env.NODE_ENV='production'; assert.equal(store.localBalancePreview(),false);
  process.env.NODE_ENV=old; delete process.env.ACCOUNT_BALANCES_LOCAL_PREVIEW;
});
test('refresh calls Meta read endpoints only, records partial failures, and repeated refreshes cannot duplicate history', async () => {
  let claimed = false, saved, calls = [], merged = domain.mergeBalance(undefined, reading);
  const settings = {accounts:[{accountId:'123',label:'Main',active:true,accessToken:'secret-fixture-token'},{accountId:'456',active:true,accessToken:'secret-fixture-token'}]};
  const db = {from(table) { assert.ok(['settings','soulmate_admin_settings','us_main_admin_settings','us_soulmate_admin_settings'].includes(table)); const q = {select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='settings'?{value:settings}:{accounts:[]},error:null})};return q;}};
  const store = {claim:async()=>{if(claimed)return false;claimed=true;return true},save:async(key,readings,history)=>{saved={key,readings,history};for(const r of readings)if(r.accountId==='123')merged=domain.mergeBalance(merged,r)}};
  const m={exports:{}}; const code=ts.transpileModule(fs.readFileSync('src/lib/account-balances.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(n=>n==='./account-balances-store'?{balanceStore:()=>store,localBalancePreview:()=>true}:n.startsWith('./')?load('src/lib/'+n.slice(2)+'.ts'):require(n),m,m.exports);
  const original=global.fetch;
  global.fetch=async (url,init)=>{url=new URL(url);calls.push(url.pathname);assert.equal(url.hostname,'graph.facebook.com');assert.ok(!init.method||init.method==='GET');assert.equal(url.searchParams.has('access_token'),false);
    if(url.pathname.endsWith('/activities'))return {ok:true,json:async()=>({data:[{event_time:'2026-11-18T10:00:00Z',event_type:'ad_account_update_spend_limit',object_id:'123',extra_data:JSON.stringify({currency:'INR',old_value:10000,new_value:20000,type:'payment_amount'})}]})};
    throw Error('provider unavailable');};
  try {const result=await m.exports.refreshBalances(db,false,new Date());assert.equal(result.successful,0);assert.equal(saved.readings.length,2);assert.equal(merged.last_verified.remaining,7500);assert.equal(merged.last_attempt.status,'error');assert.ok(!JSON.stringify(saved).includes('secret-fixture-token'));const count=calls.length;assert.equal((await m.exports.refreshBalances(db)).refreshed,false);assert.equal(calls.length,count);}
  finally{global.fetch=original;}
});

test('15-minute addition polling preserves sheet data, ignores spending and old events, and never rearms an imported alert', async () => {
  const history = new Map(); let rows = [], fail = false, calls = 0, writes = 0;
  const now = new Date('2026-11-19T08:30:00Z');
  const settings = {accounts:[{accountId:'123',active:true,accessToken:'fixture'}]};
  const db = {from(table) {
    // Any write/read of the sheet's current values, snapshots or runs fails this test.
    assert.ok(['settings','soulmate_admin_settings','us_main_admin_settings','us_soulmate_admin_settings','admin_balance_history','admin_balance_alert_state'].includes(table));
    const q = {select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='admin_balance_alert_state'?{activated_at:'2026-11-19T00:00:00Z'}:table==='settings'?{value:settings}:{accounts:[]},error:null}),
      upsert:async(items,options)=>{writes++;assert.deepEqual(options,{onConflict:'id',ignoreDuplicates:true});for(const item of items)if(!history.has(item.id))history.set(item.id,item);return {error:null};}};return q;
  }};
  const activity = (at, before, after) => ({object_id:'123',event_time:at,event_type:'ad_account_update_spend_limit',extra_data:JSON.stringify({type:'payment_amount',currency:'INR',old_value:before,new_value:after})});
  const original=global.fetch;
  global.fetch=async(url,init)=>{calls++;url=new URL(url);assert.ok(!init.method||init.method==='GET');
    if(fail)throw Error('provider unavailable');
    if(url.pathname.endsWith('/activities')){assert.equal(Number(url.searchParams.get('since')),now.getTime()/1000-2*86400);return {ok:true,json:async()=>({data:rows})};}
    return {ok:true,json:async()=>({id:'act_123',name:'Verified account',currency:'INR',balance:'0',spend_cap:'5000000',amount_spent:'4900000'})};
  };
  try {
    assert.deepEqual(await service.checkBalanceAdditions(db,now),{checked:1,failed:0});assert.equal(writes,0);
    rows=[activity('2026-11-18T20:00:00Z',10000,20000),activity('2026-11-19T08:00:00Z',20000,10000),activity('2026-11-19T08:01:00Z',0,10000),activity('2026-11-19T09:00:00Z',10000,20000)];
    await service.checkBalanceAdditions(db,now);assert.equal(writes,0);
    rows.push(activity('2026-11-19T08:09:59Z',335470000,339563900));
    await Promise.all([service.checkBalanceAdditions(db,now),service.checkBalanceAdditions(db,now)]);
    assert.equal(history.size,1);const saved=[...history.values()][0];assert.equal(saved.payload.amount,40939);assert.equal(saved.payload.accountName,'Verified account');assert.equal(saved.occurred_at,'2026-11-19T08:09:59.000Z');assert.equal(saved.notify,true);
    saved.notify=false;await service.checkBalanceAdditions(db,now);assert.equal(history.size,1);assert.equal(saved.notify,false);
    const before=writes;fail=true;assert.deepEqual(await service.checkBalanceAdditions(db,now),{checked:0,failed:1});assert.equal(writes,before);assert.ok(calls>0);
  } finally {global.fetch=original;}
  assert.deepEqual(JSON.parse(fs.readFileSync('vercel.json')).crons.filter(c=>c.path==='/api/cron/check-balance-additions'),[{path:'/api/cron/check-balance-additions',schedule:'*/15 * * * *'}]);
});
