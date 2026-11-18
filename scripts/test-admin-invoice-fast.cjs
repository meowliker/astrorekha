const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.join(process.cwd(),'src',id.slice(2)):id,...args)};
let paymentReads=0,failPayment=false;
const payment={id:'pay_original',payu_payment_id:'30669700142',payu_txn_id:'TXN_original',user_id:'buyer',payment_status:'paid',type:'coins',coins:45,amount:19900,currency:'INR',created_at:'2026-09-13T07:51:42Z',fulfilled_at:'2026-09-13T07:51:42Z'};
const load=Module._load;Module._load=function(id,...args){
 if(id==='@/lib/payu-api')throw new Error('Invoice must not load PayU transaction history');
 if(id==='@/lib/supabase-admin')return{getSupabaseAdmin:()=>({from(table){
 if(table==='payments')paymentReads++;
 let data=table==='payments'?[payment]:table==='admin_workspace_members'?[{admin_id:'fixture',active:true,is_administrator:true,workspaces:[]}]:table==='users'?[{id:'buyer',email:'buyer@example.com',name:'Buyer'}]:table==='settings'?[{value:null}]:table==='admin_sessions'?[{admin_id:'fixture',id:'fixture',expires_at:'2099-01-01'}]:[];
 const q={select(){return q},eq(){return q},gte(){return q},order(){return q},limit(){return q},or(){return q},maybeSingle(){data=data[0]||null;return q},then(ok,no){return Promise.resolve({data,count:0,error:failPayment&&table==='payments'?new Error('unavailable'):null}).then(ok,no)}};return q;}})};
 return load.call(this,id,...args);
};
const {GET}=require('../src/app/api/admin/invoice/route');const {NextRequest}=require('next/server');
const request=(format='json')=>new NextRequest(`http://local/api/admin/invoice?txnId=30669700142&userId=buyer&format=${format}`,{headers:{'x-admin-session':'a'.repeat(64)}});
test('exact payment invoice uses one payment read, saved details and authenticated header',async()=>{
 paymentReads=0;const response=await GET(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const {invoice}=await response.json();assert.equal(invoice.total,199);assert.equal(invoice.customer.userId,'buyer');assert.equal(invoice.orderMetadata.primaryPaymentId,'30669700142');assert.equal(invoice.creditEvidence.coins,45);assert.equal(paymentReads,1);
 const pdf=await GET(request('pdf'));assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.ok((await pdf.arrayBuffer()).byteLength>1000);
 const denied=await GET(new NextRequest('http://local/api/admin/invoice?txnId=30669700142'));assert.equal(denied.status,401);
});
test('payment query errors fail rather than displaying unrelated fallback purchases',async()=>{
 failPayment=true;const response=await GET(request());assert.equal(response.status,500);failPayment=false;
});
