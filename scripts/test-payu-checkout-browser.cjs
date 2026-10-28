// Run against a locally built app with fixture configuration. All API/gateway calls are intercepted.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:3117';
const passed=[];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
  async function scenario(name,{restore=false,mode='missing',responses=['paid'],deadline=false,source=''}={}) {
   const context=await browser.newContext({viewport:{width:375,height:812}});
   await context.addInitScript(({restore,mode})=>{
    if(!sessionStorage.getItem('qa-seeded')){
     localStorage.clear();localStorage.setItem('astrorekha_email','fixture@example.com');localStorage.setItem('astrorekha_whatsapp_number','9999999999');localStorage.setItem('astrorekha_user_id','stale-browser');localStorage.setItem('astrorekha-user',JSON.stringify({state:{userId:'stale-browser'},version:0}));
     if(restore)localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:'qa-txn',type:'bundle',bundleId:'palm-reading',returnTo:'/onboarding/bundle-upsell'}));
     sessionStorage.setItem('qa-seeded','yes');
    }
    window.__qaMode=mode;
    // Speed up only the recovery deadline; leave polling, animation, and navigation timings intact.
   },{restore,mode});
   let initiated=0,statusCalls=0,verifyCalls=0; const errors=[];
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.href.includes('jssdk.payu.in/bolt/'))return route.fulfill({contentType:'application/javascript',body:`window.bolt={launch:function(p,h){window.__qaBoltLaunched=true;if(window.__qaMode==='success'){h.responseHandler({response:{txnStatus:'SUCCESS',txnid:p.txnid}});h.responseHandler({response:{txnStatus:'SUCCESS',txnid:p.txnid}})}if(window.__qaMode==='exception')h.catchException(new Error('popup interrupted'))}};`});
    if(url.origin!==base)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let json={success:true};
    if(['/api/payu/initiate-payment','/api/payments/initiate'].includes(url.pathname)){
     initiated++;json={txnId:'qa-txn',amount:'659.62',productInfo:'Palm Reading',email:'fixture@example.com',firstName:'Fixture',phone:'9999999999',key:'fixture',hash:'fixture'};
    } else if(url.pathname==='/api/payu/status'){
     if(url.searchParams.has('checkoutEmail')) return route.fulfill({json:{success:true,matchesCheckout:true}});
     const status=responses[Math.min(statusCalls++,responses.length-1)];
     if(status==='network')return route.abort('failed');
     if(status==='malformed')return route.fulfill({contentType:'text/html',body:'Temporary gateway error',status:502});
     json={success:true,status,userId:'canonical-customer',type:'bundle',bundleId:'palm-reading',amount:659.62};
    } else if(url.pathname==='/api/payu/verify-payment'){verifyCalls++;return route.abort()}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(json)});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(deadline){await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=function(fn,ms,...args){return original(fn,ms===120000?500:ms,...args)}})}
   await page.goto(source?`${base}/payment/processing?txnid=qa-txn&source=${source}`:`${base}/onboarding/bundle-pricing`);
   if(!restore&&!source){const button=page.getByRole('button',{name:/Get My Reading/}).last();await button.waitFor();await page.waitForFunction(()=>!!window.bolt);await button.click();}
   if(deadline){
    await page.getByRole('button',{name:'Check payment status',exact:true}).first().waitFor({timeout:15000});
    assert.equal(initiated,1);await page.getByRole('button',{name:'Check payment status',exact:true}).first().click();
    await page.waitForURL('**/payment/processing?*');assert.equal(initiated,1);
    await page.getByRole('button',{name:'Check Again'}).waitFor();assert.equal(await page.getByRole('button',{name:'Back to Checkout'}).count(),0);
   }else if(responses.at(-1)==='failed'){
    await page.getByRole('button',{name:'Back to Checkout'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('astrorekha_pending_payu_payment')),null);
   }else{
    await page.waitForURL('**/onboarding/bundle-upsell',{timeout:30000});
    await page.getByRole('heading',{name:'Payment Successful!',exact:true}).waitFor({timeout:15000});
    const state=await page.evaluate(()=>({id:localStorage.getItem('astrorekha_user_id'),store:JSON.parse(localStorage.getItem('astrorekha-user')).state.userId,paid:localStorage.getItem('astrorekha_payment_completed'),pending:localStorage.getItem('astrorekha_pending_payu_payment')}));
    assert.deepEqual(state,{id:'canonical-customer',store:'canonical-customer',paid:'true',pending:null});
   }
   assert.equal(verifyCalls,0,'browser callback must not wait on the vulnerable verification handler');
   assert.equal(initiated,restore||source?0:1);assert.deepEqual(errors,[]);
   if(name==='missing callback'){await page.waitForTimeout(700);await page.screenshot({path:'/tmp/payu-recovery-mobile.png',fullPage:true});}
   passed.push({name,statusCalls,initiated});await context.close();
  }
  await scenario('missing callback');
  await scenario('duplicate success callbacks',{mode:'success'});
  await scenario('popup exception after payment',{mode:'exception'});
  await scenario('network failure and malformed response recover',{restore:true,responses:['network','malformed','pending','paid']});
  await scenario('full reload resumes pending transaction',{restore:true});
  await scenario('failure return cannot override server-confirmed purchase',{restore:true,source:'payu_failure'});
  await scenario('server confirms failure',{restore:true,responses:['failed']});
  await scenario('unresolved payment stops spinner and cannot start a second charge',{responses:['pending'],deadline:true});
  console.log(JSON.stringify({passed},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
