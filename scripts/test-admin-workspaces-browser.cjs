/* eslint-disable @typescript-eslint/no-require-imports */
// Authenticated read-only smoke test. Blocks all mutations, payment reconciliation and external tracking.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:3226';
(async()=>{const session=JSON.parse(fs.readFileSync(process.env.QA_SESSION_FILE,'utf8'));const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(s=>{localStorage.setItem('admin_session_token',s.id);localStorage.setItem('admin_session_expiry',s.expires_at);},session);
 const blocked=[];
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base)return route.abort();if(!['GET','HEAD'].includes(r.method())){blocked.push(u.pathname);return route.fulfill({status:403,json:{error:'Read-only QA blocks mutations'}});}return route.continue();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [path,title] of [['/admin','Admin Dashboard'],['/admin/us-main/revenue','Revenue Dashboard'],['/admin/us-main/orders','US AstroRekha Orders'],['/admin/us-main/tracking','US AstroRekha tracking'],['/admin/us-main/pricing','Pricing Management'],['/admin/us-main/ab-tests','A/B Tests'],['/admin/access','Workspace access']]){
  await page.goto(base+path,{waitUntil:'networkidle',timeout:60000});await page.waitForTimeout(700);const text=await page.locator('body').innerText();assert.ok(!/Admin service unavailable|You do not have access|Checking workspace access|Unable to load access/.test(text),path+': '+text.slice(0,200));
  assert.ok((await page.locator('h1').innerText()).toLowerCase().includes(title.toLowerCase()),path+': heading '+await page.locator('h1').innerText());
  if(path==='/admin'){const section=page.locator('section').filter({has:page.getByRole('heading',{name:'US AstroRekha workspace',exact:true})});assert.equal(await section.getByRole('button').count(),5);}
  await page.screenshot({path:'/tmp/us-admin-qa-'+path.replaceAll('/','-')+'.png',fullPage:true});console.log('PASS',path);
 }
 assert.deepEqual(errors,[]);console.log('Blocked mutations:',[...new Set(blocked)]);await context.close();
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
