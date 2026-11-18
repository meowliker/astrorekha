const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {loadAdminInvoice}=require('../src/lib/admin-invoice-client');
let now=Date.now(),token='first',calls=0,fail=false;const realNow=Date.now;Date.now=()=>now;
global.localStorage={getItem(key){return key==='admin_session_token'?token:new Date(now+60000).toISOString()}};
global.fetch=async(url,options)=>{calls++;assert.equal(options.headers['x-admin-session'],token);assert.equal(url.includes(token),false);return{ok:!fail,json:async()=>fail?{error:'Unavailable'}:{invoice:{paymentId:'payment'}}}};
test('prefetch is reused, expires, isolates sessions and retries failures',async()=>{
 await Promise.all([loadAdminInvoice(token,'u','p'),loadAdminInvoice(token,'u','p')]);assert.equal(calls,1);
 await loadAdminInvoice(token,'u','p');assert.equal(calls,1);
 now+=15001;await loadAdminInvoice(token,'u','p');assert.equal(calls,2);
 token='second';await loadAdminInvoice(token,'u','p');assert.equal(calls,3);
 await assert.rejects(loadAdminInvoice('first','u','p'),/Session expired/);
 fail=true;await assert.rejects(loadAdminInvoice(token,'u','p'),/Unavailable/);fail=false;await loadAdminInvoice(token,'u','p');assert.equal(calls,5);
 global.localStorage.getItem=key=>key==='admin_session_token'?token:'invalid';await assert.rejects(loadAdminInvoice(token,'u','p'),/Session expired/);Date.now=realNow;
});
