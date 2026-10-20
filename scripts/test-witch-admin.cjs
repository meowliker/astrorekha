const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(__dirname,'../src',name.slice(2)):name,parent,...rest);};
const {NextRequest}=require('next/server');
const {WITCH_QUESTIONS,scoreWitchAnswers}=require('../src/lib/witch-archetype');
const {localWitchTemplate}=require('../src/lib/witch-archetype-preview');
const answers=Object.fromEntries(WITCH_QUESTIONS.map(q=>[q.id,q.options[0].id]));
const result=scoreWitchAnswers(answers);
let session,user,saved,payments,missingTemplate,failTable,calls;
class Query {
 constructor(table){this.table=table;this.filters=[];calls.push(this);}
 select(fields,options){this.fields=fields;this.options=options;return this;}
 eq(k,v){this.filters.push([k,v]);return this;}
 or(value){(this.ors ||= []).push(value);return this;}
 order(){return this;} limit(n){this.limitValue=n;return this;}
 range(from,to){this.rangeValue=[from,to];return this;}
 maybeSingle(){this.single=true;return this;}
 then(resolve,reject){return Promise.resolve(this.read()).then(resolve,reject);}
 read(){
  if(this.table===failTable)return {data:null,error:{message:'private database error'}};
  if(this.table==='admin_sessions')return {data:session,error:null};
  if(this.table==='users')return {data:this.single?user:[{...user,witch_archetype_results:saved}],count:1,error:null};
  if(this.table==='witch_archetype_results')return {data:saved,error:null};
  if(this.table==='payments')return {data:payments,error:null};
  if(this.table==='witch_archetype_templates')return {data:missingTemplate?null:{report_data:localWitchTemplate(result.key),template_version:'v2',active:true},error:null};
  throw Error('Unexpected table');
 }
}
const load=Module._load;
Module._load=function(name,parent,...rest){if(name==='@/lib/supabase-admin')return {getSupabaseAdmin:options=>{assert.equal(options.fresh,true);return {from:table=>new Query(table)};}};return load.call(this,name,parent,...rest);};
const {GET}=require('../src/app/api/admin/witch-archetype/route');
Module._load=load;
const req=(query='',token='admin')=>new NextRequest('http://localhost:3114/api/admin/witch-archetype'+query,{headers:token?{Authorization:'Bearer '+token}:{}});
beforeEach(()=>{session={id:'admin',expires_at:new Date(Date.now()+60000).toISOString()};user={id:'buyer',name:'Sample',email:'sample@example.test',unlocked_features:{witchArchetypeReport:true,otherPrivateFeature:true},is_dev_tester:false};saved={answers,result,scoring_version:result.version,generated_at:result.generatedAt,updated_at:result.generatedAt};payments=[{id:'payment',type:'upsell',bundle_id:'witch-archetype',feature:'witchArchetypeReport',amount:49900,currency:'INR',payment_status:'paid',created_at:result.generatedAt}];missingTemplate=false;failTable=null;calls=[];});
test('no admin token rejects before database access (query credentials do not authorize)',async()=>{assert.equal((await GET(req('?token=admin&userId=buyer',null))).status,401);assert.equal(calls.length,0);});
test('unknown, expired, malformed admin sessions cannot read customer data',async()=>{for(const expires of [null,'invalid','2020-01-01']){calls=[];session=expires?{expires_at:expires}:null;assert.equal((await GET(req('?userId=buyer'))).status,401);assert(calls.every(c=>c.table==='admin_sessions'));}});
test('details read saved answers, result and database template, converting paise only once',async()=>{const response=await GET(req('?userId=buyer'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const data=await response.json();assert.equal(data.payments[0].amount,499);assert.equal(data.answers.length,9);assert.equal(data.answers[0].answer,WITCH_QUESTIONS[0].options[0].text);assert.deepEqual(data.result,result);assert.equal(data.template.profile.key,result.key);assert.equal(data.user.unlocked_features,undefined);for(const c of calls.filter(c=>['users','payments','witch_archetype_results'].includes(c.table)))assert(c.filters.some(([k,v])=>['id','user_id'].includes(k)&&v==='buyer'));});
test('unstarted customers have no fabricated result or answers',async()=>{saved=null;payments=[];const data=await (await GET(req('?userId=buyer'))).json();assert.equal(data.status,'Not started');assert.equal(data.result,null);assert.equal(data.template,null);assert.deepEqual(data.answers,[]);assert.equal(data.access,'Unlocked');});
test('revoked access, invalid answers and missing template remain visible for review',async()=>{user.unlocked_features={};saved.answers={};missingTemplate=true;const data=await(await GET(req('?userId=buyer'))).json();assert.equal(data.access,'Locked');assert(data.warning.includes('template'));assert(data.warning.includes('answers'));assert.equal(data.template,null);assert(data.answers.every(a=>!a.valid));});
test('corrupt saved result is flagged without synthesizing a result',async()=>{saved.result={key:'wrong'};const data=await(await GET(req('?userId=buyer'))).json();assert.equal(data.status,'Needs review');assert.equal(data.result,null);assert(data.warning);});
test('saved report listing is paginated, includes revoked access, and omits answers',async()=>{const data=await(await GET(req('?page=2&mode=saved'))).json();const q=calls.find(c=>c.table==='users');assert.deepEqual(q.rangeValue,[50,74]);assert(q.fields.includes('!inner'));assert(!q.fields.includes('answers'));assert.equal(data.items[0].archetype,'Moon Seer');assert.equal(data.items[0].user.unlocked_features,undefined);});
test('access listing requires entitlement or tester and escapes wildcard search',async()=>{await GET(req('?mode=access&search=sample_name'));const q=calls.find(c=>c.table==='users');assert(!q.fields.includes('!inner'));assert(q.ors[0].includes('witchArchetypeReport.eq.true'));assert(q.ors[1].includes('sample\\_name'));});
test('invalid pagination and modes fail without listing queries',async()=>{for(const query of ['?page=NaN','?page=-1','?page=1.5','?mode=bad'])assert.equal((await GET(req(query))).status,400);assert(calls.every(c=>c.table==='admin_sessions'));});
test('missing customer returns 404',async()=>{user=null;assert.equal((await GET(req('?userId=absent'))).status,404);});
test('database errors are not passed off as empty data or exposed to the client',async()=>{for(const table of ['admin_sessions','users','payments','witch_archetype_results','witch_archetype_templates']){failTable=table;const response=await GET(req('?userId=buyer'));assert.equal(response.status,503);assert(!(await response.text()).includes('private database error'));}});
test('large payment history is bounded and clearly flagged',async()=>{payments=Array.from({length:101},(_,i)=>({...payments[0],id:String(i)}));const data=await(await GET(req('?userId=buyer'))).json();assert.equal(data.payments.length,100);assert.equal(data.paymentsTruncated,true);});
