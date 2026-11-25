const assert=require('node:assert/strict'),{test,beforeEach}=require('node:test'),crypto=require('node:crypto');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const api=require('../src/lib/airpay-api');let n=0;
beforeEach(()=>{Object.assign(process.env,{AIRPAY_MERCHANT_ID:'123456',AIRPAY_USERNAME:'fixture',AIRPAY_PASSWORD:'not-live',AIRPAY_API_KEY:'fixture-api',AIRPAY_CLIENT_ID:'client'+(++n),AIRPAY_CLIENT_SECRET:'fixture-client-secret',AIRPAY_MODE:'live',AIRPAY_CALLBACK_ORIGIN:'https://astrorekha.com'});});
const id='arp'+'a'.repeat(24),order=()=>({id,amount:65962,currency:'INR',payment_mode:'live',customer_email:'fixture@example.invalid',customer_name:'Fixture',customer_phone:'9999999999'});
const remote=()=>({merchant_id:'123456',orderid:id,amount:'659.62',currency_code:'356',txn_mode:'LIVE',ap_transactionid:'123123123',transaction_status:200,transaction_payment_status:'SUCCESS',transaction_type:320,risk:0,transaction_time:'24-11-2026 15:30:00'});
test('encryption matches PHP framing, uses fresh IV and rejects malformed data',()=>{
 const key=api.airpayConfig().encryptionKey,body={orderid:id,amount:'659.62'};
 const a=api.airpayEncrypt(body,key),b=api.airpayEncrypt(body,key);assert.notEqual(a,b);assert.match(a,/^[a-f0-9]{16}/);assert.deepEqual(api.airpayDecrypt(a,key),body);
 // Independently decode with the PHP kit's documented prefix IV framing.
 const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(key),Buffer.from(a.slice(0,16)));assert.equal(Buffer.concat([d.update(Buffer.from(a.slice(16),'base64')),d.final()]).toString(),JSON.stringify(body));
 for(const value of ['bad','0'.repeat(16)+'!!!!',a.slice(0,-10)])assert.throws(()=>api.airpayDecrypt(value,key));
});
test('checksum sorts fields and uses IST day across UTC midnight boundary',()=>{
 const got=api.airpayChecksum({orderid:'ORDER1234',amount:'100.00'},new Date('2026-11-24T20:00:00Z'));
 assert.equal(got,crypto.createHash('sha256').update('100.00ORDER12342026-11-25').digest('hex'));
});
test('return token binds merchant, origin, mode, age and order',()=>{
 const token=api.airpayReturnToken(id);assert.equal(api.readAirpayReturnToken(token),id);assert.equal(api.readAirpayReturnToken(token.replace(id,'arp'+'b'.repeat(24))),null);
 assert.equal(api.readAirpayReturnToken(api.airpayReturnToken(id,1)),null);process.env.AIRPAY_MODE='test';assert.equal(api.readAirpayReturnToken(token),null);
 assert.throws(()=>api.airpayReturnToken('AR-FUT-external'));process.env.AIRPAY_CALLBACK_ORIGIN='http://evil.example';assert.throws(api.airpayOrigin);
});
test('successful verification requires bound merchant, order, amount, currency, mode, capture and time',()=>{
 assert.equal(api.validateAirpayStatus(order(),remote()).status,'paid');assert.equal(api.validateAirpayStatus(order(),remote()).paidAt,'2026-11-24T10:00:00.000Z');
 for(const patch of [{merchant_id:'wrong'},{orderid:'other'},{amount:'1.00'},{currency_code:'840'},{txn_mode:'TEST'},{ap_transactionid:''},{transaction_time:'invalid'}])assert.throws(()=>api.validateAirpayStatus(order(),{...remote(),...patch}));
 assert.throws(()=>api.validateAirpayStatus({...order(),gateway_transaction_id:'999'},remote()));
});
test('pending, authorized, risk, refund and unknown statuses never unlock',()=>{
 for(const patch of [{transaction_type:310},{transaction_type:340},{risk:1},{transaction_payment_status:'AUTHORIZE'},{transaction_status:211},{transaction_status:999},{transaction_payment_status:'unexpected'}])assert.equal(api.validateAirpayStatus(order(),{...remote(),...patch}).status,'pending');
 assert.equal(api.validateAirpayStatus(order(),null).status,'pending');assert.equal(api.validateAirpayStatus(order(),{...remote(),transaction_status:400,transaction_payment_status:'FAIL'}).status,'failed');
});
test('API token requests are coalesced; checkout contains encrypted data and saved return state',async t=>{
 let calls=0;t.mock.method(global,'fetch',async(url,init)=>{calls++;assert.equal(url,'https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2/');assert.equal(init.redirect,'error');const fields=Object.fromEntries(init.body);assert.equal(fields.merchant_id,'123456');const data=api.airpayDecrypt(fields.encdata,api.airpayConfig().encryptionKey);assert.equal(data.grant_type,'client_credentials');assert.equal(fields.checksum,api.airpayChecksum(data));return new Response(JSON.stringify({response:api.airpayEncrypt({status_code:'200',data:{access_token:'fixture-token',expires_in:300}},api.airpayConfig().encryptionKey)}))});
 const [a,b]=await Promise.all([api.airpayAccessToken(),api.airpayAccessToken()]);assert.equal(a,b);assert.equal(calls,1);
 const result=await api.initiateAirpayCheckout(order());const data=api.airpayDecrypt(result.fields.encdata,api.airpayConfig().encryptionKey);
 assert.equal(result.gateway,'airpay');assert.equal(data.amount,'659.62');assert.equal(data.iso_currency,'INR');assert.equal(data.orderid,id);assert.equal(api.readAirpayReturnToken(data.customvar),id);assert.match(data.return_url,/\/api\/airpay\/callback\?state=/);assert.equal(calls,1);
 for(const patch of [{amount:0},{amount:1.5},{currency:'USD'},{payment_mode:'test'},{id:'other'}])await assert.rejects(api.initiateAirpayCheckout({...order(),...patch}));
});
test('status API uses saved reference and no-records remains pending',async t=>{
 t.mock.method(global,'fetch',async(url,init)=>{if(url.includes('oauth2'))return new Response(JSON.stringify({status_code:200,data:{access_token:'fixture',expires_in:300}}));assert.match(url,/\/verify\/\?token=fixture$/);const data=api.airpayDecrypt(Object.fromEntries(init.body).encdata,api.airpayConfig().encryptionKey);assert.deepEqual(data,{orderid:id});return new Response(JSON.stringify({status_code:400,response_code:503}));});
 assert.equal(await api.fetchAirpayStatus(id,'live'),null);await assert.rejects(api.fetchAirpayStatus(id,'test'));process.env.AIRPAY_MODE='test';await assert.rejects(api.fetchAirpayStatus(id,'test'),/live merchant/);
});
test('provider failures are sanitized and never include tokens or credentials',async t=>{
 t.mock.method(global,'fetch',async()=>{throw new Error('secret-token-in-url')});await assert.rejects(api.airpayAccessToken(),e=>e.message==='Airpay API unavailable');
});
test('IPN CRC checks merchant and UPI VPA and is not used to settle orders',()=>{
 const data={...remote(),message:'Success',chmod:'upi',customer_vpa:'fixture@bank'};data.ap_SecureHash=api.airpayNotificationChecksum(data);assert.equal(api.validAirpayNotification(data),true);
 assert.equal(api.validAirpayNotification({...data,customer_vpa:'other@bank'}),false);assert.equal(api.validAirpayNotification({...data,merchant_id:'other'}),false);
});
