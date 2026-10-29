// Fixture browser test. All API and external traffic is intercepted; no payments or customer records.
const assert=require('node:assert/strict');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:3117';
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});try{
 for(const variant of ['A','B']) for(const outcome of ['paid','failed']){
 const context=await browser.newContext({viewport:{width:390,height:844}});let started=0,hosted=0,checks=0;const errors=[];
 await context.addInitScript(variant=>{localStorage.setItem('astrorekha_onboarding_flow',variant==='B'?'flow-b':'flow-a');localStorage.setItem('astrorekha_layout_variant',variant);if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','yes');localStorage.setItem('astrorekha_email','fixture@example.com');localStorage.setItem('astrorekha_whatsapp_number','9999999999');localStorage.setItem('astrorekha_user_id','fixture-user');localStorage.setItem('astrorekha-user',JSON.stringify({state:{userId:'fixture-user'},version:0}))},variant);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
 if(url.origin==='https://api.pluralonline.com'){
  assert.equal(req.method(),'GET');assert.equal(url.pathname,'/api/v3/checkout-bff/redirect/checkout');assert.equal(url.searchParams.get('token'),'fixture-token');hosted++;
  return route.fulfill({status:303,headers:{location:`${base}/payment/processing?txnid=pnlaaaaaaaaaaaaaaaaaaaaaaaa`},body:''});
 }
 if(url.origin!==base)return route.abort();
 if(!url.pathname.startsWith('/api/'))return route.continue();
 let json={success:true};
 if(url.pathname==='/api/payments/initiate'){started++;json={gateway:'pinelabs',txnId:'pnlaaaaaaaaaaaaaaaaaaaaaaaa',amount:'659.62',action:'https://api.pluralonline.com/api/v3/checkout-bff/redirect/checkout?token=fixture-token'};}
 else if(url.pathname==='/api/payu/status'||url.pathname==='/api/payments/status'){
  if(url.searchParams.has('checkoutEmail'))json={success:true,matchesCheckout:true};else{checks++;json={success:true,status:outcome,userId:'fixture-user',type:'bundle',bundleId:'palm-reading',amount:659.62};}
 }
 return route.fulfill({json});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/onboarding/bundle-pricing`);
 await page.getByRole('button',{name:/Get My Reading/}).last().click();
 if(outcome==='paid'){await page.waitForURL('**/onboarding/bundle-upsell',{timeout:20000});await page.getByRole('heading',{name:'Payment Successful!',exact:true}).waitFor();}
 else await page.getByRole('button',{name:'Back to Checkout'}).waitFor({timeout:20000});
 assert.equal(started,1);assert.equal(hosted,1);assert.ok(checks>=1);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.getItem('astrorekha_pending_payu_payment')),null);
 console.log(`PASS Flow ${variant} Pine Labs mobile hosted checkout -> ${outcome}; PayU SDK blocked, no duplicate checkout`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
