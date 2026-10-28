const assert=require('node:assert/strict');
const {test}=require('node:test');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const preview=require('../src/lib/paytm-preview');
test('private checkout is preview-only and callback uses its HTTPS deployment',()=>{
 const keys=['VERCEL_ENV','VERCEL_URL','PAYTM_PREVIEW_ORDER_ID','PAYTM_PREVIEW_TEST_TOKEN','PAYTM_CALLBACK_ORIGIN'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
 process.env.PAYTM_PREVIEW_ORDER_ID='ptm_fixture1';process.env.PAYTM_PREVIEW_TEST_TOKEN='fixture';
 delete process.env.PAYTM_CALLBACK_ORIGIN;
 for(const environment of ['production','development','']){process.env.VERCEL_ENV=environment;assert.equal(preview.paytmPreviewOrderId(),null);assert.equal(preview.paytmCallbackOrigin(),'https://astrorekha.com');}
 process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='astrorekha-fixture.vercel.app';
 assert.equal(preview.paytmPreviewOrderId(),'ptm_fixture1');assert.equal(preview.paytmCallbackOrigin(),'https://astrorekha-fixture.vercel.app');
 process.env.PAYTM_CALLBACK_ORIGIN='http://localhost:3114';assert.equal(preview.paytmCallbackOrigin(),'https://astrorekha-fixture.vercel.app');
 process.env.VERCEL_URL='evil.example';assert.throws(()=>preview.paytmCallbackOrigin());
 delete process.env.PAYTM_PREVIEW_TEST_TOKEN;assert.equal(preview.paytmPreviewOrderId(),null);
 }finally{for(const [key,value]of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;}
});
