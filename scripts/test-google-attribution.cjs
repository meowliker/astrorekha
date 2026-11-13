const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const Module=require('node:module'),resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.join(process.cwd(),'src',id.slice(2)):id,...args)};
const {sanitizePaymentAttribution,resolvePaymentAttribution}=require('../src/lib/attribution');
const {parseTouch}=require('../src/lib/order-attribution');
const {middleware}=require('../src/middleware');const {NextRequest}=require('next/server');
for(const key of ['gclid','gbraid','wbraid'])test(`${key} survives landing cookie and checkout normalization`,async()=>{
 const response=await middleware(new NextRequest(`https://astrorekha.com/discover?${key}=google-click`));
 const raw=response.cookies.get('ar_utm_last')?.value;assert.ok(raw);
 const touch=parseTouch(raw),result=resolvePaymentAttribution(touch,{utm_source:'facebook',utm_campaign:'old',meta_campaign_id:'123'});
 assert.equal(touch[key],'google-click');assert.equal(result[key],'google-click');assert.equal(result.utm_source,'google');assert.equal(result.utm_medium,'cpc');assert.equal(result.meta_campaign_id,undefined);assert.equal(result.utm_campaign,undefined);assert.equal(result.landing_path,'/discover');
});
test('funnel cookies stay separate; untagged navigation never replaces a touch',async()=>{
 for(const [route,prefix] of [['/discover','ar_utm'],['/soulmate/discover','ar_soulmate_utm'],['/us/soulmate/discover','ar_us_soulmate_utm']]){
  const response=await middleware(new NextRequest(`https://astrorekha.com${route}?gclid=test`));assert.equal(response.cookies.getAll().length,2);assert.ok(response.cookies.get(`${prefix}_last`));
  const existing=response.cookies.get(`${prefix}_first`).value;
  const repeat=await middleware(new NextRequest(`https://astrorekha.com${route}?utm_source=facebook&utm_medium=paid_social`,{headers:{cookie:`${prefix}_first=${encodeURIComponent(existing)}`}}));assert.equal(repeat.cookies.get(`${prefix}_first`),undefined);
 }
 assert.equal((await middleware(new NextRequest('https://astrorekha.com/discover/onboarding/bundle-pricing'))).cookies.getAll().length,0);
});
test('Meta aliases, matching identifiers and referer fallback remain supported',()=>{
 const t=parseTouch(JSON.stringify({utm_source:'meta',utm_medium:'paid_social',meta_campaign_id:'123',meta_ad_id:'456',fbclid:'fbclick'}));
 const r=resolvePaymentAttribution(t,{fbc:'fbc',fbp:'fbp',gclid:'old-google'});assert.equal(r.meta_campaign_id,'123');assert.equal(r.meta_ad_id,'456');assert.equal(r.fbc,'fbc');assert.equal(r.fbp,'fbp');assert.equal(r.gclid,undefined);
 assert.equal(resolvePaymentAttribution(null,{}, {gclid:'referrer-google'}).utm_source,'google');assert.equal(sanitizePaymentAttribution({gclid:12}).gclid,undefined);
});
test('each browser funnel preserves Google touch through clean navigation and replaces older campaigns',()=>{
 for(const [file,getter,landing] of [['attribution-client','getPaymentAttributionPayload','/discover'],['soulmate-attribution-client','getSoulmateAttributionPayload','/soulmate/discover'],['us-soulmate-attribution-client','getSoulmateAttributionPayload','/us/soulmate/discover']]){
  const storage=new Map();global.window={location:{href:`https://astrorekha.com${landing}?utm_source=facebook&utm_medium=paid_social&meta_campaign_id=123`},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};global.document={cookie:'',referrer:''};
  const capture=require(`../src/lib/${file}`)[getter];assert.equal(capture().meta_campaign_id,'123');
  window.location.href=`https://astrorekha.com${landing}?gclid=new-google`;let r=capture();assert.equal(r.gclid,'new-google');assert.equal(r.utm_source,'google');assert.equal(r.meta_campaign_id,undefined);
  window.location.href=`https://astrorekha.com${landing}/checkout`;r=capture();assert.equal(r.gclid,'new-google');assert.ok(r.landing_url.includes('?gclid=new-google'));
  window.location.href=`https://astrorekha.com${landing}?utm_source=meta&utm_medium=cpc&meta_campaign_id=456`;r=capture();assert.equal(r.gclid,undefined);assert.equal(r.meta_campaign_id,'456');
 }
 delete global.window;delete global.document;
});
test('clean entry switches Google/Meta route evidence without overwriting it on later steps',async()=>{
 const old=JSON.stringify({utm_source:'facebook',utm_medium:'cpc',campaign_id:'123',landing_path:'/'});
 const response=await middleware(new NextRequest('https://astrorekha.com/discover',{headers:{cookie:`ar_utm_first=${encodeURIComponent(old)}; ar_utm_last=${encodeURIComponent(old)}`}}));
 const touch=parseTouch(response.cookies.get('ar_utm_last').value);assert.equal(touch.landing_path,'/discover');assert.equal(touch.utm_source,null);assert.equal(response.cookies.get('ar_utm_first'),undefined);
 const reload=await middleware(new NextRequest('https://astrorekha.com/discover',{headers:{cookie:`ar_utm_last=${encodeURIComponent(JSON.stringify(touch))}`}}));assert.equal(reload.cookies.getAll().length,0);
});
