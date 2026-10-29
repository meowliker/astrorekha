// Read-only by default. --refund explicitly records an API-verified refund in the ledger.
require('dotenv').config({path:'.env.local'});
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const Module=require('node:module'),path=require('node:path');
const resolve=Module._resolveFilename;Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest)};
(async()=>{
 const api=require('../src/lib/pinelabs-api');
 const {mode}=api.pineLabsConfig();
 if(process.argv[2]==='--refund'){
  const refund=await api.fetchPineLabsOrder(process.argv[3]||'',mode,true);
  if(refund.type!=='REFUND')throw Error('The supplied ID is not a refund order');
  await require('../src/lib/pinelabs-refunds').recordPineLabsRefund(refund,mode);
  console.log('Verified refund processed; external payment links are excluded from the app ledger.');return;
 }
 if(process.argv.length>2)throw Error('Usage: node scripts/check-pinelabs-connection.cjs [--refund provider-refund-order-id]');
 await api.pineLabsAccessToken();
 const {data,error}=await require('../src/lib/supabase-admin').getSupabaseAdmin().rpc('pinelabs_backup_schema_version');
 console.log(JSON.stringify({authentication:'accepted',environment:mode,signingKeysPresent:api.pineLabsSigningConfigured(),databaseReady:!error&&data===1,paymentAcceptance:'not tested'},null,2));
})().catch(error=>{console.error(error instanceof Error?error.message:'Pine Labs check failed');process.exitCode=1});
