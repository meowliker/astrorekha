const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly:true, compilerOptions:{module:'CommonJS',moduleResolution:'node'} });
process.env.REPORT_SESSION_SECRET = 'local-unit-test-secret-not-for-production';
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name,parent,...rest) { return resolve.call(this,name.startsWith('@/') ? path.join(__dirname,'../src',name.slice(2)) : name,parent,...rest); };
const { NextRequest, NextResponse } = require('next/server');
const { WITCH_QUESTIONS, scoreWitchAnswers } = require('../src/lib/witch-archetype');
const { localWitchTemplate } = require('../src/lib/witch-archetype-preview');
const { createReportSession, verifyReportSession, REPORT_SESSION_COOKIE, setReportSession } = require('../src/lib/report-session');
const bcrypt = require("bcryptjs");
const passwordHash = bcrypt.hashSync("LocalFixture!123", 4);
let users, saved, reads, writes, templateMissing, otp;
class Query {
 constructor(table) {this.table=table;this.filters={};}
 select(){return this;} eq(k,v){this.filters[k]=v;return this;}
 limit(){return this;} update(){this.action="update";return this;} delete(){this.action="delete";return this;}
 then(a,b){return this.maybeSingle().then(a,b);}
 async maybeSingle(){
  if(this.action){if(this.table==='otp_codes'&&this.action==='delete')otp=null;return {data:null,error:null};}
  reads.push({table:this.table,filters:this.filters});
  if(this.table==='otp_codes')return {data:otp,error:null};
  if(this.table==='users')return {data:(this.filters.id?users.get(this.filters.id):[...users.values()].find(u=>u.email===this.filters.email))||null,error:null};
  if(this.table==='witch_archetype_results')return {data:saved.get(this.filters.user_id)||null,error:null};
  if(this.table==='witch_archetype_templates')return {data:templateMissing?null:{report_data:localWitchTemplate(this.filters.id)},error:null};
  throw Error('Unexpected table');
 }
 single(){return this.maybeSingle();}
 async upsert(row,options){
  assert.equal(this.table,'witch_archetype_results');
  writes.push(row);
  if(!saved.has(row.user_id)||!options.ignoreDuplicates)saved.set(row.user_id,row);
  return {error:null};
 }
}
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){
 if(name==='@/lib/supabase-admin')return {getSupabaseAdmin:()=>({from:table=>new Query(table)})};
 return originalLoad.call(this,name,parent,...rest);
};
const {GET,POST}=require('../src/app/api/witch-archetype/route');
const login=require('../src/app/api/auth/login/route').POST;
const verifyOtp=require('../src/app/api/auth/verify-otp/route').POST;
Module._load=originalLoad;
const answers=Object.fromEntries(WITCH_QUESTIONS.map(q=>[q.id,q.options[0].id]));
function request(method='GET',user='buyer',body,extra={}){
 return new NextRequest('http://localhost:3114/api/witch-archetype'+(extra.query||''),{method,headers:{...(user?{cookie:`${REPORT_SESSION_COOKIE}=${createReportSession(user)}`} :{}),...(body?{'content-type':'application/json'}:{}),...extra.headers},...(body?{body:JSON.stringify(body)}:{})});
}
beforeEach(()=>{users=new Map([['buyer',{id:'buyer',unlocked_features:{witchArchetypeReport:true},is_dev_tester:false}],['other',{id:'other',unlocked_features:{witchArchetypeReport:true}}],['locked',{id:'locked',unlocked_features:{witchArchetypeReport:false}}]]);saved=new Map();reads=[];writes=[];templateMissing=false;otp={otp:"123456",expires_at:new Date(Date.now()+60000).toISOString()};Object.assign(users.get("buyer"),{email:"buyer@example.test",password_hash:passwordHash});});
test('session signature binds identity, expires and rejects malformed/tampered tokens',()=>{
 const token=createReportSession('buyer',1000000);
 assert.equal(verifyReportSession(token,1000001),'buyer');
 assert.equal(verifyReportSession(token,1000000+31*86400000),null);
 for(const invalid of [token+'x',token+'.extra',token.replace(token.split('.')[0],Buffer.from(JSON.stringify({sub:'other',exp:9999999999})).toString('base64url')),'buyer','1'])assert.equal(verifyReportSession(invalid),null);
});
test('cookies are HttpOnly and logout clears signed report access',async()=>{
 const response=setReportSession(NextResponse.json({ok:true}),'buyer');
 assert.equal(response.cookies.get(REPORT_SESSION_COOKIE).httpOnly,true);
 assert.equal(response.cookies.get(REPORT_SESSION_COOKIE).sameSite,'lax');
 const clear=require('../src/app/api/session/clear/route');
 const cleared=await clear.POST(request('POST'));
 assert.equal(cleared.cookies.get(REPORT_SESSION_COOKIE).maxAge,0);
});
test('query, header, body and legacy cookie user IDs cannot read or write without login',async()=>{
 for(const method of ['GET','POST']){
  const response=await (method==='GET'?GET:POST)(request(method,null,method==='POST'?{userId:'buyer',answers}:undefined,{query:'?userId=buyer',headers:{cookie:'ar_access=buyer','x-user-id':'buyer'}}));
  assert.equal(response.status,401);
 }
 assert.equal(reads.length,0);assert.equal(writes.length,0);
});
test('authenticated but unpaid user cannot read or submit, regardless of supplied flags',async()=>{
 assert.equal((await GET(request('GET','locked'))).status,403);
 assert.equal((await POST(request('POST','locked',{answers,unlocked:true,is_dev_tester:true,userId:'buyer'}))).status,403);
 assert.equal(writes.length,0);
});
test('a signed buyer session can only see its own saved report',async()=>{
 const result=scoreWitchAnswers(answers);saved.set('buyer',{result});
 const response=await GET(request('GET','buyer',undefined,{query:'?userId=other',headers:{'x-user-id':'other'}}));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).result,result);
 assert(reads.filter(r=>r.table==='witch_archetype_results').every(r=>r.filters.user_id==='buyer'));
});
test('incomplete and invalid quiz answers are rejected without writes',async()=>{
 for(const value of [undefined,[],{}, {...answers,q1:'invented'}]){
  assert.equal((await POST(request('POST','buyer',{answers:value}))).status,400);
 }
 assert.equal(writes.length,0);
});
test('cross-site writes are rejected even with an otherwise valid session',async()=>{
 assert.equal((await POST(request('POST','buyer',{answers},{headers:{origin:'https://other.example'}}))).status,403);
 assert.equal(reads.length,0);assert.equal(writes.length,0);
});
test('paid quiz saves once under verified identity and survives reload/retry',async()=>{
 const response=await POST(request('POST','buyer',{userId:'other',answers,result:{key:'invented'}}));
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(writes.length,1);assert.equal(writes[0].user_id,'buyer');assert.equal(saved.has('other'),false);
 const retry=await POST(request('POST','buyer',{answers:Object.fromEntries(WITCH_QUESTIONS.map(q=>[q.id,q.options[1].id]))}));
 assert.deepEqual((await retry.json()).result,data.result);assert.equal(writes.length,1);
 assert.deepEqual((await (await GET(request())).json()).result,data.result);
});
test('missing template fails without persisting a partial report',async()=>{
 templateMissing=true;const originalError=console.error;console.error=()=>{};
 try{assert.equal((await POST(request('POST','buyer',{answers}))).status,500);assert.equal(writes.length,0);}finally{console.error=originalError;}
});

