const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const path = require('node:path');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name,parent,...rest) { return resolve.call(this,name.startsWith('@/') ? path.join(__dirname,'../src',name.slice(2)) : name,parent,...rest); };
const { checkedPaymentTotal, checkedReceiptPath, confirmInlinePayment } = require('../src/app/us/soulmate/stripe-inline-client');
const session = (extra={}) => ({currency:'usd',minorUnitsAmountDivisor:100,canConfirm:true,total:{total:{minorUnitsAmount:4366,amount:'$43.66'}},...extra});
test('inline confirmation uses if_required and the Stripe total shown to the buyer', async () => {
 const calls=[]; const actions={getSession:()=>session(),confirm:async options=>{calls.push(options);return{type:'success'}}};
 assert.equal(checkedPaymentTotal(actions.getSession(),4366),'$43.66');
 await confirmInlinePayment(actions,4366);assert.deepEqual(calls,[{redirect:'if_required'}]);
});
test('changed Stripe amounts or currencies block confirmation before a charge', async () => {
 for (const value of [session({currency:'inr'}),session({minorUnitsAmountDivisor:1}),session({total:{total:{minorUnitsAmount:7906,amount:'$79.06'}}})]) {
  let called=false;await assert.rejects(confirmInlinePayment({getSession:()=>value,confirm:async()=>{called=true;return{type:'success'}}},4366),/total changed/);assert.equal(called,false);
 }
});
test('declined cards show Stripe error and can be retried on the same session',async()=>{
 let count=0;const actions={getSession:()=>session(),confirm:async()=>++count===1?{type:'error',error:{message:'Your card was declined.'}}:{type:'success'}};
 await assert.rejects(confirmInlinePayment(actions,4366),/card was declined/);await confirmInlinePayment(actions,4366);assert.equal(count,2);
});
test('receipt navigation accepts only the US internal receipt route',()=>{
 assert.equal(checkedReceiptPath('/us/soulmate/payment?order=us_sm_'+'a'.repeat(20)),'/us/soulmate/payment?order=us_sm_'+'a'.repeat(20));
 for(const path of ['https://checkout.stripe.com/pay','//evil.example','/soulmate/payment?order=sm_123','/us/soulmate/payment?order=us_sm_'+'a'.repeat(20)+'&redirect=evil',null]) assert.throws(()=>checkedReceiptPath(path));
});
test('legacy browser contact data drops phone before it is reused or saved',()=>{
 const state=require('../src/app/us/soulmate/checkout-state');
 const store=new Map();global.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const answers={name:'Maya',heart:'I feel like I’ve been waiting forever',preferenceSelection:'I like men',preference:'I like men',feeling:'Safe — someone who stays',birthDate:'1995-01-01',ethnicity:'White'};
 store.set('astrorekha-us-soulmate-checkout-details-v1',JSON.stringify({answers,planId:'standard',email:'maya@example.com',phone:'2025550123',savedAt:Date.now()}));
 const details=state.readCheckoutDetails();assert.ok(details);assert.equal('phone' in details,false);
 state.saveCheckoutDetails({...details,phone:'2025550123'});
 assert.doesNotMatch(store.get('astrorekha-us-soulmate-checkout-details-v1'),/phone|2025550123/);
 state.clearCheckoutDetails();delete global.sessionStorage;
});
test('email-only US purchases do not produce empty phone hashes',()=>{
 const {soulmatePurchasePayloads}=require('../src/lib/us-soulmate-purchase-tracking');
 const payload=soulmatePurchasePayloads({id:'us_sm_'+'a'.repeat(20),plan:'standard',customer_email:'fixture@example.com',customer_phone:null,amount:4366,base_amount:3700,gst_amount:666,paid_at:'2026-10-17T00:00:00Z',product_info:'Soulmate Sketch'});
 assert.equal('ph' in payload.meta.user_data,false);assert.equal(payload.meta.user_data.em.length,1);
});
test('US analytics counts inline submissions and historical hosted checkouts once per session',()=>{
 const {summarizeSoulmateAnalytics}=require('../src/lib/us-soulmate-analytics');
 const events=['landing_view','checkout_view','stripe_redirect','payment_submit'].map(event=>({event_name:'us_soulmate_'+event,session_id:'fixture',created_at:'2026-10-17T00:00:00Z'}));
 const out=summarizeSoulmateAnalytics(events,[]);assert.equal(out.funnel.find(stage=>stage.label==='Payment submitted').sessions,1);
});
