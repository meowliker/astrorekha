// Isolated adapter contract tests: no live credentials, database or payment calls.
const assert=require('node:assert/strict'),{test,beforeEach}=require('node:test'),Module=require('node:module'),path=require('node:path'),crypto=require('node:crypto');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const stub=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports}};
let selected,reads,calls;
stub('../src/lib/supabase-admin',{getSupabaseAdmin:()=>({from(){reads++;return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{value:{active:selected}},error:null})}},rpc:async()=>({data:1,error:null})})});
const paytm=require('../src/lib/paytm-api'),pine=require('../src/lib/pinelabs-api');
stub('../src/lib/paytm-api',{...paytm,initiatePaytmCheckout:async order=>{calls.push(['paytm',order]);return {gateway:'paytm',action:'https://secure.paytmpayments.com/theia/api/v1/showPaymentPage',fields:{txnToken:'fixture'}}}});
stub('../src/lib/pinelabs-api',{...pine,initiatePineLabsCheckout:async order=>{calls.push(['pinelabs',order]);return {gateway:'pinelabs',action:'https://checkout.pluralonline.com/fixture'}}});
const {paymentProvider,isPaymentGateway,createGatewayCheckout}=require('../src/lib/payments/providers');
const {activePaymentGateway}=require('../src/lib/payment-gateway');
beforeEach(()=>{selected='pinelabs';reads=0;calls=[];Object.assign(process.env,{PAYU_MERCHANT_KEY:'fixture',PAYU_MERCHANT_SALT:'test-salt',PAYU_MODE:'live',PAYTM_ENABLED:'true',PAYTM_MID:'fixtureMID',PAYTM_MERCHANT_KEY:'1234567890123456',PAYTM_ENVIRONMENT:'production',PINELABS_ENABLED:'true',PINELABS_CLIENT_ID:'fixture',PINELABS_CLIENT_SECRET:'fixture',PINELABS_MERCHANT_ID:'421588',PINELABS_ENVIRONMENT:'production'});delete process.env.LOCAL_PAYMENT_GATEWAY});
const fields={key:'fixture',txnid:'pay_fixture',amount:'659.62',productinfo:'Palm Reading',firstname:'Fixture',email:'fixture@example.invalid',phone:'9999999999',udf1:'google',udf2:'palm',udf3:'ad-1',udf4:'pay_fixture',udf5:'15'};
const order=(gateway='payu')=>({id:gateway==='payu'?'pay_fixture':gateway==='paytm'?'ptm_fixture':'pnl'+'a'.repeat(24),amount:65962,currency:'INR',customer_email:'fixture@example.invalid',payment_mode:'live',gateway});
test('PayU report checkout keeps the exact legacy response and SHA512 sequence',async()=>{
 const response=await createGatewayCheckout('payu',{kind:'reports',order:order(),payu:fields});
 const expectedHash=crypto.createHash('sha512').update('fixture|pay_fixture|659.62|Palm Reading|Fixture|fixture@example.invalid|google|palm|ad-1|pay_fixture|15||||||test-salt').digest('hex');
 assert.deepEqual(response,{txnId:'pay_fixture',amount:'659.62',productInfo:'Palm Reading',hash:expectedHash,key:'fixture',firstName:'Fixture',email:'fixture@example.invalid',phone:'9999999999',udf1:'google',udf2:'palm',udf3:'ad-1',udf4:'pay_fixture',udf5:'15'});
 assert.equal(reads,0);assert.equal(calls.length,0);
});
test('saved gateway controls an existing checkout even after the new-order selector changes',async()=>{
 assert.equal(await activePaymentGateway(),'pinelabs');
 const result=await createGatewayCheckout('paytm',{kind:'reports',order:order('paytm')});
 assert.equal(result.gateway,'paytm');assert.equal(calls[0][0],'paytm');
 await assert.rejects(createGatewayCheckout('pinelabs',{kind:'reports',order:order('paytm')}),/gateway mismatch/);
 assert.equal(calls.length,1);
});
test('invalid amount, currency, mode, provider and PayU binding never call a gateway',async()=>{
 for(const patch of [{amount:0},{amount:1.5},{amount:NaN},{amount:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},{payment_mode:'test'}])await assert.rejects(createGatewayCheckout('paytm',{kind:'reports',order:{...order('paytm'),...patch}}));
 for(const id of ['cosmofeed','stripe','__proto__','constructor','']){assert.equal(isPaymentGateway(id),false);assert.throws(()=>paymentProvider(id));}
 await assert.rejects(createGatewayCheckout('payu',{kind:'reports',order:order(),payu:{...fields,amount:'1.00'}}),/does not match/);
 await assert.rejects(createGatewayCheckout('payu',{kind:'reports',order:order(),payu:{...fields,txnid:'other'}}),/does not match/);
 assert.equal(calls.length,0);
});
test('legacy provider ID lengths and prefixes remain valid and unique',()=>{
 const ids=new Set();for(let i=0;i<30;i++)for(const gateway of ['payu','paytm','pinelabs']){const id=paymentProvider(gateway).createReportId();assert.ok(!ids.has(id));ids.add(id);if(gateway==='payu')assert.ok(id.startsWith('pay_')&&id.length<=25);if(gateway==='paytm')assert.ok(id.startsWith('ptm')&&id.length<=35);if(gateway==='pinelabs')assert.match(id,/^pnl[a-f0-9]{24}$/);}
});
test('Soulmate adapters preserve the cart, price, callback fields and saved provider',async()=>{
 const saved={...order(),id:'sm_'+'a'.repeat(20),gateway:'payu',plan:'standard',product_info:'Soulmate Sketch',customer_name:'Fixture',customer_phone:'9999999999',line_items:[{id:'sketch',amount:65962}]};
 const copy=structuredClone(saved);
 const response=await createGatewayCheckout('payu',{kind:'soulmate',order:saved,origin:'https://astrorekha.com'});
 assert.equal(response.action,'https://secure.payu.in/_payment');assert.equal(response.fields.txnid,saved.id);assert.equal(response.fields.amount,'659.62');assert.equal(response.fields.surl,'https://astrorekha.com/api/soulmate/payment/callback');assert.equal(response.fields.udf4,saved.id);assert.deepEqual(saved,copy);
 for(const gateway of ['paytm','pinelabs']){const input={...saved,gateway};await createGatewayCheckout(gateway,{kind:'soulmate',order:input,origin:'https://astrorekha.com'});assert.deepEqual(calls.at(-1),[gateway,input]);}
});
test('a timed-out provider is not retried through another gateway',async t=>{
 const provider=paymentProvider('pinelabs');t.mock.method(provider,'createCheckout',async()=>{throw Error('timeout')});
 await assert.rejects(createGatewayCheckout('pinelabs',{kind:'reports',order:order('pinelabs')}),/timeout/);assert.equal(calls.length,0);
});
test('Soulmate requires explicit PayU configuration before creating an order',()=>{
 delete process.env.PAYU_MODE;
 assert.throws(()=>paymentProvider('payu').mode('soulmate'),/configuration unavailable/);
 assert.equal(paymentProvider('payu').mode('reports'),'test');
 process.env.PAYU_MODE='live';delete process.env.PAYU_MERCHANT_SALT;
 assert.throws(()=>paymentProvider('payu').mode('soulmate'),/configuration unavailable/);
});
