const assert = require('node:assert/strict');
const {test,beforeEach}=require('node:test');
const path=require('node:path'),Module=require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest);};
let authorized,order,saved,uploads,removed;
const db={from(table){let filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},single:async()=>({data:order,error:null}),maybeSingle:async()=>({data:authorized?{id:'fixture',expires_at:new Date(Date.now()+60000).toISOString()}:null,error:null})};return q;},storage:{from(){return{upload:async()=>{uploads++;return{error:null};},remove:async()=>{removed++;return{error:null};}};}},rpc:async(name,params)=>{saved={name,params};return{error:null};}};
const file=require.resolve('../src/lib/supabase-admin');require.cache[file]={id:file,filename:file,loaded:true,exports:{getSupabaseAdmin:()=>db}};
const {NextRequest}=require('next/server');
const assets=require('../src/app/api/admin/soulmate/orders/[id]/assets/route');
const approval=require('../src/app/api/admin/soulmate/orders/[id]/approve/route');
const params={params:{id:'sm_aaaaaaaaaaaaaaaaaaaa'}};
beforeEach(()=>{authorized=true;uploads=0;removed=0;saved=null;order={catalog_version:2,payment_status:'paid',review_status:'pending',entitlements:{required_assets:['sketch','description']}};});
function upload(kind,bytes,type){const form=new FormData();form.set('kind',kind);form.set('file',new Blob([bytes],{type}),'fixture');return new NextRequest('https://example.com/api/admin/soulmate/orders/'+params.params.id+'/assets',{method:'POST',headers:{authorization:'Bearer fixture'},body:form});}
test('upload and approval require an unexpired admin session',async()=>{
 authorized=false;assert.equal((await assets.POST(upload('description','%PDF-test','application/pdf'),params)).status,401);
 assert.equal((await approval.POST(new NextRequest('https://example.com',{method:'POST',headers:{authorization:'Bearer fixture'},body:'{}'}),params)).status,401);assert.equal(uploads,0);assert.equal(saved,null);
});
test('files are limited to purchased kinds and paid, unapproved orders',async()=>{
 for(const kind of ['timeline','unknown'])assert.equal((await assets.POST(upload(kind,'%PDF-test','application/pdf'),params)).status,400);
 order.payment_status='created';assert.equal((await assets.POST(upload('description','%PDF-test','application/pdf'),params)).status,409);
 order.payment_status='paid';order.review_status='approved';assert.equal((await assets.POST(upload('description','%PDF-test','application/pdf'),params)).status,409);assert.equal(uploads,0);
});
test('file signatures are checked and valid PDF is privately registered with checksum',async()=>{
 assert.equal((await assets.POST(upload('description','not a PDF','application/pdf'),params)).status,400);
 assert.equal((await assets.POST(upload('sketch','%PDF-test','image/png'),params)).status,400);
 assert.equal((await assets.POST(upload('description','%PDF-test','application/pdf'),params)).status,200);
 assert.equal(uploads,1);assert.equal(saved.name,'save_soulmate_order_asset');assert.match(saved.params.p_path,/^sm_aaaaaaaaaaaaaaaaaaaa\/description-[a-f0-9-]+\.pdf$/);assert.match(saved.params.p_sha,/^[a-f0-9]{64}$/);assert.equal(saved.params.p_order,params.params.id);
});
