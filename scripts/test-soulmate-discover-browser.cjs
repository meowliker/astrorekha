// All app APIs, gateway destinations and marketing requests are intercepted.
// A virtual production hostname exercises the real production tracking gates without sending events.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:3152', origin='https://astrorekha.com';
const out=process.env.QA_OUTPUT_DIR||'/tmp/astrorekha-discover-qa';fs.mkdirSync(out,{recursive:true});
const invalid=/Online now|only one slot|Only 2 slots|session is held|Verified Buyer|5,000|6,000|Two Weeks|compatibility resonance|beware of imitations|entertainment/i;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 let lastPage,lastRecords;
 try {
  for(const us of (process.env.QA_ONLY_LEGACY ? [] : [false,true])){
   const entry=(us?'/us':'')+'/soulmate/discover', prefix=us?'/api/us/soulmate':'/api/soulmate', canonical=(us?'/us':'')+'/soulmate';
   const id=(us?'us_sm_':'sm_')+'e'.repeat(20),receipt=canonical+'/payment?order='+id;
   const region=us?'us':'india',currency=us?'USD':'INR';let amount=us?4366:117882;
   const records={api:[],gtm:[],external:[],errors:[],events:[],network:[],console:[],hosted:0};let paymentState='paid';
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await context.exposeBinding("__qaRecordEvents",(_source,rows)=>records.events.push(...rows));
   await context.addInitScript(()=>{
    window.dataLayer=[];window.dataLayer.push=function(...rows){const events=rows.filter(row=>row&&row.event);if(events.length)void window.__qaRecordEvents(events);return Array.prototype.push.apply(this,rows)};
    window.__pixels=[];window.fbq=(...args)=>window.__pixels.push(args);
    const old=window.setTimeout;window.setTimeout=(fn,ms,...args)=>old(fn,ms>=1200&&ms<=6500?20:ms,...args);
    window.Stripe=()=>{
     let total=0;const handlers={};
     return {elements(options){total=options.amount;return {update:async({amount})=>{total=amount},submit:async()=>({}),create:()=>({on:(event,fn)=>{handlers[event]=fn},mount:target=>{target.innerHTML='<p>Fixture secure card field</p>';setTimeout(()=>{handlers.ready?.();handlers.change?.({complete:true})},10)},destroy:()=>{}})}},
      createPaymentMethod:async()=>({paymentMethod:{id:'pm_fixture'}}),
      initCheckoutElementsSdk:()=>({loadActions:async()=>({type:'success',actions:{getSession:()=>({currency:'usd',minorUnitsAmountDivisor:100,canConfirm:true,total:{total:{minorUnitsAmount:total,amount:'$'+(total/100).toFixed(2)}}}),confirm:async()=>({type:'success'})}})})};
    };
   });
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='www.googletagmanager.com') {records.gtm.push(url.href);return route.abort()}
    if(url.origin==='https://checkout.pinelabsonline.com'){records.hosted++;return route.fulfill({contentType:'text/html',body:'<script>location.replace('+JSON.stringify(origin+receipt)+')</script>'})}
    if(url.origin!==origin){records.external.push(url.href);return route.abort()}
    if(!url.pathname.startsWith('/api/')){
     const response=await route.fetch({url:base+url.pathname+url.search});return route.fulfill({response});
    }
    const body=req.method()==='POST'?req.postDataJSON():null;records.api.push({path:url.pathname,body});
    if(url.pathname===prefix+'/checkout'){
     assert.equal(body.plan,'standard');assert.equal(body.answers.name,'Fixture');
     assert.equal(body.tracking.attribution.utm_campaign,'discover-fixture');assert.equal(body.tracking.attribution.click_id,'fixture-google-click');
     assert.ok(body.tracking.attribution.landing_path.startsWith(entry));
     const extra=body.addOns?.includes('colour')?(us?3700:29900):0, subtotal=(us?3700:99900)+extra;amount=subtotal+Math.round(subtotal*.18);
     return route.fulfill({json:us?{receiptUrl:receipt,clientSecret:'fixture_secret',amount,orderId:id}:{gateway:'pinelabs',action:'https://checkout.pinelabsonline.com',method:'GET',receiptUrl:receipt,orderId:id}});
    }
    if(url.pathname===prefix+'/payment/status')return route.fulfill({json:{status:paymentState,plan:'standard',amount,deliveryHours:48,deliveryDueAt:null,trackingAllowed:paymentState==='paid',adsPurchase:us?{transactionId:id,amountCents:amount,currency,email:'fixture@example.com'}:{transactionId:id,amountPaise:amount,currency,email:'fixture@example.com'}}});
    return route.fulfill({json:{success:true}});
   });
   const page=await context.newPage();lastPage=page;lastRecords=records;page.on('pageerror',e=>records.errors.push(e.message));page.on('requestfailed',r=>records.network.push({url:r.url(),error:r.failure()}));page.on('console',m=>{if(m.type()==='error')records.console.push(m.text())});
   const tagged=origin+entry+'?utm_source=google&utm_medium=cpc&utm_campaign=discover-fixture&gclid=fixture-google-click';
   await page.goto(tagged);
   assert.ok(!invalid.test(await page.locator('body').innerText()));
   await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,region+'-landing.png'),fullPage:true});
   await page.getByRole('button',{name:'Begin My Chat Reading'}).first().click();
   await page.getByLabel('First name',{exact:true}).fill('Fixture');await page.getByRole('button',{name:'Send answer',exact:true}).click();
   await page.getByRole('button',{name:'I keep attracting the wrong people',exact:true}).click();
   await page.getByRole('button',{name:'I like men',exact:true}).click();
   await page.getByRole('button',{name:'Yes, a man',exact:true}).click();
   await page.getByRole('button',{name:'Safe — someone who stays',exact:true}).click();
   const dateForm=page.getByRole('form',{name:'Your date of birth'});await dateForm.locator('select').nth(0).selectOption('6');await dateForm.locator('select').nth(1).selectOption('28');await dateForm.locator('select').nth(2).selectOption('2003');
   await page.getByRole('button',{name:'This is my date of birth'}).click();
   await page.getByRole('button',{name:us?'White':'North Indian',exact:true}).click();
   await page.locator('section[aria-label="Your soulmate sketch packages"]').waitFor();
   assert.ok(!invalid.test(await page.locator('body').innerText()));assert.equal(await page.getByRole('timer').count(),0);
   const price=us?'$43.66':'₹1,178.82';assert.ok((await page.locator('body').innerText()).includes(price));
   await page.screenshot({path:path.join(out,region+'-offer.png'),fullPage:true});
   await page.getByRole('button',{name:'Choose Soulmate Sketch',exact:true}).click();
   await page.waitForURL(origin+entry+'/checkout?plan=standard');
   await page.getByLabel('Email',{exact:false}).first().fill('fixture@example.com');
   if(!us)await page.getByLabel('Phone number',{exact:false}).fill('9999999999');
   const colour=page.locator('input[name=extras][value=colour]');await colour.check();
   await page.getByRole('button',{name:us?/Pay Now · \$87.32/:/Pay Now · ₹1,531.64/}).waitFor();
   assert.ok(!invalid.test(await page.locator('body').innerText()));
   await page.waitForTimeout(500);await page.screenshot({path:path.join(out,region+'-checkout.png'),fullPage:true});
   // Back restores the same completed answers and remains in the discovery presentation.
   await page.getByRole('link',{name:'Back to your sketch'}).click();
   await page.locator('section[aria-label="Your soulmate sketch packages"]').waitFor();
   assert.equal(new URL(page.url()).pathname,entry);
   await page.getByRole('button',{name:'Choose Soulmate Sketch',exact:true}).click();
   await page.waitForURL(origin+entry+'/checkout?plan=standard');
   const pay=page.getByRole('button',{name:/Pay Now/});await pay.click();
   await page.waitForURL(origin+receipt);await page.getByRole('heading',{name:'Your order is confirmed.',exact:true}).waitFor();
   await page.waitForTimeout(200);
   assert.equal(records.events.filter(row=>row.event==='cta_click').length,1);
   assert.equal(records.events.filter(row=>row.event==='email_submitted').length,1);
   const first=records.events.filter(row=>row.event==='purchase_complete');assert.equal(first.length,1);assert.equal(first[0].value,amount/100);assert.equal(first[0].currency,currency);assert.equal(first[0].transaction_id,id);
   await page.reload();await page.getByRole('heading',{name:'Your order is confirmed.',exact:true}).waitFor();
   const events=await page.evaluate(()=>window.dataLayer.filter(row=>row.event));
   const purchase=events.filter(event=>event.event==='purchase_complete');
   // The first document's CTA/lead events are recorded by interception below, while purchase reload is storage-deduplicated.
   assert.equal(purchase.length,0,'reload must not duplicate the purchase');
   assert.equal(records.events.filter(row=>row.event==='purchase_complete').length,1);
   assert.equal(records.api.filter(r=>r.path===prefix+'/checkout').length,1);
   assert.equal(records.hosted,us?0:1);assert.deepEqual(records.errors,[]);
   assert.equal(records.external.some(url=>url.includes('.r2.dev')),false);
   fs.writeFileSync(path.join(out,region+'-records.json'),JSON.stringify(records,null,2));
   // A genuine failed status (fixture) must not fire a purchase, and retry must stay in the new route.
   paymentState='failed';await page.reload();
   await page.getByRole('link',{name:'Return to checkout'}).waitFor();
   await page.waitForFunction(entry=>document.querySelector('a[href="'+entry+'?checkout=retry"]')!==null,entry);
   await page.getByRole('link',{name:'Return to checkout'}).click();await page.locator('section[aria-label="Your soulmate sketch packages"]').waitFor();
   assert.ok(!invalid.test(await page.locator('body').innerText()));
   console.log('PASS '+region+' discovery: landing -> all questions -> full-price offer -> add-on checkout -> back -> one mocked payment -> shared confirmation -> reload dedupe -> failed retry');
   await context.unrouteAll({behavior:"wait"});await context.close();
  }
  for(const us of [false,true]){
   const canonical=(us?'/us':'')+'/soulmate', prefix=(us?'/api/us':'/api')+'/soulmate';
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await context.addInitScript(us=>{sessionStorage.setItem(us?'astrorekha-us-soulmate-checkout-details-v1':'astrorekha-soulmate-checkout-details-v1',JSON.stringify({answers:{name:'Fixture',heart:'I keep attracting the wrong people',preferenceSelection:'I like men',preference:'I like men',feeling:'Safe — someone who stays',birthDate:'2003-06-28',ethnicity:us?'White':'North Indian'},planId:'standard',email:'fixture@example.com',phone:'9999999999',savedAt:Date.now()}))},us);
   await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname===prefix+'/payment/status'?{status:'failed'}:{success:true}});return route.continue()});
   const page=await context.newPage();lastPage=page;lastRecords={legacy:true,us};await page.goto(base+canonical+'?checkout=back');
   await page.getByText('Only 2 slots left',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Choose Soulmate Sketch',exact:true}).click();await page.waitForURL(base+canonical+'/checkout?plan=standard');
   await page.getByRole('heading',{name:'I will draw your soulmate',exact:true}).waitFor();
   assert.match(await page.locator('body').innerText(),/best\s+price\s+guaranteed/i);
   await page.goto(base+canonical+'/payment?order='+(us?'us_sm_':'sm_')+'f'.repeat(20));
   const retry=page.getByRole('link',{name:'Return to checkout'});await retry.waitFor();assert.equal(await retry.getAttribute('href'),canonical+'?checkout=retry');
   await context.unrouteAll({behavior:"wait"});await context.close();console.log('PASS original '+(us?'US':'India')+' offer, canonical checkout and failed-order retry remain unchanged');
  }
 }catch(error){if(lastPage&&!lastPage.isClosed()){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({url:lastPage.url(),body:await lastPage.locator('body').innerText(),records:lastRecords},null,2));await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true})}throw error;}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