test('password login issues report identity only after valid credentials',async()=>{
 const wrong=await login(request('POST',null,{email:'buyer@example.test',password:'incorrect'}));
 assert.equal(wrong.status,401);assert.equal(wrong.cookies.get(REPORT_SESSION_COOKIE),undefined);
 const good=await login(request('POST',null,{email:'buyer@example.test',password:'LocalFixture!123'}));
 assert.equal(good.status,200);const token=good.cookies.get(REPORT_SESSION_COOKIE).value;
 assert.equal(verifyReportSession(token),'buyer');
 const response=await GET(request('GET',null,undefined,{headers:{cookie:`${REPORT_SESSION_COOKIE}=${token}`}}));assert.equal(response.status,200);
});
test('OTP login issues report identity only after a valid unexpired code',async()=>{
 const wrong=await verifyOtp(request('POST',null,{email:'buyer@example.test',otp:'000000'}));
 assert.equal(wrong.status,400);assert.equal(wrong.cookies.get(REPORT_SESSION_COOKIE),undefined);
 const good=await verifyOtp(request('POST',null,{email:'buyer@example.test',otp:'123456'}));
 assert.equal(good.status,200);assert.equal(verifyReportSession(good.cookies.get(REPORT_SESSION_COOKIE).value),'buyer');
 assert.equal(otp,null);
});
