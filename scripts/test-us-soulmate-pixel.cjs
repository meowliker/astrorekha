// All browser/Meta/GA/network interactions are local fixtures.
const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
require('ts-node').register({ transpileOnly:true, compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'} });
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest);};
function stub(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
const React=require('react');
const {create,act}=require('react-test-renderer');
let pathname='/us/soulmate';
stub('next/navigation',{usePathname:()=>pathname});
stub('next/script',({children,id})=>React.createElement('script',{id},children));
for(const name of ['MetaPixel','GoogleAnalytics','Clarity'])stub('../src/components/'+name,{[name]:()=>React.createElement('span',null,name)});
stub('../src/lib/us-soulmate-attribution-client',{getSoulmateAttributionPayload:()=>({utm_source:'fixture'})});
const {trackPixelEvent}=require('../src/lib/us-soulmate-pixel');
const {trackSoulmate}=require('../src/lib/us-soulmate-tracking');
// GTM coverage lives in test-google-tag-manager; isolate the existing vendor assertions here.
stub('../src/components/GoogleTagManager', { GoogleTagManager: () => null });
const {MarketingBoundary}=require('../src/components/MarketingBoundary');
let calls,requests,timers,tree;
const realTimeout=global.setTimeout,realFetch=global.fetch,realEnv=process.env.NODE_ENV;
beforeEach(()=>{
  calls=[];requests=[];timers=[];pathname='/us/soulmate';
  process.env.NODE_ENV='production';process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID='2421426875035260';process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID='G-USFIXTURE';
  global.window={location:{pathname,hostname:'astrorekha.com',href:'https://astrorekha.com'+pathname},fbq:(...args)=>calls.push(args)};
  global.document={addEventListener(){},removeEventListener(){}};
  const store=new Map();global.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  global.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};};
  global.setTimeout=fn=>{timers.push(fn);return timers.length;};
});
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;global.setTimeout=realTimeout;global.fetch=realFetch;process.env.NODE_ENV=realEnv;delete global.window;delete global.document;delete global.sessionStorage;});
test('US bootstrap opts out of automatic clicks before init, with a single initial PageView',()=>{
  act(()=>{tree=create(React.createElement(MarketingBoundary));});
  const script=tree.root.findByProps({id:'us-soulmate-pixel'}).props.children;
  vm.runInNewContext(script,{window,document,fbq:window.fbq});
  assert.equal(window.fbq.disablePushState,true, 'Meta SDK must not also track history navigation');
  assert.deepEqual(calls,[['set','autoConfig',false,'2421426875035260'],['init','2421426875035260'],['trackSingle','2421426875035260','PageView']]);
});
test('SPA navigation emits one US PageView per path change, not per render',()=>{
  act(()=>{tree=create(React.createElement(MarketingBoundary));});
  assert.equal(calls.length,0); // First page belongs to base script.
  pathname='/us/soulmate/checkout';window.location.pathname=pathname;
  act(()=>tree.update(React.createElement(MarketingBoundary)));
  act(()=>tree.update(React.createElement(MarketingBoundary)));
  assert.equal(calls.length,1);assert.equal(calls[0][2],'PageView');
  pathname='/us/soulmate';window.location.pathname=pathname;
  act(()=>tree.update(React.createElement(MarketingBoundary)));
  assert.equal(calls.length,2);
});
test('original app and normal soulmate retain their components and emit no US events',()=>{
  for(const route of ['/welcome','/onboarding/bundle-pricing','/soulmate','/soulmate/checkout']){
    pathname=route;window.location.pathname=route;
    act(()=>{tree=create(React.createElement(MarketingBoundary));});
    assert.deepEqual(tree.root.findAllByType('span').map(n=>n.props.children),['MetaPixel','GoogleAnalytics','Clarity']);
    act(()=>tree.unmount());tree=null;
  }
  assert.equal(calls.length,0);
});
test('slow pixel initialization retains checkout and purchase; purchase marker waits for queue',()=>{
  delete window.fbq;let marked=0;
  trackSoulmate('checkout_view',{plan:'standard',value:43.66,once:'slow'});
  trackSoulmate('checkout_view',{plan:'standard',value:43.66,once:'slow'});
  trackPixelEvent('Purchase',{value:3.04,currency:'USD'},{eventId:'paid-fixture',onQueued:()=>marked++});
  trackPixelEvent('Purchase',{value:3.04,currency:'USD'},{eventId:'paid-fixture',onQueued:()=>marked++});
  assert.equal(marked,0);assert.equal(timers.length,2);
  window.fbq=(...args)=>calls.push(args);while(timers.length)timers.shift()();
  assert.deepEqual(calls.map(c=>c[2]),['InitiateCheckout','Purchase']);
  assert.equal(calls[1][4].eventID,'paid-fixture');assert.equal(marked,1);
});
test('queued US events cannot cross into normal funnel',()=>{
  delete window.fbq;trackPixelEvent('ViewContent');window.location.pathname='/soulmate';window.fbq=(...args)=>calls.push(args);
  while(timers.length)timers.shift()();assert.equal(calls.length,0);
});
test('checkout funnel uses USD standard events; no Subscribe or personal chat data',()=>{
  trackSoulmate('chat_start',{once:'chat-fixture'});trackSoulmate('chat_complete',{once:'chat-fixture'});
  trackSoulmate('add_to_cart',{plan:'express',value:67,once:'cart-fixture'});
  trackSoulmate('checkout_view',{plan:'express',value:101.48,itemIds:['us_soulmate_express','timeline'],once:'checkout-fixture'});
  trackSoulmate('payment_submit',{plan:'express',value:3.04,itemIds:['us_soulmate_express','timeline'],once:'order-fixture'});
  trackSoulmate('payment_submit',{plan:'express',value:3.04,once:'order-fixture'});
  assert.deepEqual(calls.map(c=>c[2]),['SoulmateChatStart','SoulmateChatComplete','AddToCart','InitiateCheckout','AddPaymentInfo','USSourcePaymentSubmit']);
  for(const c of calls){assert.equal(c[1],'2421426875035260');assert.match(c[0],/^trackSingle/);assert.doesNotMatch(JSON.stringify(c),/birthDate|ethnicity|email|Subscribe/);}
  const info=calls.find(c=>c[2]==='AddPaymentInfo')[3];assert.equal(info.currency,'USD');assert.equal(info.value,3.04);assert.equal(info.num_items,2);assert.deepEqual(info.content_ids,['us_soulmate_express','timeline']);
});
