// Isolated payment recovery tests. No customer records, API calls, or charges.
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const { fetchPayUStatus, watchPayUPayment } = require('../src/lib/payu-checkout-recovery');
const { ensurePaymentUser } = require('../src/lib/payu-checkout-user');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('interrupted verification retries; only server-confirmed payment completes once', async () => {
  let checks=0, paid=0, failed=0;
  const watcher=watchPayUPayment({txnid:'fixture',intervalMs:2,maxWaitMs:500,
    check:async()=>{ checks++; if(checks===1) throw Error('offline'); if(checks===2)return {success:true,status:'pending'};return {success:true,status:'paid',userId:'canonical'}; },
    onPaid: data=>{paid++;assert.equal(data.userId,'canonical')},onFailed:()=>failed++,onWaiting:()=>{},onExpired:()=>assert.fail('expired')});
  await pause(40); await watcher.checkNow();
  assert.equal(paid,1); assert.equal(failed,0); assert.equal(checks,3); watcher.stop();
});
test('unknown payment stops automatically and exposes recovery, never failure', async()=>{
  let expired=0;
  const watcher=watchPayUPayment({txnid:'fixture',intervalMs:2,maxWaitMs:20,check:async()=>({success:true,status:'pending'}),onPaid:()=>assert.fail(),onFailed:()=>assert.fail(),onWaiting:()=>{},onExpired:()=>expired++});
  await pause(40);assert.equal(expired,1);watcher.stop();
});
test('unmount cancels outstanding work and never navigates on a late response',async()=>{
  let resolve, signal;
  const watcher=watchPayUPayment({txnid:'fixture',check:(_,s)=>{signal=s;return new Promise(r=>resolve=r)},onPaid:()=>assert.fail(),onFailed:()=>assert.fail(),onWaiting:()=>assert.fail(),onExpired:()=>assert.fail()});
  watcher.stop();assert.equal(signal.aborted,true);resolve({success:true,status:'paid'});await pause(1);
});
test('focus and polling cannot overlap; a confirmed failure is terminal',async()=>{
  let resolve,calls=0,failed=0;
  const watcher=watchPayUPayment({txnid:'fixture',check:()=>{calls++;return new Promise(r=>resolve=r)},onPaid:()=>assert.fail(),onFailed:()=>failed++,onWaiting:()=>{},onExpired:()=>assert.fail()});
  await watcher.checkNow();await watcher.checkNow();assert.equal(calls,1);resolve({success:true,status:'failed'});await pause(1);assert.equal(failed,1);watcher.stop();
});
test('fetch timeout includes a stalled JSON body; malformed/error responses never count as paid',async()=>{
  const original=global.fetch;
  try{
    global.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
    await assert.rejects(fetchPayUStatus('fixture',undefined,10),/interrupted/);
    global.fetch=async()=>({ok:false,json:async()=>({success:true,status:'paid'})});
    await assert.rejects(fetchPayUStatus('fixture'),/unavailable/);
    global.fetch=async()=>({ok:true,json:async()=>{throw Error('invalid JSON')}});
    await assert.rejects(fetchPayUStatus('fixture'),/invalid JSON/);
  }finally{global.fetch=original}
});
function mockDb(initial, {insertRace=false, readError=false}={}) {
  const rows=initial.map(x=>({...x}));let inserts=0;
  return {rows,get inserts(){return inserts},from(){let op='read',data,field,value;
    const q={select(){return q},eq(f,v){field=f;value=v;return q},maybeSingle(){return run()},insert(d){op='insert';data=d;return q},update(d){op='update';data=d;return q},then(a,b){return run().then(a,b)}};
    async function run(){
      if(op==='read')return {data:rows.find(r=>r[field]===value)||null,error:readError?{code:'57014'}:null};
      if(op==='insert'){inserts++;if(insertRace){rows.push({id:'other-tab',email:data.email});return {error:{code:'23505'}}} rows.push(data);return {error:null}}
      Object.assign(rows.find(r=>r[field]===value),data);return {error:null};
    }return q;
  }};
}
test('existing email resolves canonical identity without duplicate insert or profile overwrite',async()=>{
  const db=mockDb([{id:'canonical',email:'buyer@example.com'}]);
  const id=await ensurePaymentUser({supabase:db,userId:'stale-anon',email:' Buyer@Example.com '});
  assert.equal(id,'canonical');assert.equal(db.inserts,0);assert.equal(db.rows.length,1);
});
test('new customer created once and concurrent email creation recovers',async()=>{
  const db=mockDb([]);assert.equal(await ensurePaymentUser({supabase:db,userId:'new',email:'new@example.com'}),'new');assert.equal(db.inserts,1);
  const raced=mockDb([],{insertRace:true});assert.equal(await ensurePaymentUser({supabase:raced,userId:'stale',email:'race@example.com'}),'other-tab');
});
test('database lookup errors stop checkout instead of creating orphaned payments',async()=>{
  const db=mockDb([],{readError:true});await assert.rejects(ensurePaymentUser({supabase:db,userId:'new',email:'a@example.com'}));assert.equal(db.inserts,0);
});
test('a different email cannot overwrite the existing browser account',async()=>{
  const db=mockDb([{id:'existing',email:'original@example.com'}]);await assert.rejects(ensurePaymentUser({supabase:db,userId:'existing',email:'another@example.com'}),/another email/);assert.equal(db.rows[0].email,'original@example.com');
});
