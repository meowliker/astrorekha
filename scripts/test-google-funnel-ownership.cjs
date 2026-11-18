const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {googleOrderCampaign,googleOrderAccount,googleDestination}=require('../src/lib/google-ads-reporting');
const {matchesAdSource}=require('../src/lib/admin-acquisition');
const campaigns=[{id:'24406351803',name:'US NB',accountId:'4870113996'},{id:'24406367754',name:'US Brand',accountId:'4870113996'},{id:'24463480211',name:'India Demand Gen',accountId:'6752275511'}];
test('Google orders on normal routes stay Google and retain their actual account',()=>{
 for(const [path,id,owner,funnel] of [['/discover','24406351803','4870113996','astrorekha'],['/soulmate','24463480211','6752275511','soulmate']]){
  const row={last_touch:{url:`https://astrorekha.com${path}?gclid=click&gad_campaignid=${id}`,utm_source:'google',utm_medium:'cpc'}};
  assert.equal(googleDestination(row.last_touch.url),funnel);assert.equal(googleOrderAccount(row,campaigns),owner);
  assert.equal(matchesAdSource(row,'google'),true);assert.equal(matchesAdSource(row,'meta'),false);
 }
});
test('the unmatched US order is Google but cannot be assigned to either account',()=>{
 const row={attribution:{lastTouch:{url:'https://astrorekha.com/us/soulmate?gclid=click&gad_campaignid=24396464853',utm_source:'google',utm_medium:'cpc'}}};
 assert.equal(matchesAdSource(row,'meta'),false);assert.equal(matchesAdSource(row,'google'),true);assert.equal(googleOrderCampaign(row,campaigns),null);
});
test('legacy campaign names match only a unique campaign, not merely a unique account',()=>{
 assert.equal(googleOrderAccount({utm_campaign:'US NB'},campaigns),'4870113996');
 assert.equal(googleOrderCampaign({utm_campaign:'US NB'},[...campaigns,{id:'duplicate',name:'US NB',accountId:'4870113996'}]),null);
 assert.equal(googleOrderAccount({google_campaign_id:'unknown',utm_campaign:'US NB'},campaigns),null);
});
