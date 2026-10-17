/* Offline fixtures: never call a real payment, email, Meta, or database API. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
function stub(file, exports) { const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let tables, reads, mutations, metaResult;
const field = (row, key) => key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key];
const db = { from(table) {
  assert.ok(['us_soulmate_orders','us_soulmate_refund_events','us_soulmate_marketing_events','us_soulmate_admin_settings','settings','admin_sessions','us_soulmate_tracking_views','soulmate_admin_settings'].includes(table), `Unexpected table ${table}`);
  reads.push(table); let filters = [], single = false, range = [0, Infinity], operation, payload;
  const q = {
    select() { return q; }, eq(k,v) { filters.push(row => field(row,k) === v); return q; },
    gte(k,v) { filters.push(row => field(row,k) >= v); return q; }, lt(k,v) { filters.push(row => field(row,k) < v); return q; },
    lte(k,v) { filters.push(row => field(row,k) <= v); return q; }, in(k,v) { filters.push(row => v.includes(field(row,k))); return q; },
    not(k,op,v) { assert.equal(op,'is'); filters.push(row => field(row,k) != v); return q; },
    like(k,v) { filters.push(row => row[k].startsWith(v.replace(/%$/,''))); return q; },
    order() { return q; }, range(a,b) { range=[a,b]; return q; }, limit(n) { range=[0,n-1]; return q; },
    single() { single=true; return q; }, maybeSingle() { single=true; return q; },
    insert(value) { operation='insert';payload=value;return q; }, update(value) { operation='update';payload=value;return q; }, delete() { operation='delete';return q; },
    then(yes,no) { return Promise.resolve().then(() => {
      let rows=(tables[table]||[]).filter(row => filters.every(fn => fn(row))).slice(range[0],range[1]+1);
      if(operation) {
        assert.equal(table,'us_soulmate_tracking_views'); mutations.push({table,operation,payload});
        if(operation==='insert') (tables[table] ||= []).push(payload);
        if(operation==='update') rows.forEach(row=>Object.assign(row,payload));
        if(operation==='delete') tables[table]=tables[table].filter(row=>!rows.includes(row));
      }
      return {data:single?rows[0]||null:rows,error:null};
    }).then(yes,no); },
  }; return q;
} };
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>db});
stub('../src/lib/us-soulmate-tracking-meta',{
  fetchMetaTrackingAccount:async()=>{if(metaResult) return metaResult; throw new Error('Unexpected Meta fetch without dedicated accounts');},
  fetchMetaTrackingExactHourlySpend:async()=>{throw new Error('Unexpected Meta call');},
});
const helpers=require('../src/lib/us-soulmate-tracking-data');
const {GET}=require('../src/app/api/admin/us-soulmate/tracking/route');
const views=require('../src/app/api/admin/us-soulmate/tracking/views/route');
const {NextRequest}=require('next/server');
const range={start:'2026-10-15T06:00:00.000Z',end:'2026-10-18T06:00:00.000Z'};
const base={id:'sm_fixture',customer_email:'fixture@example.com',plan:'express',product_info:'Complete Soulmate Vision: Fast Delivery + Description + Color Upgrade',amount:176882,payment_status:'paid',payment_mode:'live',funnel:'us_soulmate_standalone',created_at:'2026-10-16T06:30:00Z',paid_at:'2026-10-16T07:00:00Z',attribution:{trackingEnvironment:'production',marketing:{utm_source:'meta',utm_campaign:'Soulmate A',meta_campaign_id:'123456789',meta_adset_id:'987654321',meta_ad_id:'123456780'}}};
function req(url='',method='GET',body,auth=true) {return new NextRequest(`http://localhost/api/admin/us-soulmate/tracking${url}`,{method,headers:{...(auth?{'x-admin-session':'fixture-session'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
beforeEach(()=>{
  reads=[];mutations=[];metaResult=null;
  process.env.META_AD_ACCOUNT_IDS='999999'; delete process.env.META_AD_ACCOUNT_ID;
  tables={
    soulmate_admin_settings:[{id:true,accounts:[{accountId:'666666'}]}],
    us_soulmate_orders:[base,{...base,id:'test',payment_mode:'test'},{...base,id:'local',attribution:{trackingEnvironment:'local'}},{...base,id:'other',funnel:'main'},{...base,id:'failed',payment_status:'failed'}],
    us_soulmate_admin_settings:[{id:true,accounts:[],exchange_rate:95,revision:1}],
    settings:[{key:'meta_ad_accounts',value:{accounts:[{accountId:'888888',accessToken:'DO-NOT-USE'}]}}],
    admin_sessions:[{id:'fixture-session',expires_at:'2099-01-01T00:00:00Z'}],
    us_soulmate_marketing_events:[{id:'landing',event_name:'us_soulmate_landing_view',product_type:'us_soulmate_standalone',session_id:'visitor',created_at:'2026-10-16T06:50:00Z',url:'https://astrorekha.com/us/soulmate?utm_source=meta&utm_campaign=Soulmate+A&meta_campaign_id=123456789'}, {id:'normal',event_name:'page_view',product_type:'main',session_id:'other',created_at:'2026-10-16T06:50:00Z',url:'https://astrorekha.com/welcome?meta_campaign_id=123456789'}],
  };
  global.fetch=async()=>{throw new Error('External network is forbidden in this test');};
});
test('paid sales include production Soulmate only and preserve paise, paid time and all attribution IDs',async()=>{
  const rows=await helpers.soulmatePaidPayments(db,range.start,range.end);
  assert.equal(rows.length,1);assert.equal(rows[0].amount,176882);assert.equal(rows[0].fulfilled_at,base.paid_at);
  assert.equal(rows[0].meta_ad_id,'123456780');assert.equal(rows[0].feature,base.product_info);
  assert.deepEqual(reads,['us_soulmate_orders']);
});
test('summary attributes sales and visits without connected accounts, normal data, or mutations',async()=>{
  const response=await GET(req('?start=2026-10-15&end=2026-10-17'));
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.totals.orders,1);assert.equal(data.totals.revenue,1768.82);
  assert.equal(data.totals.profit,null); // Unknown ad spend is not zero cost.
  const campaign=data.campaigns.find(row=>row.campaignId==='123456789');
  assert.equal(campaign.orders,1);assert.equal(campaign.utmVisits,1);assert.equal(campaign.adBreakdown[0].adId,'123456780');
  assert.equal(data.hourly.reduce((n,row)=>n+row.orders,0),1);assert.equal(data.accounts.length,0);
  assert.deepEqual(mutations,[]);assert.ok(!reads.includes('settings'));
});
test('live sales show Soulmate product name and only verified production purchases',async()=>{
  tables.us_soulmate_orders=[{...base,paid_at:new Date(Date.now()-1000).toISOString()}];
  const response=await GET(req('?mode=live'));const data=await response.json();
  assert.equal(data.todayCount,1);assert.equal(data.sales[0].productName,base.product_info);assert.equal(data.sales[0].amount,1768.82);
});
test('Meta purchases and internal sales stay distinct and profit deducts saved tax',async()=>{
  tables.us_soulmate_orders[0]={...base,gst_amount:20000};
  tables.us_soulmate_admin_settings[0].accounts=[{accountId:'777777',accessToken:'soulmate-fixture'}];
  metaResult={account:{id:'777777',name:'Soulmate only',currency:'USD',timezone:'Asia/Kolkata'},warnings:[],hourlySpendInr:{},dailySpendInr:{'2026-10-16':{total:100,indian:100}},campaigns:[{
    key:'meta:777777:123456789',accountId:'777777',accountName:'Soulmate only',campaignId:'123456789',campaignName:'Soulmate A',currency:'USD',spend:100,spendInr:100,metaPurchases:7,metaPurchaseValue:12381.74,
    orders:0,grossRevenue:0,refunds:0,refundAmount:0,revenue:0,utmSources:[],utmMediums:[],utmTerms:[],utmContents:[],adBreakdown:[],attribution:'none',
  }]};
  const response=await GET(req('?start=2026-10-15&end=2026-10-17&dayMode=calendar_ist'));
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.campaigns[0].metaPurchases,7);assert.equal(data.campaigns[0].orders,1);
  assert.equal(data.totals.attributedOrders,1);assert.equal(data.campaigns[0].utmVisits,1);
  assert.ok(Math.abs(data.totals.profit-1468.82)<0.001);
});
test('refunds are restricted to production Soulmate parents and keep precise gateway times',async()=>{
  tables.us_soulmate_refund_events=[{event_id:'refund-fixture',order_id:base.id,date:'2026-10-16',amount_paise:10000,occurred_at:'2026-10-17T02:15:00Z'},
    {event_id:'local-refund',order_id:'local',date:'2026-10-16',amount_paise:10000,occurred_at:'2026-10-17T02:15:00Z'}];
  const refunds=await helpers.soulmateRefundPayments(db,range.start,range.end);
  assert.equal(refunds.length,1);assert.equal(refunds[0].created_at,'2026-10-17T02:15:00.000Z');
  assert.equal(refunds[0].meta_campaign_id,'123456789');
  const response=await GET(req('?start=2026-10-15&end=2026-10-17&dayMode=calendar_ist'));
  const data=await response.json();assert.equal(data.totals.revenue,1668.82);
  assert.equal(data.hourly.find(row=>row.revenue<0).hour,7);
});
test('no session or an expired session cannot read tracking or views',async()=>{
  assert.equal((await GET(req('', 'GET',null,false))).status,401);
  tables.admin_sessions[0].expires_at='2020-01-01';
  assert.equal((await GET(req())).status,401);assert.equal((await views.GET(req('/views'))).status,401);
  assert.ok(reads.every(table=>table==='admin_sessions'));
});
test('dedicated credentials never fall back to main credentials and shared accounts are rejected',async()=>{
  assert.deepEqual(await helpers.soulmateTrackingCredentials(db,{}),[]);
  for(const accountId of ['888888','999999','666666']) {
    tables.us_soulmate_admin_settings[0].accounts=[{accountId,accessToken:'soulmate-fixture'}];
    await assert.rejects(helpers.soulmateTrackingCredentials(db,{}),/also connected/);
  }
  tables.us_soulmate_admin_settings[0].accounts=[{accountId:'777777',accessToken:'soulmate-fixture',startDate:'2026-10-15',startTime:'11:30'}];
  const accounts=await helpers.soulmateTrackingCredentials(db,{startMillis:Date.parse(range.start),endMillis:Date.parse(range.end)});
  assert.deepEqual(accounts.map(row=>row.accountId),['777777']);
});
test('arrival URLs take precedence over old attribution and reloads do not inflate visits',async()=>{
  tables.us_soulmate_marketing_events.push({...tables.us_soulmate_marketing_events[0],id:'reload'});
  assert.equal((await helpers.readSoulmateUtmVisits(db,range.start,range.end)).length,1);
  assert.equal(helpers.soulmateLandingVisit({created_at:base.paid_at,url:'https://astrorekha.com/us/soulmate',landing_url:'https://astrorekha.com/us/soulmate?meta_campaign_id=123456789'}),null);
  assert.equal(helpers.soulmateLandingVisit({created_at:base.paid_at,url:null,landing_url:'https://astrorekha.com/welcome?meta_campaign_id=123456789'}),null);
});
test('saved view CRUD stays in its own table and preserves every column including bid',async()=>{
  const body={name:'Soulmate view',config:{columnIds:['campaign','bid','utmVisits','metaPurchases'],sort:{id:'bid',desc:true}}};
  const created=await views.POST(req('/views','POST',body));assert.equal(created.status,201);
  const {view}=await created.json();assert.deepEqual(view.columnIds,body.config.columnIds);
  assert.equal((await views.PUT(req('/views','PUT',{id:view.id,name:'Updated',config:body.config}))).status,200);
  assert.equal((await (await views.GET(req('/views'))).json()).views[0].name,'Updated');
  assert.equal((await views.DELETE(req(`/views?id=${view.id}`,'DELETE'))).status,200);
  assert.ok(!reads.includes('settings'));assert.equal(tables.us_soulmate_tracking_views.length,0);
});
test('new UI has full column parity and all fetches/cache keys belong to Soulmate',()=>{
  const folder=path.join(__dirname,'../src/app/(app)/admin/us-soulmate/tracking');
  const main=fs.readFileSync(path.join(__dirname,'../src/app/(app)/admin/tracking/page.tsx'),'utf8');
  const soulmate=fs.readFileSync(path.join(folder,'page.tsx'),'utf8');
  const columns=s=>[...s.matchAll(/\{ id: "([^"]+)", label:/g)].map(m=>m[1]);
  assert.deepEqual(columns(soulmate),columns(main));
  for(const file of fs.readdirSync(folder)) {
    const source=fs.readFileSync(path.join(folder,file),'utf8');
    assert.ok(!source.includes('/api/admin/tracking'));assert.ok(!source.includes('ar_tracking_'));
  }
});
test('Soulmate browser attribution cannot inherit or overwrite normal campaign storage',()=>{
  const store=new Map([['astrorekha_attribution',JSON.stringify({meta_campaign_id:'normal'})]]);
  const original=store.get('astrorekha_attribution');
  global.document={cookie:'_fbp=fb.1.fixture',referrer:''};
  global.window={location:{href:'https://astrorekha.com/us/soulmate?utm_source=meta&utm_campaign=first&meta_campaign_id=123456789&meta_ad_id=123456780'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
  const {getSoulmateAttributionPayload:capture}=require('../src/lib/us-soulmate-attribution-client');
  assert.equal(capture().meta_ad_id,'123456780');
  window.location.href='https://astrorekha.com/us/soulmate/checkout';assert.equal(capture().meta_campaign_id,'123456789');
  window.location.href='https://astrorekha.com/us/soulmate?utm_source=meta&utm_campaign=second';
  assert.equal(capture().meta_campaign_id,undefined);assert.equal(capture().utm_campaign,'second');
  assert.equal(store.get('astrorekha_attribution'),original);
  store.delete('astrorekha_us_soulmate_attribution');
  store.set('astrorekha_attribution',JSON.stringify({meta_campaign_id:'legacy-soulmate',landing_url:'https://astrorekha.com/us/soulmate?meta_campaign_id=legacy-soulmate'}));
  window.location.href='https://astrorekha.com/us/soulmate/checkout';
  assert.equal(capture().meta_campaign_id,undefined);
  delete global.window;delete global.document;
});
