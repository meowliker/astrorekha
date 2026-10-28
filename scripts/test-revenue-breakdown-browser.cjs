// Isolated browser fixtures: no requests reach live payment or analytics APIs.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3114';
const date = new Date(Date.now() - 6 * 3600000).toISOString().slice(0,10);
const row = { date, day:'Wed', revenue:690.2, grossRevenue:759.87, refundAmount:69.67, gst:124.24,
  gstBreakdown:{revenueGst:124.24,indianAdSpendInr:0,indianAdAccounts:[],adGstCredit:0}, adsCostUSD:0,adsCostINR:0,
  netRevenue:565.96,profitPercent:82,roas:0,bundleRevenue:690.2,transactionCount:2,bundlePurchases:2,salesCount:2,refundCount:2 };
const breakdown = {date, dayMode:'business_1130_ist', gateways:[
  {gateway:'payu',name:'PayU',received:100.25,refunds:10.05,revenue:90.2,salesCount:1,refundCount:1},
  {gateway:'paytm',name:'Paytm',received:659.62,refunds:59.62,revenue:600,salesCount:1,refundCount:1}],
  received:759.87,refunds:69.67,revenue:690.2,fetchedAt:new Date().toISOString()};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try { for(const width of [375,1440]) { const context=await browser.newContext({viewport:{width,height:900}});let calls=0,fail=false;
await context.addInitScript(()=>{localStorage.setItem('admin_session_token','fixture');localStorage.setItem('admin_session_expiry',new Date(Date.now()+3600000).toISOString())});
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
if(url.pathname==='/api/admin/profit-sheet'){if(url.searchParams.has('revenueBreakdownDate')){calls++;assert.equal(url.searchParams.get('dayMode'),'business_1130_ist');return route.fulfill({status:fail?503:200,json:fail?{error:'Payment service temporarily unavailable'}:breakdown})}return route.fulfill({json:{rows:[row],totals:row,exchangeRate:85}})}
if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Fixture excludes unrelated API'}});return route.continue()});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/admin/revenue');await page.getByRole('button',{name:'Profit Sheet',exact:true}).click();
const button=page.getByRole('button',{name:/View revenue by payment gateway/}).first();await button.waitFor();assert.equal(calls,0);
await button.click();const dialog=page.getByRole('dialog',{name:'Revenue by payment gateway'});await dialog.getByText('₹659.62',{exact:true}).waitFor();assert.equal(calls,1);await dialog.getByText('PayU',{exact:true}).waitFor();await dialog.getByText('Paytm',{exact:true}).waitFor();await dialog.getByText('₹690.20',{exact:true}).waitFor();
const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
await page.screenshot({path:'/tmp/revenue-gateway-'+width+'.png'});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
assert(await button.evaluate(el=>el===document.activeElement));fail=true;await button.click();await dialog.getByRole('alert').waitFor();fail=false;await dialog.getByRole('button',{name:'Try again'}).click();await dialog.getByText('₹659.62',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Close revenue breakdown'}).click();assert.deepEqual(errors,[]);console.log('PASS',width,'px: on-demand amounts, mobile fit, Escape/focus return and failed-request retry');await context.close();}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
