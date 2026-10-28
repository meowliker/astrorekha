// Creates an uncharged checkout session and queries it. Does not pay, fulfil or send notifications.
require('dotenv').config({path:'.env.local'});
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const Module=require('node:module'),path=require('node:path');const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
const {paytmConfig,initiatePaytmCheckout,fetchPaytmStatus,validatePaytmStatus,listPaytmRefunds,fetchPaytmRefundStatus}=require('../src/lib/paytm-api');
(async()=>{
 const config=paytmConfig();const id=`ptm_diag${Date.now()}`;
 const order={id,amount:100,currency:'INR',payment_mode:config.mode,customer_email:'gateway-check@example.com'};
 const checkout=await initiatePaytmCheckout(order);const status=await fetchPaytmStatus(id,config.mode);
 console.log(JSON.stringify({environment:config.mode,orderId:id,checkoutTokenReceived:!!checkout.fields.txnToken,signedStatus:status.resultInfo.resultStatus,validatedState:validatePaytmStatus(order,status),charged:false}));
 const end=new Date();await listPaytmRefunds(new Date(end-86400000),end,1);console.log('Refund List API: authenticated request accepted');
 const refund=await fetchPaytmRefundStatus(id,'AR_DIAGNOSTIC_NO_REFUND');console.log(JSON.stringify({refundStatusAPI:'signed response verified',resultCode:refund.resultInfo.resultCode}));
})().catch(e=>{console.error(e instanceof Error?e.message:'Paytm check failed');process.exitCode=1});
