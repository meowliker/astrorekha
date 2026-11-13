const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { acquisitionChannel: channel, acquisitionTouch: touch, isAcquisitionTest, summarizeAcquisition: summarize } = require('../src/lib/admin-acquisition');

test('paid source evidence, organic traffic and Discover routes stay distinct', () => {
  assert.equal(channel({ url: 'https://astrorekha.com/discover' }), 'google');
  assert.equal(channel({ utm_source: 'google', utm_medium: 'organic' }), 'other');
  assert.equal(channel({ utm_source: 'facebook', utm_medium: 'social', fbclid: 'click' }), 'other');
  assert.equal(channel({ fbclid: 'click' }), 'other');
  for (const key of ['gclid', 'gbraid', 'wbraid']) assert.equal(channel({ url: `https://astrorekha.com/?${key}=real-click` }), 'google');
  assert.equal(channel({ utm_source: 'Google', utm_medium: 'CPC' }), 'google');
  assert.equal(channel({ utm_source: 'instagram', utm_medium: 'paid_social' }), 'meta');
  assert.equal(channel({ meta_campaign_id: '12345' }), 'meta');
  assert.equal(channel({ meta_campaign_id: '{{campaign.id}}' }), 'other');
  assert.equal(channel({ utm_source: 'newsletter', utm_medium: 'paid', meta_campaign_id: '123' }), 'other');
});
test('whole last touch overrides older Meta attribution; QA is excluded', () => {
  assert.equal(channel(touch({ utm_source: 'meta', utm_medium: 'paid', meta_campaign_id: '123', last_touch: { utm_source: 'google', utm_medium: 'organic' } })), 'other');
  assert.equal(channel(touch({ attribution: { marketing: { landing_url: 'https://astrorekha.com/us/soulmate/discover?gclid=abc' } } })), 'google');
  assert.equal(isAcquisitionTest({ attribution: { trackingEnvironment: 'local', marketing: {} } }), true);
  assert.equal(isAcquisitionTest({ last_touch: { utm_source: 'codex_qa' } }), true);
});
const order = (id, source, amount, currency = 'INR') => ({ id, channel: source, amount, currency, at: '2026-11-10T05:59:59Z', product: 'Palm + Birth Chart', campaign: 'Campaign one' });
test('both sums unique paid orders, keeps USD separate, and never includes other', () => {
  const report = summarize([order('a','meta',65962),order('a','meta',65962),order('b','google',188682),order('c','other',500),order('d','google',1999,'USD')], [], 'both',330);
  assert.equal(report.totals.reduce((n,r)=>n+r.orders,0),3);
  assert.equal(report.totals.filter(r=>r.currency==='INR').reduce((n,r)=>n+r.grossMinor,0),254644);
  assert.equal(report.totals.filter(r=>r.currency==='USD').reduce((n,r)=>n+r.grossMinor,0),1999);
  assert.equal(report.products.reduce((n,r)=>n+r.orders,0),3);
  assert.equal(report.otherOrders,1);
  assert.equal(report.totals.some(r=>r.channel==='other'),false);
});
test('source filtering applies consistently to tables and traffic', () => {
  const report=summarize([order('a','meta',100),order('b','google',200)], [{id:'e1',channel:'meta'},{id:'e2',channel:'google'},{id:'e2',channel:'google'}], 'google',330);
  for(const rows of [report.totals,report.products,report.daily,report.campaigns]) assert.ok(rows.every(r=>r.channel==='google'));
  assert.equal(report.landingCounts.google,1); assert.equal(report.landingCounts.meta,0);
});
test('11:30 IST boundary and Indian midnight bucket independently; empty USD stays USD', () => {
  assert.equal(summarize([order('a','meta',100)], [],'meta',-360).daily[0].date,'2026-11-09');
  assert.equal(summarize([order('a','meta',100)], [],'meta',330).daily[0].date,'2026-11-10');
  assert.deepEqual(summarize([],[],'google',330,'USD').totals.map(r=>r.currency),['USD']);
});

test('owner-assigned landing pages are a fallback, never override explicit evidence',()=>{
 for(const entry of ['/discover','/soulmate/discover','/us/soulmate/discover']) {
   assert.equal(channel({landing_path:entry}),'google');
   assert.equal(channel({landing_url:`https://astrorekha.com${entry}/?foo=bar`}),'google');
   assert.equal(channel({landing_path:entry,utm_source:'facebook',utm_medium:'cpc'}),'meta');
   assert.equal(channel({landing_path:entry,utm_source:'google',utm_medium:'organic'}),'other');
   assert.equal(channel({landing_path:entry,utm_source:'newsletter',utm_medium:'email'}),'other');
 }
 for(const entry of ['/','/soulmate','/us/soulmate'])assert.equal(channel({landing_path:entry}),'meta');
 for(const url of ['https://evil.example/discover','https://astrorekha.com/discoveries','https://astrorekha.com/reports','//evil.example/discover'])assert.equal(channel({landing_url:url}),'other');
 assert.equal(channel({landing_path:'/soulmate',gclid:'actual-google'}),'google');
 assert.equal(channel(touch({last_touch:{utm_source:'newsletter'},landing_path:'/discover'})),'other');
});

test('nested event tags and server cookie aliases remain usable',()=>{assert.equal(channel(touch({attribution:{gclid:'x'},path:'/us'})),'google');assert.equal(channel({campaign_id:'123'}),'meta');assert.equal(channel({landing_path:'/us'}),'meta');});

test('normal workspace keeps Instagram and direct sales; dedicated Google funnels never leak',()=>{
 const {matchesAdSource,workspaceChannel}=require('../src/lib/admin-acquisition');
 const normal=[{last_touch:{utm_source:'ig',utm_medium:'social',utm_content:'link_in_bio',landing_path:'/'}},{last_touch:{utm_source:'newsletter',utm_medium:'email',landing_path:'/'}},{}];
 for(const row of normal){assert.equal(matchesAdSource(row,'meta'),true);assert.equal(matchesAdSource(row,'google'),false);}
 // Paid attribution remains honest while workspace membership includes the receipt.
 assert.equal(channel(touch(normal[0])),'other');
 for(const path of ['/discover','/soulmate/discover','/us/soulmate/discover']) {
  for(const tags of [{},{utm_source:'ig',utm_medium:'social'},{utm_source:'facebook',utm_medium:'paid'}]) {
   const row={last_touch:{landing_path:path,...tags}};
   assert.equal(workspaceChannel(row),'google');assert.equal(matchesAdSource(row,'meta'),false);
  }
 }
 assert.equal(workspaceChannel({last_touch:{landing_path:'/',gclid:'click'}}),'google');
 assert.equal(matchesAdSource({last_touch:{utm_source:'codex_qa',landing_path:'/'}},'meta'),false);
});
