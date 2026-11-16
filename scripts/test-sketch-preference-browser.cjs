// Local production build, isolated synthetic accounts. No real API/provider/payment calls.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3217';
const fs = require('node:fs');
const out='/tmp/ar-sketch-preference-qa';fs.mkdirSync(out,{recursive:true});
const completeAnswers={attracted_to:'female',age_group:'35-40',vibe:'elegant',connection_type:'partnership',love_signal:'time_well_spent',main_worry:'heartbreak'};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const results=[];
 try{
  for(const scenario of [
   {name:'fresh-man',choice:'A man',preference:'male'},
   {name:'fresh-woman',choice:'A woman',preference:'female'},
   {name:'no-preference',choice:'No preference',preference:'any'},
   {name:'restored-female-correct-to-male',saved:completeAnswers,choice:'A man',preference:'male'},
   {name:'missing-subject-custom-config',saved:{...completeAnswers,attracted_to:''},custom:true,choice:'A man',preference:'male'},
  ]){
   const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'});
   await context.addCookies([{name:'ar_access',value:'qa-fixture-only',url:base}]);
   let answers={...scenario.saved}, status='pending',generated=0;const errors=[];
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==base)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let json={success:true};
    if(url.pathname==='/api/auth/session')json={user:{id:'qa-fixture',email:'qa@example.invalid',gender:'female',coins:30,unlocked_features:{soulmateSketch:true}}};
    if(url.pathname==='/api/ab-test/layout-config')json=scenario.custom?{config:{questionOrder:['age_group','connection_type','love_signal','main_worry'],questions:{attracted_to:false}}}:{};
    if(url.pathname==='/api/soulmate-sketch/status')json={status,question_answers:answers,...(status==='complete'?{sketch_image_url:'/favicon.ico',generation_count:1}:{})};
    if(url.pathname==='/api/soulmate-sketch/answers'){answers={...answers,...req.postDataJSON().answers};json={success:true,saved:true,question_answers:answers};}
    if(url.pathname==='/api/soulmate-sketch/generate'){const b=req.postDataJSON();assert.equal(b.confirmedPartnerPreference,scenario.preference);assert.equal(b.answers.attracted_to,scenario.preference);generated++;status='complete';json={success:true,sketch:{status,question_answers:answers,sketch_image_url:'/favicon.ico',generation_count:1}};}
    return route.fulfill({json});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/soulmate-sketch');
   await page.getByRole('heading',{name:'Your Soulmate Portrait'}).waitFor();
   if(scenario.saved?.attracted_to){
    await page.getByRole('heading',{name:'Review your sketch'}).waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByRole('button',{name:'Generate My Soulmate Sketch'}).isEnabled(),false);
    await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Change partner preference'}).click();
   }
   await page.getByRole('heading',{name:'Who should your soulmate sketch show?'}).waitFor();
   await page.getByRole('button',{name:scenario.choice,exact:false}).click();
   // Remaining questions are the established five-question app flow.
   for(const title of (scenario.custom ? ['Which age group is your perfect match?','What kind of connection are you looking for?','What love signal means the most to you?'] : ['Which age group is your perfect match?','What vibe do you want your soulmate to have?'])){
    await page.getByRole('heading',{name:title}).waitFor();
    const first=page.locator('button[aria-pressed]').first();await first.click();
   }
   const worry=page.locator('button[aria-pressed]').first();await worry.waitFor();if(await worry.getAttribute('aria-pressed')!=='true')await worry.click();
   await page.getByRole('heading',{name:'Review your sketch'}).waitFor();
   const checkbox=page.getByRole('checkbox'),generate=page.getByRole('button',{name:'Generate My Soulmate Sketch'});
   assert.equal(await checkbox.isChecked(),false);assert.equal(await generate.isEnabled(),false);assert.equal(generated,0);
   await page.screenshot({path:out+'/'+scenario.name+'.png',fullPage:true});
   await checkbox.check();assert.equal(await generate.isEnabled(),true);await generate.click();await page.getByAltText('Soulmate sketch').waitFor();assert.equal(generated,1);
   await page.reload();await page.getByAltText('Soulmate sketch').waitFor();assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(generated,1);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   results.push({scenario:scenario.name,passed:true});await context.close();
  }
  console.log(JSON.stringify({results},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
