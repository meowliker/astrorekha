const assert=require('node:assert/strict'),{test}=require('node:test');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {openPaytmCheckout}=require('../src/lib/payment-checkout-browser');
const {airpayProvider}=require('../src/lib/payments/providers/airpay');
test('Airpay browser posts encrypted fields only to its hosted checkout',()=>{
 const fields={merchant_id:'123',privatekey:'fixture',checksum:'fixture',encdata:'fixture'};let form;
 global.document={createElement:()=>({children:[],appendChild(x){this.children.push(x)},submit(){this.submitted=true}}),body:{appendChild(x){form=x}}};
 const action='https://payments.airpay.co.in/pay/v4/?token=fixture';
 assert.equal(openPaytmCheckout({gateway:'airpay',action,fields}),true);assert.equal(form.method,'POST');assert.equal(form.action,action);assert.equal(form.submitted,true);assert.equal(form.children.length,4);
 for(const bad of ['https://evil.example/pay/v4/?token=x','http://payments.airpay.co.in/pay/v4/?token=x','https://payments.airpay.co.in/other?token=x','https://user:pass@payments.airpay.co.in/pay/v4/?token=x','https://payments.airpay.co.in/pay/v4/'])assert.throws(()=>openPaytmCheckout({gateway:'airpay',action:bad,fields}));
 assert.throws(()=>openPaytmCheckout({gateway:'airpay',action,fields:{merchant_id:'123'}}));
 delete global.document;
});
test('Airpay activation requires opt-in, live verification and the applied migration',async()=>{
 Object.assign(process.env,{AIRPAY_MERCHANT_ID:'123',AIRPAY_USERNAME:'fixture',AIRPAY_PASSWORD:'fixture',AIRPAY_API_KEY:'fixture',AIRPAY_CLIENT_ID:'fixture',AIRPAY_CLIENT_SECRET:'fixture',AIRPAY_MODE:'live',AIRPAY_CALLBACK_ORIGIN:'https://astrorekha.com',AIRPAY_ENABLED:'false'});
 let schema=1;const db={rpc:async()=>({data:schema,error:null})};
 await assert.rejects(airpayProvider.assertReady(db,false),/not enabled/);
 process.env.AIRPAY_ENABLED='true';await airpayProvider.assertReady(db,false);
 await assert.rejects(airpayProvider.assertReady(db,true),/live verification/);
 process.env.AIRPAY_PRODUCTION_VERIFIED='true';await airpayProvider.assertReady(db,true);
 schema=0;await assert.rejects(airpayProvider.assertReady(db,true),/migration/);
});
