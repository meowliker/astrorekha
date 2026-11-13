const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {filterSourcePayments,filterSourceEvents,parseAdSource}=require('../src/lib/admin-acquisition');
const {readAdSourceFinance}=require('../src/lib/admin-source-finance');
const paid=(id,source,at,amount=10000)=>({id,payu_txn_id:id,amount,currency:'INR',payment_status:'paid',type:'bundle_payment',created_at:at,fulfilled_at:at,utm_source:source,utm_medium:'cpc'});
function db(tables,fail=false){return {from(name){let rows=[...(tables[name]||[])];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return q},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q},lt(k,v){rows=rows.filter(r=>r[k]<v);return q},like(k,v){rows=rows.filter(r=>String(r[k]).startsWith(v.replace(/%$/,'')));return q},order(){return q},range(a,b){rows=rows.slice(a,b+1);return q},then(ok,no){return Promise.resolve({data:rows,error:fail?{message:'timeout'}:null}).then(ok,no)}};return q}}}
test('source filtering includes each purchase and its refunds, never a different source or callback tags',()=>{
 const rows=[paid('meta','facebook','2026-11-10T08:00:00Z'),paid('google','google','2026-11-10T08:00:00Z'),paid('direct','','2026-11-10T08:00:00Z'),{id:'pay_refund_1',payu_txn_id:'meta',amount:-500,payment_status:'refund',utm_source:'google',utm_medium:'cpc'}];
 assert.deepEqual(filterSourcePayments(rows,'meta').map(r=>r.id),['meta','direct','pay_refund_1']);assert.deepEqual(filterSourcePayments(rows,'google').map(r=>r.id),['google']);assert.equal(filterSourcePayments(rows,'all'),rows);
 const first={...rows[0],first_touch:{utm_source:'google',utm_medium:'cpc'}};
 assert.equal(filterSourcePayments([first],'google','first').length,1);assert.equal(filterSourcePayments([first],'meta','first').length,0);
});
test('session source follows initial tagged arrival for all steps and retains untagged sessions in the normal workspace',()=>{
 const rows=[{session_id:'a',event_name:'landing',url:'https://astrorekha.com/discover?gclid=123'},{session_id:'a',event_name:'checkout'},{session_id:'b',event_name:'landing',url:'https://astrorekha.com/unknown'}];
 assert.deepEqual(filterSourceEvents(rows,'google').map(r=>r.event_name),['landing','checkout']);assert.equal(filterSourceEvents(rows,'meta').length,1);
 assert.throws(()=>parseAdSource(new URLSearchParams('adSource=both')));
});
test('source profit preserves business-day boundary, includes direct receipts, and refunds from older purchases',async()=>{
 const rows=[paid('a','facebook','2026-11-10T05:59:59Z'),paid('b','facebook','2026-11-10T06:00:00Z',20000),paid('c','google','2026-11-11T05:59:59Z',30000),paid('d','','2026-11-10T12:00:00Z'),{...paid('old','facebook','2026-10-01T07:00:00Z'),payu_txn_id:'gateway-old'},{id:'pay_refund_1',payu_txn_id:'gateway-old',amount:-1000,payment_status:'refund',created_at:'2026-11-10T09:00:00Z'}];
 const meta=(await readAdSourceFinance(db({payments:rows}),'astrorekha','meta','2026-11-10','2026-11-10'))[0];
 assert.equal(meta.received,30000);assert.equal(meta.orders,2);assert.equal(meta.refund,1000);assert.equal(meta.bundleRefund,1000);
 const google=(await readAdSourceFinance(db({payments:rows}),'astrorekha','google','2026-11-10','2026-11-10'))[0];assert.equal(google.received,30000);assert.equal(google.refund,0);
 const indian=(await readAdSourceFinance(db({payments:rows}),'astrorekha','meta','2026-11-10','2026-11-10','calendar_ist'))[0];assert.equal(indian.received,40000);
});
test('source financial reads fail closed and never accept mixed currencies or partial failed queries',async()=>{
 await assert.rejects(readAdSourceFinance(db({},true),'astrorekha','meta','2026-11-10','2026-11-10'));
 await assert.rejects(readAdSourceFinance(db({payments:[{...paid('a','google','2026-11-10T07:00:00Z'),currency:'USD'}]}),'astrorekha','google','2026-11-10','2026-11-10'));
 await assert.rejects(readAdSourceFinance(db({}),'astrorekha','google','2026-11-31','2026-11-31'));
});
test('main source finance excludes standalone purchases and their refunds',async()=>{
 const rows=[paid('us_sm_1','google','2026-11-10T08:00:00Z'),paid('sm_2','google','2026-11-10T08:00:00Z'),paid('main','google','2026-11-10T08:00:00Z'),{id:'pay_refund_standalone',payu_txn_id:'us_sm_1',amount:-1000,payment_status:'refund',created_at:'2026-11-10T09:00:00Z'}];
 const result=(await readAdSourceFinance(db({payments:rows}),'astrorekha','google','2026-11-10','2026-11-10'))[0];assert.equal(result.orders,1);assert.equal(result.received,10000);assert.equal(result.refund,0);
});
test('hourly totals keep unavailable spend unknown instead of showing zero',()=>{
 const {buildTrackingHourlyTable}=require('../src/lib/tracking-hourly-table');
 const summary={spendUnavailable:true,hourly:[{date:'2026-11-10',campaignKey:'google',hour:2,orders:1,revenue:100}],hourlySpendInr:{},hourlyUtmVisits:{google:{'2026-11-10':[0,0,10]}},utmVisitsAvailable:true};
 const result=buildTrackingHourlyTable(summary,[{key:'google',campaignName:'Google campaign',accountId:null,spendInr:null}],'2026-11-10','orders');
 assert.equal(result.totalDetails[2].orders,1);assert.equal(result.totalDetails[2].revenue,100);assert.equal(result.totalDetails[2].spend,null);assert.equal(result.totalDetails[2].roas,null);assert.equal(result.totalDetails[2].cvr,10);
});
test('US main keeps USD cents and refunds isolated from both standalone funnels',async()=>{
 const us={id:'us_ar_one',paid_at:'2026-11-12T08:00:00Z',amount_cents:1999,paid_amount_cents:100,type:'bundle',payment_status:'paid',payment_mode:'live','attribution->>trackingEnvironment':'production',attribution:{marketing:{landing_path:'/us'}}};
 const tables={us_main_orders:[us],us_main_refund_events:[{event_id:'refund-one',order_id:us.id,date:'2026-11-12',amount_paise:50,gst_paise:0}],payments:[paid('india','facebook','2026-11-12T08:00:00Z')],us_soulmate_orders:[{...us,amount:5000}]};
 const result=(await readAdSourceFinance(db(tables),'us-main','meta','2026-11-12','2026-11-12'))[0];assert.equal(result.orders,1);assert.equal(result.received,100);assert.equal(result.refund,50);
 assert.equal((await readAdSourceFinance(db(tables),'us-main','google','2026-11-12','2026-11-12'))[0].orders,0);
});
test('source gateway breakdown reconciles receipts and inherited refunds without standalone or test leakage',async()=>{
 const rows=[{...paid('pnl_one','google','2026-11-10T08:00:00Z',65962),gateway:'pinelabs'}, {...paid('ptm_one','google','2026-11-10T09:00:00Z',99002),gateway:'paytm'}, {...paid('test','google','2026-11-10T09:00:00Z'),payment_mode:'test'}, {...paid('pay_sm_mirror','google','2026-11-10T09:00:00Z'),payu_txn_id:'alternate'}, {id:'pay_refund_1',payu_txn_id:'pnl_one',amount:-1000,payment_status:'refund',created_at:'2026-11-10T10:00:00Z'}];
 const day=(await readAdSourceFinance(db({payments:rows}),'astrorekha','google','2026-11-10','2026-11-10'))[0];
 assert.equal(day.orders,2);assert.equal(day.received,164964);assert.equal(day.refund,1000);
 assert.deepEqual(day.gateways.pinelabs,{received:65962,refunds:1000,salesCount:1,refundCount:1});
 assert.deepEqual(day.gateways.paytm,{received:99002,refunds:0,salesCount:1,refundCount:0});
});

