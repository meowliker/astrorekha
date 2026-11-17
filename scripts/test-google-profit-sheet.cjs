const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {googleProfitRow,googleProfitCacheKey}=require('../src/lib/google-profit-sheet');
const day={date:'2026-11-14',received:118000,refund:0,orders:1,refunds:0,bundleReceived:118000,bundleRefund:0,bundleOrders:1,salesTax:18000,gateways:{}};
test('native Google cost converts once and preserves workspace financial formulas',()=>{
 const usa={id:'usa',name:'USA',currency:'USD'},india={id:'india',name:'India',currency:'INR'};
 const row=googleProfitRow(day,1000000,usa,'astrorekha',90,true);
 assert.equal(row.adsCostUSD,1);assert.equal(row.adsCostINR,90);assert.equal(row.netRevenue,1180-212.4-90);assert.equal(row.financialBounds,undefined);
 const indian=googleProfitRow(day,90000000,india,'astrorekha',90,true);assert.equal(indian.gst,196.2);assert.equal(indian.netRevenue,1180-196.2-90);
 const us=googleProfitRow(day,90000000,india,'us-main',90,true);assert.equal(us.adsInr,100);assert.equal(us.profit,99900);
});
test('missing attribution never manufactures exact profit but preserves exact spend',()=>{
 const row=googleProfitRow(day,1000000,{id:'usa',name:'USA',currency:'USD'},'astrorekha',90,false);
 assert.equal(row.adsCostINR,90);assert.equal(row.netRevenue,null);assert.equal(row.roas,null);assert.equal(row.spendUnavailable,false);assert.equal(row.profitUnavailable,true);
 const missing=googleProfitRow(day,null,{id:'usa',name:'USA',currency:'USD'},'astrorekha',90,true);assert.equal(missing.adsCostINR,null);assert.equal(missing.netRevenue,null);
});
test('saved reports separate account, workspace, dates and FX without including credentials',()=>{
 const key=(f='astrorekha',a='4870113996',s='2026-11-14',e='2026-11-16',r=null)=>googleProfitCacheKey(f,a,s,e,r);
 assert.equal(new Set([key(),key('us-main'),key('astrorekha','6752275511'),key('astrorekha','4870113996','2026-11-15'),key('astrorekha','4870113996','2026-11-14','2026-11-16','90')]).size,5);
});
