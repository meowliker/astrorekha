// No live payments: all API/gateway traffic is intercepted with fixtures.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3117';
(async()=>{
 const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const passed=[];
 try {
  for (const mode of ['legacy-email-step','owned-email-step','legacy-already-overwritten','same-email']) {
   const context=await browser.newContext({viewport:{width:375,height:812}});
   await context.addInitScript(mode=>{
    if(sessionStorage.getItem('seeded'))return;
    sessionStorage.setItem('seeded','yes');
    localStorage.setItem('astrorekha_email',mode==='legacy-already-overwritten'?'new@example.com':'old@example.com');
    localStorage.setItem('astrorekha_checkout_email',mode==='legacy-already-overwritten'?'new@example.com':'old@example.com');
    localStorage.setItem('astrorekha_user_id','old-id');localStorage.setItem('astrorekha_anon_id','old-id');
    localStorage.setItem('astrorekha-user',JSON.stringify({state:{userId:'old-id',coins:30,purchasedBundle:'palm-reading'},version:0}));
    localStorage.setItem('astrorekha_payment_completed','true');localStorage.setItem('astrorekha_registration_completed','true');
    localStorage.setItem('astrorekha_whatsapp_number','9999999999');
    localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:'old-txn',type:'bundle',bundleId:'palm-reading',...(mode==='owned-email-step'?{email:'old@example.com'}:{})}));
   },mode);
   let initiated=0;const statusIds=[],errors=[];
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.href.includes('jssdk.payu.in/bolt/'))return route.fulfill({contentType:'application/javascript',body:'window.bolt={launch:function(p){window.__launchedTxn=p.txnid}};'});
    if(url.origin!==base)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let json={success:true};
    if(url.pathname==='/api/payu/status'){
     if(url.searchParams.has('checkoutEmail')) json={success:true,matchesCheckout:url.searchParams.get('checkoutEmail')==='old@example.com'};
     else {statusIds.push(url.searchParams.get('txnid'));json={success:true,status:'pending'}}
    } else if(url.pathname==='/api/user/payment-state') {
     assert.equal(url.searchParams.has('userId'),false,'new email must not inherit old ID lookup');
     assert.equal(url.searchParams.get('email'),'new@example.com');
     json={hasPaidBundlePayment:false,hasRegisteredAccount:false};
    } else if(url.pathname==='/api/payu/initiate-payment') {
     initiated++;const body=request.postDataJSON();assert.equal(body.email,'new@example.com');assert.notEqual(body.userId,'old-id');assert.ok(body.userId);
     json={txnId:'new-txn',amount:'659.62',email:body.email,firstName:'Fixture',phone:'9999999999',key:'fixture',hash:'fixture'};
    }
    return route.fulfill({json});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(mode.endsWith('email-step')) {
    await page.goto(`${base}/onboarding/step-15`);
    await page.getByPlaceholder('Enter your email').fill('NEW@example.com');
    await page.getByPlaceholder('Enter WhatsApp number').fill('9999999999');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await page.waitForURL('**/onboarding/bundle-pricing');
   } else await page.goto(`${base}/onboarding/bundle-pricing`);
   if(mode==='same-email') {
    await page.waitForURL('**/payment/processing?txnid=old-txn');assert.equal(initiated,0);
   } else {
    const button=page.getByRole('button',{name:/Get My Reading/}).last();
    await button.waitFor();await page.waitForFunction(()=>!!window.bolt);await button.click();
    await page.waitForFunction(()=>window.__launchedTxn==='new-txn');
    assert.equal(initiated,1);assert.ok(!statusIds.includes('old-txn'));
    const state=await page.evaluate(()=>({pending:JSON.parse(localStorage.getItem('astrorekha_pending_payu_payment')),history:JSON.parse(localStorage.getItem('astrorekha_pending_payu_history')),paid:localStorage.getItem('astrorekha_payment_completed'),registered:localStorage.getItem('astrorekha_registration_completed')}));
    assert.equal(state.pending.txnid,'new-txn');assert.equal(state.pending.email,'new@example.com');assert.ok(state.history.some(p=>p.txnid==='old-txn'));assert.equal(state.paid,null);assert.equal(state.registered,null);
    await page.reload();await page.waitForURL('**/payment/processing?txnid=new-txn');assert.equal(initiated,1);
   }
   assert.deepEqual(errors,[]);passed.push(mode);await context.close();
  }
  console.log(JSON.stringify({passed},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
