const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file, deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(n=>deps[n]||require(n),m,m.exports);return m.exports;}
let paused=false;
const recipients=[{kind:'slack',address:'https://hooks.slack.com/services/test/test/test',enabled:true}];
const alerts=load('src/lib/account-balance-alerts.ts',{'./monitoring-delivery':{monitoringAlertRecipients:async()=>paused?[]:recipients}});
const event={id:'one',accountId:'1123080110423751',accountName:'VisionaryEra 3',kind:'limit_change',at:'2026-11-18T12:36:52Z',before:278585,after:319524,amount:40939,currency:'INR'};
function fixture(){const tables={admin_balance_history:[{id:'one',payload:event,notify:true}],admin_balance_alert_deliveries:[]};const db={from(table){assert.ok(table in tables);let filters=[],action,payload,single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},lt(k,v){filters.push(r=>r[k]<v);return q},order(){return q},limit(){return q},insert(p){action='insert';payload=p;return q},update(p){action='update';payload=p;return q},maybeSingle(){single=true;return q},then(a,b){return Promise.resolve(run()).then(a,b)}};function run(){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(action==='insert'){if(tables[table].some(r=>r.id===payload.id))return {error:{code:'23505'}};rows=[{...payload,updated_at:new Date().toISOString()}];tables[table].push(...rows);}else if(action==='update')rows.forEach(r=>Object.assign(r,payload));return {data:single?(rows[0]||null):rows,error:null};}return q}};return{db,tables};}
test('mentions are real users, currencies render correctly, and Vedic/initial/decrease events do not qualify',()=>{
 const m=alerts.balanceAdditionMessage(event);assert.ok(m.includes('<@U08KKPKQKHD> <@U08C5ENV66Q>'));assert.ok(m.includes('₹40,939.00'));assert.ok(m.includes('spending limit'));assert.ok(!m.includes('D08KYJW45M3'));
 assert.ok(alerts.balanceAdditionMessage({...event,currency:'USD'}).includes('$40,939.00'));
 assert.match(alerts.balanceAdditionMessage({...event,at:'2026-11-19T08:09:59Z'}), /\*Time:\* 19 Nov 2026, 1:39 pm IST/);
 for(const accountId of ['2022187855078303','2366717340763776'])assert.equal(alerts.eligibleBalanceAddition({...event,accountId}),false);
 assert.equal(alerts.eligibleBalanceAddition({...event,before:0}),false);assert.equal(alerts.eligibleBalanceAddition({...event,amount:-100}),false);
 assert.ok(!alerts.balanceAdditionMessage({...event,accountName:'<@everyone>'}).includes('<@everyone>'));
});
test('overlapping cron and manual dispatch sends one alert; an empty poll sends nothing',async()=>{
 const oldEnv=process.env.NODE_ENV,oldFetch=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return{ok:true,status:200}};
 try{
  process.env.NODE_ENV='production';const f=fixture();
  await Promise.all([alerts.deliverBalanceAdditionAlerts(f.db),alerts.deliverBalanceAdditionAlerts(f.db)]);
  assert.equal(calls,1);assert.equal(f.tables.admin_balance_alert_deliveries.length,1);
  await alerts.deliverBalanceAdditionAlerts(f.db);assert.equal(calls,1);
  const empty=fixture();empty.tables.admin_balance_history=[];await alerts.deliverBalanceAdditionAlerts(empty.db);assert.equal(calls,1);
 }finally{process.env.NODE_ENV=oldEnv;global.fetch=oldFetch;}
});
test('local preview sends nothing; production sends once per destination, respects pause, and skips ambiguous retries',async()=>{
 const oldEnv=process.env.NODE_ENV,oldFetch=global.fetch;let calls=0,timeout=false;
 global.fetch=async()=>{calls++;if(timeout)throw Error('timeout');return{ok:true,status:200}};
 try{
  const f=fixture();process.env.NODE_ENV='development';await alerts.deliverBalanceAdditionAlerts(f.db);assert.equal(calls,0);assert.equal(f.tables.admin_balance_alert_deliveries.length,0);
  process.env.NODE_ENV='production';paused=true;await alerts.deliverBalanceAdditionAlerts(f.db);assert.equal(calls,0);paused=false;
  await alerts.deliverBalanceAdditionAlerts(f.db);assert.equal(calls,1);assert.equal(f.tables.admin_balance_alert_deliveries[0].status,'sent');
  f.tables.admin_balance_history[0].notify=true;await alerts.deliverBalanceAdditionAlerts(f.db);assert.equal(calls,1);
  const ambiguous=fixture();timeout=true;await alerts.deliverBalanceAdditionAlerts(ambiguous.db);assert.equal(calls,2);assert.equal(ambiguous.tables.admin_balance_alert_deliveries[0].status,'unknown');
  ambiguous.tables.admin_balance_history[0].notify=true;await alerts.deliverBalanceAdditionAlerts(ambiguous.db);assert.equal(calls,2);
  const excluded=fixture();excluded.tables.admin_balance_history[0].payload={...event,accountId:'2022187855078303'};await alerts.deliverBalanceAdditionAlerts(excluded.db);assert.equal(calls,2);
 }finally{process.env.NODE_ENV=oldEnv;global.fetch=oldFetch;paused=false;}
});
