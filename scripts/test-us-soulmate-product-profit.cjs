const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path'), Module = require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const {summarizeUSProducts}=require('../src/lib/us-soulmate-product-analytics');
const {summarizeSoulmateAnalytics}=require('../src/lib/us-soulmate-analytics');
const item=(id,amount)=>({id,name:id,amount_paise:amount,quantity:1});
const order=(overrides={})=>({id:'us-fixture',amount:4366,gst_amount:666,base_amount:3700,plan:'standard',attribution:null,line_items:[item('us_soulmate_standard',3700)],...overrides});
test('product report counts actual paid line items and excludes tax',()=>{
 const r=summarizeUSProducts([order()]);const sketch=r.rows.find(x=>x.id==='us_soulmate_standard');
 assert.equal(sketch.units,1);assert.equal(sketch.orders,1);assert.equal(sketch.revenue,3700);assert.equal(r.totalRevenue,3700);
 assert.equal(r.rows.length,6);assert.equal(r.unallocatedOrders,0);
});
test('discounted Vision and timeline allocation reconciles to the cent without double-counting bundled reports',()=>{
 const r=summarizeUSProducts([order({plan:'express',base_amount:8600,amount:304,gst_amount:46,discount_amount:8342,line_items:[item('us_soulmate_express',6700),item('timeline',1900)]})]);
 assert.equal(r.totalRevenue,258);assert.equal(r.rows.find(x=>x.id==='us_soulmate_express').revenue,201);assert.equal(r.rows.find(x=>x.id==='timeline').revenue,57);
 assert.equal(r.rows.find(x=>x.id==='description').orders,0);assert.equal(r.rows.find(x=>x.id==='colour').orders,0);
 assert.equal(r.rows.reduce((s,x)=>s+x.discount,0),8342);
});
test('fractional discounts use stable largest-remainder allocation',()=>{
 const r=summarizeUSProducts([order({base_amount:3,amount:2,gst_amount:0,line_items:[item('us_soulmate_standard',1),item('description',1),item('colour',1)]})]);
 assert.equal(r.totalRevenue,2);assert.equal(r.rows.find(x=>x.id==='us_soulmate_standard').revenue,1);assert.equal(r.rows.find(x=>x.id==='description').revenue,1);assert.equal(r.rows.find(x=>x.id==='colour').revenue,0);
});
test('invalid breakdowns are surfaced, legacy valid package totals are retained',()=>{
 const bad=order({line_items:[item('us_soulmate_standard',2000)]});
 const r=summarizeUSProducts([bad,order({id:'legacy',line_items:[]})]);
 assert.equal(r.unallocatedOrders,1);assert.equal(r.totalRevenue,3700);
});
test('QA exclusion also applies to product reports',()=>{
 const r=summarizeSoulmateAnalytics([], [order(),order({id:'qa',attribution:{marketing:{utm_source:'codex_qa'}}})]);
 assert.equal(r.products.totalRevenue,3700);assert.equal(r.products.rows[0].orders,1);
});
const profit=require('../src/lib/us-soulmate-profit');
test('profit launch and business day start exactly at October 28 11:30 IST',()=>{
 assert.equal(profit.US_SOULMATE_PROFIT_START,'2026-10-28');
 assert.deepEqual(profit.latestSoulmateProfitRange(Date.parse('2026-10-28T12:00:00Z')),{start:'2026-10-28',end:'2026-10-28'});
 const rows=profit.soulmateProfitRows('2026-10-28','2026-10-28',[
 {paid_at:'2026-10-28T05:59:59.999Z',amount:304,gst_amount:46},
 {paid_at:'2026-10-28T06:00:00Z',amount:4366,gst_amount:666},
 {paid_at:'2026-10-29T05:59:59.999Z',amount:7906,gst_amount:1206},
 {paid_at:'2026-10-29T06:00:00Z',amount:304,gst_amount:46}]);
 assert.equal(rows[0].orders,2);assert.equal(rows[0].received,12272);
});
