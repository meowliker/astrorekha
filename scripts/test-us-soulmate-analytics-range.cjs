const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { analyticsRange, defaultAnalyticsStart } = require('../src/lib/us-soulmate-analytics-range');
test('launch starts exactly at 11:30 IST and ends at exclusive next midnight', () => {
  assert.deepEqual(analyticsRange('2026-10-28','2026-10-28','2026-10-28'), {start:'2026-10-28T06:00:00.000Z',end:'2026-10-28T18:30:00.000Z',partialDay:true});
  assert.equal(defaultAnalyticsStart('2026-10-28'),'2026-10-28');
});
test('later dates use full IST days and default stays inside the maximum range', () => {
  assert.deepEqual(analyticsRange('2026-10-29','2026-10-30','2026-10-30'),{start:'2026-10-28T18:30:00.000Z',end:'2026-10-30T18:30:00.000Z',partialDay:false});
  assert.doesNotThrow(()=>analyticsRange(defaultAnalyticsStart('2027-05-01'),'2027-05-01','2027-05-01'));
});
test('rejects prelaunch, future, reversed, impossible, and overlong dates', () => {
  for(const [start,end] of [['2026-10-27','2026-10-28'],['2026-10-28','2027-05-02'],['2026-10-30','2026-10-29'],['2027-02-30','2027-03-02'],['2026-10-28','2027-05-01']]) assert.throws(()=>analyticsRange(start,end,'2027-05-01'));
});
const React = require('react');
const {act,create} = require('react-test-renderer');
const Picker=require('../src/app/(app)/admin/us-soulmate/tracking/TrackingDateRangePicker').default;
test('one calendar commits a range only on Apply and disables dates before launch',()=>{
  global.document={addEventListener(){},removeEventListener(){}};
  const changes=[]; let tree;
  act(()=>{tree=create(React.createElement(Picker,{value:{start:'2026-10-28',end:'2026-10-28'},minDate:'2026-10-28',maxDate:'2026-11-02',maxDays:93,align:'left',onChange:r=>changes.push(r)}));});
  const button=label=>tree.root.findByProps({'aria-label':label});
  act(()=>button('Choose reporting date range').props.onClick());
  assert.equal(button('Oct 27, 2026').props.disabled,true);
  act(()=>button('Oct 29, 2026').props.onClick());
  act(()=>button('Oct 31, 2026').props.onClick());
  assert.equal(changes.length,0);
  act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Apply')).props.onClick());
  assert.deepEqual(changes,[{start:'2026-10-29',end:'2026-10-31'}]);
  assert.equal(tree.root.findAllByProps({'aria-label':'Next month'}).length,0);
  act(()=>tree.unmount()); delete global.document;
});
function stub(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
const queries=[];
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>({from(table){const query={table,filters:[]};queries.push(query);const q={select(){return q},eq(k,v){query.filters.push(['eq',k,v]);return q},gte(k,v){query.filters.push(['gte',k,v]);return q},lt(k,v){query.filters.push(['lt',k,v]);return q},order(){return q},range(){return Promise.resolve({data:[],error:null})},maybeSingle(){return Promise.resolve({data:{expires_at:'2099-01-01T00:00:00Z'},error:null})}};return q}})});
const {GET}=require('../src/app/api/admin/us-soulmate/analytics/route');
const {NextRequest}=require('next/server');
test('API applies identical launch cutoff to events and paid orders with GA full-day reporting separately labelled',async()=>{
  queries.length=0;
  const response=await GET(new NextRequest('https://example.com/api/admin/us-soulmate/analytics?start=2026-10-28&end=2026-10-28',{headers:{authorization:'Bearer fixture'}}));
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.startAt,'2026-10-28T06:00:00.000Z');assert.equal(body.bounce.value,null);assert.equal(body.bounce.scope,'full_days');
  for(const [table,field] of [['us_soulmate_marketing_events','created_at'],['us_soulmate_orders','paid_at']]) {
    const query=queries.find(q=>q.table===table);assert(query);
    assert(query.filters.some(f=>f[0]==='gte'&&f[1]===field&&f[2]==='2026-10-28T06:00:00.000Z'));
    assert(query.filters.some(f=>f[0]==='lt'&&f[1]===field&&f[2]==='2026-10-28T18:30:00.000Z'));
  }
});
test('unauthorized requests remain blocked',async()=>{
  const response=await GET(new NextRequest('https://example.com/api/admin/us-soulmate/analytics'));
  assert.equal(response.status,401);
});

test('known QA sessions and orders are excluded without dropping untagged or paid ad traffic',()=>{
  const {summarizeSoulmateAnalytics}=require('../src/lib/us-soulmate-analytics');
  const event=(id,name,source)=>({session_id:id,event_name:`us_soulmate_${name}`,utm_source:source,created_at:'2026-10-28T07:00:00Z'});
  const report=summarizeSoulmateAnalytics([event('qa','landing_view','codex_qa'),event('qa','checkout_view',null),event('real','landing_view',null),event('ad','landing_view','facebook')],[{id:'qa-order',amount:100,attribution:{sessionId:'qa'}},{id:'qa-no-session',amount:100,attribution:{marketing:{utm_source:'codex_qa'}}},{id:'real-order',amount:4366,attribution:{sessionId:'real'}}]);
  assert.equal(report.sessions,2);assert.equal(report.paidOrders,1);assert.equal(report.grossRevenue,43.66);assert.equal(report.checkoutRate,0);
});

test('US GA reporting reuses shared credentials only with a verified matching stream or explicit US property',()=>{
 const {usGAReportingConfig}=require('../src/lib/us-soulmate-ga-report');
 const shared={NEXT_PUBLIC_GA_ID:'G-MAIN',NEXT_PUBLIC_US_SOULMATE_GA_ID:'G-MAIN',GA4_PROPERTY_ID:'123',GOOGLE_SERVICE_ACCOUNT_EMAIL:'fixture@example.com',GOOGLE_PRIVATE_KEY:'private-fixture'};
 assert.equal(usGAReportingConfig(shared).property,'123');
 assert.equal(usGAReportingConfig({...shared,NEXT_PUBLIC_US_SOULMATE_GA_ID:'G-US'}).property,undefined);
 assert.equal(usGAReportingConfig({...shared,NEXT_PUBLIC_US_SOULMATE_GA_ID:'G-US',US_SOULMATE_GA4_PROPERTY_ID:'456'}).property,'456');
});