test('verified Paytm refunds retain their saved source without a PayU parent ID', async () => {
 const refund = {id:'pay_refund_ptm_verified',amount:-65962,currency:'INR',type:'bundle',payment_status:'refunded',gateway:'paytm',payment_mode:'live',created_at:'2026-11-03T08:30:54Z',last_touch:{landing_path:'/'}};
 const tables={payments:[refund,{...refund,id:'pay_refund_test',payment_mode:'test'},{...refund,id:'pay_refund_unverified',payment_mode:null}]};
 const meta=(await readAdSourceFinance(db(tables),'astrorekha','meta','2026-11-03','2026-11-03'))[0];
 assert.equal(meta.refund,65962);assert.equal(meta.bundleRefund,65962);assert.equal(meta.refunds,1);
 assert.equal((await readAdSourceFinance(db(tables),'astrorekha','google','2026-11-03','2026-11-03'))[0].refund,0);
});

test('normal and Google finance partition paid receipts and refunds exactly',async()=>{
 const at='2026-11-12T08:00:00Z';
 const rows=[
 {...paid('meta','facebook',at,6556874),gateway:'pinelabs'},
 {...paid('instagram','ig',at,1217954),utm_medium:'social',last_touch:{landing_path:'/',utm_source:'ig',utm_medium:'social',utm_content:'link_in_bio'},gateway:'pinelabs'},
 {...paid('google','ig',at,99002),last_touch:{landing_path:'/discover',utm_source:'ig',utm_medium:'social'},gateway:'pinelabs'},
 {id:'pay_refund_ig',payu_txn_id:'instagram',amount:-10000,payment_status:'refund',created_at:at},
 {...paid('sm_not_main','facebook',at,10000),gateway:'pinelabs'},
 {...paid('test','facebook',at,10000),payment_mode:'test'}];
 const get=async s=>(await readAdSourceFinance(db({payments:rows}),'astrorekha',s,'2026-11-12','2026-11-12'))[0];
 const all=await get('all'),normal=await get('meta'),google=await get('google');
 assert.equal(normal.received,7774828);assert.equal(normal.refund,10000);assert.equal(google.received,99002);
 for(const key of ['received','refund','orders','refunds','bundleReceived','bundleRefund','bundleOrders'])assert.equal(all[key],normal[key]+google[key],key);
 assert.equal(normal.gateways.pinelabs.received,normal.received);assert.equal(normal.gateways.pinelabs.refunds,normal.refund);
});
