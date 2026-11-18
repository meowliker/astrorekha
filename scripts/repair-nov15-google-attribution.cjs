// Metadata-only correction backed by an exact Google click and payment-return match.
// Default is read-only. --apply changes only this existing order and its internal purchase event.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {createClient}=require('@supabase/supabase-js'),{google}=require('googleapis');
const {paymentAttributionPatch,checkoutAdTouch}=require('../src/lib/checkout-attribution');
const ORDER='pnlee4998a9911723406135d83d',ACCOUNT='4870113996',CAMPAIGN='24406367754';
(async()=>{
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const {data:before,error}=await db.from('payments').select('*').eq('id',ORDER).single();if(error)throw error;
 assert.equal(before.amount,188682);assert.equal(before.currency,'INR');assert.equal(before.payment_status,'paid');assert.equal(before.gateway,'pinelabs');assert.ok(before.fulfilled_at);
 const {data:events,error:eventError}=await db.from('marketing_events').select('*').eq('user_id',before.user_id).gte('created_at','2026-11-15T10:14:40Z').lt('created_at','2026-11-15T10:16:00Z');if(eventError)throw eventError;
 const arrivals=events.filter(e=>{try{const u=new URL(e.url);return e.event_name==='page_view'&&u.pathname==='/discover'&&u.searchParams.get('gad_campaignid')===CAMPAIGN&&u.searchParams.has('gclid')}catch{return false}});
 assert.equal(arrivals.length,1,'Require one exact arrival for this buyer');const arrival=arrivals[0];
 assert.ok(Date.parse(arrival.created_at)>Date.parse(before.created_at));assert.ok(Date.parse(arrival.created_at)<Date.parse(before.fulfilled_at));
 assert.ok(events.some(e=>{try{return new URL(e.url).pathname==='/payment/processing'&&new URL(e.url).searchParams.get('txnid')===ORDER&&e.visitor_id===arrival.visitor_id}catch{return false}}),'Require same-browser return to this order');
 const touch=checkoutAdTouch(arrival.url,'https://astrorekha.com');assert.equal(touch.google_campaign_id,CAMPAIGN);
 const auth=new google.auth.GoogleAuth({credentials:{client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,private_key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/adwords']});
 const response=await fetch(`https://googleads.googleapis.com/v26/customers/${ACCOUNT}/googleAds:search`,{method:'POST',headers:{Authorization:`Bearer ${await auth.getAccessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({query:`SELECT campaign.id, click_view.gclid FROM click_view WHERE segments.date = '2026-11-15' AND campaign.id = ${CAMPAIGN}`})});
 if(!response.ok)throw Error('Google click verification failed');const clicks=await response.json();assert.ok(clicks.results?.some(x=>x.clickView?.gclid===touch.gclid),'Exact Google click must exist in Astro USA');
 const patch=paymentAttributionPatch(touch,arrival.created_at);
 patch.last_touch={...patch.last_touch,attribution_origin:'verified_google_click_repair',google_ads_customer_id:ACCOUNT,evidence_event_id:arrival.id,checkout_touch:before.last_touch?.checkout_touch||before.last_touch};
 const {data:purchaseEvents,error:peError}=await db.from('marketing_events').select('*').eq('payment_id',ORDER).eq('event_name','purchase_success');if(peError)throw peError;assert.equal(purchaseEvents.length,1,'Require one existing internal purchase, never insert');
 const eventPatch=Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','click_id','fbclid','meta_campaign_id','meta_adset_id','meta_ad_id','landing_path','landing_url','attribution_captured_at'].map(k=>[k,patch[k]]));
 const apply=process.argv.includes('--apply');
 if(apply){
  const backup=path.join('/tmp',`astro-nov15-attribution-backup-${Date.now()}.json`);fs.writeFileSync(backup,JSON.stringify({before,purchaseEvents,patch,eventPatch},null,2),{mode:0o600});console.log('Private backup:',backup);
  if(before.last_touch?.attribution_origin!=='verified_google_click_repair'){
   assert.equal(before.utm_source,'facebook','Refuse to overwrite an unexpected attribution');
   const saved=await db.from('payments').update(patch).eq('id',ORDER).eq('payment_status','paid').eq('amount',188682).eq('last_touch',JSON.stringify(before.last_touch)).select('id');if(saved.error)throw saved.error;assert.equal(saved.data.length,1,'Order changed concurrently');
  }
  const ep=await db.from('marketing_events').update(eventPatch).eq('id',purchaseEvents[0].id).eq('payment_id',ORDER).eq('event_name','purchase_success').select('id');if(ep.error)throw ep.error;assert.equal(ep.data.length,1);
  const after=await db.from('payments').select('*').eq('id',ORDER).single();if(after.error)throw after.error;
  for(const k of Object.keys(before))if(!(k in patch))assert.deepEqual(after.data[k],before[k],`Unexpected change: ${k}`);
  const afterEvents=await db.from('marketing_events').select('*').eq('payment_id',ORDER).eq('event_name','purchase_success');if(afterEvents.error)throw afterEvents.error;assert.equal(afterEvents.data.length,1);
  for(const k of Object.keys(purchaseEvents[0]))if(!(k in eventPatch))assert.deepEqual(afterEvents.data[0][k],purchaseEvents[0][k],`Unexpected event change: ${k}`);
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',order:ORDER,amountInr:1886.82,account:ACCOUNT,campaign:CAMPAIGN,landing:'/discover',google:true,meta:false,existingPurchaseEvents:purchaseEvents.length,unchanged:'payment, amount, first touch, fulfillment, entitlements, GA4/Meta delivery flags and transaction ID'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
