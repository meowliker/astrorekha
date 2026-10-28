const assert=require('node:assert/strict');
const {test,beforeEach}=require('node:test');
const Module=require('node:module'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
const C=require('paytmchecksum');
const logs=[];
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>({from:()=>({insert:row=>({abortSignal:async()=>{logs.push(row);return {error:null}}})})})});
const api=require('../src/lib/paytm-api');
const {quotePaymentOrder}=require('../src/lib/payment-quote');
const {DEFAULT_PRICING}=require('../src/lib/pricing');
const {openPaytmCheckout}=require('../src/lib/payment-checkout-browser');
beforeEach(()=>{process.env.PAYTM_MID='fixtureMID';process.env.PAYTM_MERCHANT_KEY='1234567890123456';process.env.PAYTM_ENVIRONMENT='production';delete process.env.PAYTM_CALLBACK_ORIGIN;logs.length=0});
const order={id:'ptm_fixture',amount:65962,currency:'INR',payment_mode:'live',customer_email:'test@example.com'};
const success=()=>({resultInfo:{resultStatus:'TXN_SUCCESS',resultCode:'01'},mid:'fixtureMID',orderId:order.id,txnId:'987654',txnAmount:'659.62'});
test('only exact verified order, merchant, amount and currency can succeed',()=>{
 assert.equal(api.validatePaytmStatus(order,success()),'paid');
 for(const overrides of [{mid:'wrong'},{orderId:'another'},{txnAmount:'1.00'},{txnAmount:'659.62bad'},{currency:'USD'},{txnId:''}]) assert.throws(()=>api.validatePaytmStatus(order,{...success(),...overrides}));
});
test('pending/unknown records and API credential failures never become payment failures',()=>{
 assert.equal(api.validatePaytmStatus(order,{resultInfo:{resultStatus:'NO_RECORD_FOUND'}}),'pending');
 assert.equal(api.validatePaytmStatus(order,{...success(),resultInfo:{resultStatus:'PENDING'}}),'pending');
 assert.equal(api.validatePaytmStatus(order,{...success(),resultInfo:{resultStatus:'TXN_FAILURE'}}),'failed');
 assert.throws(()=>api.validatePaytmStatus(order,{resultInfo:{resultStatus:'TXN_FAILURE',resultCode:'335'}}));
 assert.throws(()=>api.validatePaytmStatus(order,{...success(),resultInfo:{resultStatus:'UNKNOWN'}}));
});
test('callback requires merchant-matched checksum and detects tampering',async()=>{
 const fields={MID:'fixtureMID',ORDERID:order.id,STATUS:'TXN_SUCCESS',TXNAMOUNT:'659.62'};
 fields.CHECKSUMHASH=await C.generateSignature(fields,process.env.PAYTM_MERCHANT_KEY);
 assert.equal(api.verifyPaytmNotification(fields),true);
 assert.equal(api.verifyPaytmNotification({...fields,TXNAMOUNT:'1.00'}),false);
 assert.equal(api.verifyPaytmNotification({...fields,MID:'other'}),false);
});
test('signed initiation uses saved amount and fixed callback; counts one request without secrets',async()=>{
 global.fetch=async(url,opts)=>{
  assert.ok(String(url).startsWith('https://secure.paytmpayments.com/'));
  const request=JSON.parse(opts.body);assert.equal(request.body.txnAmount.value,'659.62');
  assert.equal(request.body.callbackUrl,'https://astrorekha.com/api/paytm/callback');
  assert.equal(C.verifySignature(JSON.stringify(request.body),process.env.PAYTM_MERCHANT_KEY,request.head.signature),true);
  const body={resultInfo:{resultStatus:'S',resultCode:'0000'},txnToken:'fixture-token'};
  return Response.json({body,head:{signature:await C.generateSignature(JSON.stringify(body),process.env.PAYTM_MERCHANT_KEY)}});
 };
 const result=await api.initiatePaytmCheckout(order);assert.equal(result.gateway,'paytm');assert.equal(result.fields.txnToken,'fixture-token');
 assert.equal(logs.length,1);assert.equal(logs[0].operation,'initiate');assert.ok(!JSON.stringify(logs).includes('1234567890123456'));
});
test('invalid signed response and network outage fail safely, count attempt and never retry a charge',async()=>{
 global.fetch=async()=>Response.json({body:success(),head:{signature:'invalid'}});
 await assert.rejects(api.fetchPaytmStatus(order.id,'live'));assert.equal(logs.length,1);
 global.fetch=async()=>{throw new Error('network failure')};await assert.rejects(api.fetchPaytmStatus(order.id,'live'));assert.equal(logs.length,2);
});
test('environment is explicit and saved order cannot cross test/live boundary',async()=>{
 await assert.rejects(api.fetchPaytmStatus(order.id,'test'));assert.equal(logs.length,0);
 delete process.env.PAYTM_ENVIRONMENT;assert.throws(()=>api.paytmConfig());
});
test('catalog quote maps bundle GST, questions, chat pass and rejects hidden reports',()=>{
 const bundle=quotePaymentOrder(DEFAULT_PRICING,{type:'bundle',bundleId:'palm-reading'});
 assert.equal(bundle.amount,bundle.baseAmount+bundle.gstAmount);assert.deepEqual(bundle.features,['palmReading']);assert.equal(bundle.coins,15);
 const coins=DEFAULT_PRICING.coinPackages.find(p=>p.active);assert.ok(coins);
 assert.equal(quotePaymentOrder(DEFAULT_PRICING,{type:'coins',packageId:coins.id}).coins,coins.coins);
 assert.equal(quotePaymentOrder(DEFAULT_PRICING,{type:'chat_pass'}).chatPassMinutes,20);
 for(const id of ['report-past-life','report-future-partner','report-vastu-shastra-guide']) assert.throws(()=>quotePaymentOrder(DEFAULT_PRICING,{type:'report',packageId:id}));
 assert.throws(()=>quotePaymentOrder(DEFAULT_PRICING,{type:'upsell',bundleId:'birth-chart,birth-chart'}));
});
test('PayU launch is untouched; Paytm browser rejects foreign destinations',()=>{
 assert.equal(openPaytmCheckout({gateway:'payu'}),false);
 assert.throws(()=>openPaytmCheckout({gateway:'paytm',action:'https://evil.example/collect',fields:{txnToken:'x'}}));
 let form;global.document={createElement:()=>({appendChild(){},submit(){this.submitted=true}}),body:{appendChild:f=>{form=f}}};
 assert.equal(openPaytmCheckout({gateway:'paytm',action:'https://secure.paytmpayments.com/theia/api/v1/showPaymentPage',fields:{txnToken:'x'}}),true);assert.equal(form.submitted,true);
});
test('refunds need a signed success for the original payment, exact amount and a real refund date',()=>{
 const original={id:order.id,amount:10000,gateway_transaction_id:'987654'};
 const refund={resultInfo:{resultStatus:'TXN_SUCCESS'},mid:'fixtureMID',orderId:order.id,refId:'REF1',refundId:'R1',txnId:'987654',txnAmount:'100.00',refundAmount:'30.00',acceptRefundTimestamp:'2026-01-02 10:00:00.0'};
 assert.deepEqual(api.validatePaytmRefund(original,'REF1',refund),{amount:3000,occurredAt:'2026-01-02T04:30:00.000Z',refundId:'R1'});
 assert.equal(api.validatePaytmRefund(original,'REF1',{...refund,resultInfo:{resultStatus:'PENDING'}}),null);
 for(const patch of [{refId:'wrong'},{txnId:'another'},{mid:'wrong'},{refundAmount:'101.00'},{refundAmount:'NaN'},{acceptRefundTimestamp:''}]) assert.throws(()=>api.validatePaytmRefund(original,'REF1',{...refund,...patch}));
});
test('refund discovery signs the documented date format and cannot accept an API failure as zero refunds',async()=>{
 global.fetch=async(url,opts)=>{const request=JSON.parse(opts.body);assert.equal(request.body.startDate,'2026-01-01T00:00:00+00:00');assert.equal(request.head.tokenType,'CHECKSUM');return Response.json({resultCode:'00000000',orders:[]});};
 assert.deepEqual(await api.listPaytmRefunds(new Date('2026-01-01Z'),new Date('2026-01-02Z'),1),[]);
 global.fetch=async()=>Response.json({resultCode:'00000030',orders:[]});await assert.rejects(api.listPaytmRefunds(new Date(),new Date(),1));
});
test('monitor recognizes signed nonexistent-order responses but not credential or server errors',()=>{
 for(const [resultStatus,resultCode] of [['NO_RECORD_FOUND','331'],['TXN_FAILURE','334']]) assert.equal(api.isExpectedPaytmProbe({resultInfo:{resultStatus,resultCode}}),true);
 for(const resultCode of ['335','501','330']) assert.equal(api.isExpectedPaytmProbe({resultInfo:{resultStatus:'TXN_FAILURE',resultCode}}),false);
});
test('HTTP callback is allowed only for loopback in local development',async()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,VERCEL:process.env.VERCEL,LOCAL_PAYMENT_GATEWAY:process.env.LOCAL_PAYMENT_GATEWAY,PAYTM_CALLBACK_ORIGIN:process.env.PAYTM_CALLBACK_ORIGIN};
 try {
  process.env.NODE_ENV='development';delete process.env.VERCEL;process.env.LOCAL_PAYMENT_GATEWAY='paytm';process.env.PAYTM_CALLBACK_ORIGIN='http://localhost:3114';
  global.fetch=async(url,opts)=>{
   assert.equal(JSON.parse(opts.body).body.callbackUrl,'http://localhost:3114/api/paytm/callback');
   const body={resultInfo:{resultStatus:'S',resultCode:'0000'},txnToken:'fixture'};
   return Response.json({body,head:{signature:await C.generateSignature(JSON.stringify(body),process.env.PAYTM_MERCHANT_KEY)}});
  };
  assert.equal((await api.initiatePaytmCheckout(order)).gateway,'paytm');
  process.env.PAYTM_CALLBACK_ORIGIN='http://example.com';await assert.rejects(api.initiatePaytmCheckout(order),/callback origin/);
  process.env.PAYTM_CALLBACK_ORIGIN='http://localhost:3114';process.env.NODE_ENV='production';await assert.rejects(api.initiatePaytmCheckout(order),/callback origin/);
  process.env.NODE_ENV='development';process.env.VERCEL='1';await assert.rejects(api.initiatePaytmCheckout(order),/callback origin/);
 } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('new Paytm order IDs fit UPI references; existing report and Soulmate references remain readable',()=>{
 const {createPaytmOrderId,isPaytmReportOrderId,isPaytmOrderId}=require('../src/lib/paytm-order-id');
 const ids=Array.from({length:1000},()=>createPaytmOrderId());
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ids){assert.match(id,/^[A-Za-z0-9]+$/);assert.ok(id.length<=35);assert.equal(isPaytmReportOrderId(id),true);assert.equal(isPaytmOrderId(id),true)}
 assert.equal(isPaytmOrderId('ptm_mvs262oic48560a57b31140158097d08'),true);
 assert.equal(isPaytmOrderId('sm_12345678901234567890'),true);
 for(const id of ['pay_123','ptm','ptm_'+'a'.repeat(47),'ptm_abc?x=1'])assert.equal(isPaytmOrderId(id),false);
});
test('oversized UPI checkout references are rejected before calling Paytm; existing ones can still be verified',async()=>{
 const id='ptm_mvs262oic48560a57b31140158097d08';assert.equal(id.length,36);
 let requests=0;global.fetch=async()=>{requests++;const body={...success(),orderId:id};return Response.json({body,head:{signature:await C.generateSignature(JSON.stringify(body),process.env.PAYTM_MERCHANT_KEY)}})};
 await assert.rejects(api.initiatePaytmCheckout({...order,id}),/35-character/);assert.equal(requests,0);
 assert.equal((await api.fetchPaytmStatus(id,'live')).orderId,id);assert.equal(requests,1);
});
