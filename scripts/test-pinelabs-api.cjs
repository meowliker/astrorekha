const assert = require('node:assert/strict');
const {test, beforeEach} = require('node:test');
const {createHmac} = require('node:crypto');
const Module = require('node:module'), path = require('node:path');
require('ts-node').register({transpileOnly:true, compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name,parent,...rest) {return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
let logs, bindings;
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>({from:()=>({
  insert:row=>({abortSignal:async()=>{logs.push(row);return {error:null}}}),
  update:row=>{bindings.push(row);const q={eq:()=>q,then:resolve=>resolve({error:null})};return q}
})})});
const api=require('../src/lib/pinelabs-api');
const {validatePineLabsRefund}=require('../src/lib/pinelabs-refunds');
const {openPaytmCheckout}=require('../src/lib/payment-checkout-browser');
const order={id:'pnl'+'a'.repeat(24),amount:65962,currency:'INR',payment_mode:'live',customer_email:'fixture@example.com'};
const success=()=>({merchant_id:'421588',merchant_order_reference:order.id,order_id:'remote-1',type:'CHARGE',status:'PROCESSED',order_amount:{value:65962,currency:'INR'},payments:[{id:'txn-1',status:'PROCESSED',payment_amount:{value:65962,currency:'INR'},created_at:'2026-01-01T10:00:00Z',updated_at:'2026-01-01T10:02:00Z'}]});
beforeEach(()=>{Object.assign(process.env,{PINELABS_CLIENT_ID:'fixture-client',PINELABS_CLIENT_SECRET:'fixture-secret',PINELABS_MERCHANT_ID:'421588',PINELABS_ENVIRONMENT:'production',PINELABS_CALLBACK_SECRET:'ab'.repeat(32)});delete process.env.PINELABS_CALLBACK_ORIGIN;delete process.env.LOCAL_PAYMENT_GATEWAY;logs=[];bindings=[];});
test('only matching merchant, order, currency, exact full amount and processed payment grant access',()=>{
 assert.deepEqual(api.validatePineLabsOrder(order,success()),{status:'paid',transactionId:'txn-1',paidAt:'2026-01-01T10:02:00.000Z'});
 for(const patch of [{merchant_id:'other'},{merchant_order_reference:'other'},{type:'REFUND'},{order_amount:{value:1,currency:'INR'}},{order_amount:{value:65962,currency:'USD'}},{pre_auth:true},{part_payment:true},{payments:[]},{payments:[...success().payments,...success().payments]}]) assert.throws(()=>api.validatePineLabsOrder(order,{...success(),...patch}));
 assert.throws(()=>api.validatePineLabsOrder({...order,gateway_order_id:'wrong'},success()));
 assert.throws(()=>api.validatePineLabsOrder({...order,gateway_transaction_id:'wrong'},success()));
 for(const status of ['CREATED','PENDING','ATTEMPTED','AUTHORIZED']) assert.equal(api.validatePineLabsOrder(order,{...success(),status}).status,'pending');
 for(const status of ['FAILED','CANCELLED']) assert.equal(api.validatePineLabsOrder(order,{...success(),status}).status,'failed');
 assert.throws(()=>api.validatePineLabsOrder(order,{...success(),status:'UNKNOWN'}));
 assert.throws(()=>api.pineLabsTimestamp('2026-01-01 10:00:00'));
 assert.throws(()=>api.pineLabsTimestamp('2099-01-01T10:00:00Z'));
});
test('return tokens bind original checkout, merchant, environment, origin and time',()=>{
 const now=Date.now();const token=api.pineLabsReturnToken(order.id,Math.floor(now/1000));
 assert.equal(api.readPineLabsReturnToken(token,now),order.id);
 assert.equal(api.readPineLabsReturnToken(token.replace(order.id,'pnl'+'b'.repeat(24)),now),null);
 assert.equal(api.readPineLabsReturnToken(token,now+86401000),null);
 assert.equal(api.readPineLabsReturnToken(token+'.extra',now),null);
 assert.equal(api.readPineLabsReturnToken('invalid',now),null);
 process.env.PINELABS_MERCHANT_ID='other';assert.equal(api.readPineLabsReturnToken(token,now),null);
 process.env.PINELABS_MERCHANT_ID='421588';process.env.PINELABS_ENVIRONMENT='uat';assert.equal(api.readPineLabsReturnToken(token,now),null);
 process.env.PINELABS_ENVIRONMENT='production';process.env.PINELABS_CALLBACK_ORIGIN='https://other.example';assert.equal(api.readPineLabsReturnToken(token,now),null);
});
test('raw webhook signature binds body, ID and timestamp; old replays and unsupported versions fail',()=>{
 const raw='{"event_type":"ORDER_PROCESSED","data":{"order_id":"remote-1"}}';
 const now=Date.now(),ts=String(Math.floor(now/1000));
 const sig=createHmac('sha256',Buffer.from(process.env.PINELABS_CLIENT_SECRET,'utf8')).update(`event-1.${ts}.${raw}`).digest('base64');
 const headers=new Headers({'webhook-id':'event-1','webhook-timestamp':ts,'webhook-signature':`v1,${sig}`});
 assert.equal(api.verifyPineLabsWebhook(raw,headers,now),true);
 assert.equal(api.verifyPineLabsWebhook(raw+' ',headers,now),false);
 assert.equal(api.verifyPineLabsWebhook(raw,headers,now+301000),false);
 headers.set('webhook-signature',`v2,${sig}`);assert.equal(api.verifyPineLabsWebhook(raw,headers,now),false);
});
test('official Pine Labs webhook example verifies using the client secret without a separate key',()=>{
 // Fixed published example, independent of this implementation’s signing code:
 // https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks/signature-verification
 process.env.PINELABS_CLIENT_SECRET='abc1234';
 const headers=new Headers({'webhook-id':'msg_2nEfCaUDn9fynC9Kz2upo1QSydl','webhook-timestamp':'1728543028','webhook-signature':'v1,Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ='});
 const previous=process.env.PINELABS_WEBHOOK_SECRET;
 try {
  delete process.env.PINELABS_WEBHOOK_SECRET;
  assert.equal(api.pineLabsSigningConfigured(),true);
  assert.equal(api.verifyPineLabsWebhook('{"payload":"payload"}',headers,1728543028000),true);
  process.env.PINELABS_WEBHOOK_SECRET='obsolete-placeholder';
  assert.equal(api.verifyPineLabsWebhook('{"payload":"payload"}',headers,1728543028000),true);
  process.env.PINELABS_CLIENT_SECRET='YWJjMTIzNA==';
  assert.equal(api.verifyPineLabsWebhook('{"payload":"payload"}',headers,1728543028000),false);
  delete process.env.PINELABS_CLIENT_SECRET;
  assert.equal(api.verifyPineLabsWebhook('{"payload":"payload"}',headers,1728543028000),false);
  assert.equal(api.pineLabsSigningConfigured(),false);
 } finally {if(previous===undefined)delete process.env.PINELABS_WEBHOOK_SECRET;else process.env.PINELABS_WEBHOOK_SECRET=previous;}
});
test('webhook diagnostics distinguish rejection causes without including sensitive input',()=>{
 const now=Date.now(),timestamp=String(Math.floor(now/1000)),raw='{"customer":"private@example.com"}';
 const headers=new Headers();
 assert.equal(api.inspectPineLabsWebhookSignature(raw,headers,now).reason,'missing_headers');
 headers.set('webhook-id','private-event');headers.set('webhook-timestamp',timestamp);headers.set('webhook-signature','bad');
 assert.equal(api.inspectPineLabsWebhookSignature(raw,headers,now).reason,'unsupported_signature_format');
 headers.set('webhook-signature','v1,'+Buffer.alloc(32).toString('base64'));
 assert.equal(api.inspectPineLabsWebhookSignature(raw,headers,now).reason,'signature_mismatch');
 assert.equal(api.inspectPineLabsWebhookSignature(raw,headers,now+301000).reason,'timestamp_outside_window');
 assert.equal(JSON.stringify(api.inspectPineLabsWebhookSignature(raw,headers,now)).includes('private'),false);
});
test('checkout uses saved amount and unique reference, persists binding, and never logs credentials',async()=>{
 let requests=0;
 global.fetch=async(url,options)=>{
  requests++;assert.ok(url.startsWith('https://api.pluralpay.in/'));assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);
  if(url.endsWith('/token')){assert.equal(body.grant_type,'client_credentials');return Response.json({access_token:'secret-token'})}
  assert.equal(options.headers.Authorization,'Bearer secret-token');assert.equal(body.merchant_order_reference,order.id);
  assert.deepEqual(body.order_amount,{value:65962,currency:'INR'});assert.equal(body.pre_auth,false);
  const callback=new URL(body.callback_url);assert.equal(callback.origin+callback.pathname,'https://astrorekha.com/api/pinelabs/callback');assert.equal(api.readPineLabsReturnToken(callback.searchParams.get('state')),order.id);
  return Response.json({order_id:'remote-1',redirect_url:'https://api.pluralpay.in/api/v3/checkout-bff/redirect/checkout?token=secret'});
 };
 assert.equal((await api.initiatePineLabsCheckout(order)).gateway,'pinelabs');assert.equal(requests,2);
 assert.deepEqual(bindings,[{gateway_order_id:'remote-1'}]);
 assert.ok(!JSON.stringify(logs).includes('fixture-secret'));assert.ok(!JSON.stringify(logs).includes('secret-token'));
});
test('saved orders cannot cross test/live environments and outages do not create repeated checkout requests',async()=>{
 let calls=0;global.fetch=async()=>{calls++;throw Error('offline')};
 await assert.rejects(api.fetchPineLabsOrder(order.id,'test'));assert.equal(calls,0);
 await assert.rejects(api.initiatePineLabsCheckout(order));assert.equal(calls,1);assert.equal(logs[0].outcome,'network_error');
 process.env.PINELABS_ENVIRONMENT='unknown';assert.throws(api.pineLabsConfig);
});
test('read-only status request uses documented reference lookup and requires a response body',async()=>{
 global.fetch=async(url)=>url.endsWith('/token')?Response.json({access_token:'token'}):(assert.equal(url,`https://api.pluralpay.in/api/pay/v1/orders/reference/${order.id}`),Response.json({data:success()}));
 assert.equal((await api.fetchPineLabsOrder(order.id,'live')).status,'PROCESSED');
 global.fetch=async(url)=>url.endsWith('/token')?Response.json({access_token:'token'}):Response.json({});
 await assert.rejects(api.fetchPineLabsOrder(order.id,'live'),/response missing/);
});
test('only official HTTPS checkout destinations launch; PayU path is unchanged',()=>{
 let destination;global.window={location:{assign:url=>{destination=url}}};
 assert.equal(openPaytmCheckout({gateway:'pinelabs',action:'https://api.pluralonline.com/api/v3/checkout-bff/redirect/checkout?token=fixture'}),true);
 assert.match(destination,/api.pluralonline.com/);
 assert.equal(openPaytmCheckout({gateway:'pinelabs',action:'https://api.pluralpay.in/api/v3/checkout-bff/redirect/checkout?token=fixture'}),true);
 assert.match(destination,/api.pluralpay.in/);
 for(const action of ['http://api.pluralonline.com','https://evil.example','https://api.pluralonline.com.evil.example','https://user:pass@api.pluralonline.com'])assert.throws(()=>openPaytmCheckout({gateway:'pinelabs',action}));
 assert.equal(openPaytmCheckout({gateway:'payu'}),false);
});
test('refund records require a processed refund against the original merchant and parent order',()=>{
 const original={gateway_order_id:'remote-1',amount:65962};
 const refund={...success(),order_id:'refund-1',type:'REFUND',parent_order_id:'remote-1',order_amount:{value:10000,currency:'INR'},updated_at:'2026-01-02T10:00:00Z'};
 assert.deepEqual(validatePineLabsRefund(original,refund),{amount:10000,occurredAt:'2026-01-02T10:00:00.000Z',refundId:'refund-1'});
 for(const patch of [{merchant_id:'wrong'},{parent_order_id:'wrong'},{type:'CHARGE'},{status:'PENDING'},{order_amount:{value:70000,currency:'INR'}},{updated_at:''}])assert.throws(()=>validatePineLabsRefund(original,{...refund,...patch}));
});
test('local callback is explicit and cannot leak into a hosted or production build',()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL:process.env.VERCEL};
 try{process.env.NODE_ENV='development';delete process.env.VERCEL;process.env.LOCAL_PAYMENT_GATEWAY='pinelabs';
 assert.throws(api.pineLabsCallbackOrigin,/local/);process.env.PINELABS_CALLBACK_ORIGIN='http://localhost:3114';assert.equal(api.pineLabsCallbackOrigin(),'http://localhost:3114');
 process.env.VERCEL='1';assert.throws(api.pineLabsCallbackOrigin);delete process.env.VERCEL;process.env.NODE_ENV='production';assert.throws(api.pineLabsCallbackOrigin);
 }finally{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
