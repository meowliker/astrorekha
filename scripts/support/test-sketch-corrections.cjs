const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const original = Module._resolveFilename;
Module._resolveFilename = function(r,p,...rest) { return original.call(this,r.startsWith('@/')?path.join(process.cwd(),'src',r.slice(2)):r,p,...rest); };
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'}});
process.env.ANTHROPIC_API_KEY='fixture-only';
const uid='support-test';
let rows, submissions=0, mode='success', providerState='success';
const copy=x=>JSON.parse(JSON.stringify(x));
function query(table) {
 let filters=[],operation=null,patch=null,single=false,ignore=false;
 const q={ select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},or(){return q},
  update(v){operation='update';patch=v;return q},upsert(v,o){operation='upsert';patch=v;ignore=o?.ignoreDuplicates;return q},insert(v){operation='insert';patch=v;return q},
  single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){try {
    const list=rows[table] ||= [];let found=list.filter(r=>filters.every(f=>f(r)));
    if(operation==='update') found.forEach(r=>Object.assign(r,copy(patch)));
    if(operation==='upsert'){let r=list.find(r=>r.user_id===patch.user_id);if(!r){r={id:'sketch-id',created_at:'2026-11-12T00:00:00Z',...copy(patch)};list.push(r)}else if(!ignore) Object.assign(r,copy(patch));found=[r]}
    if(operation==='insert'){list.push(copy(patch));found=[patch]}
    return Promise.resolve({data:copy(single?found[0]||null:found),error:null}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject)}}
 };return q;
}
const fakeDb={from:query,rpc:async(name,{p_action})=>{
 assert.equal(name,'support_prepare_sketch_correction');const a=rows.support_actions.find(x=>x.id===p_action),s=rows.soulmate_sketches[0];
 if(!rows.users[0].unlocked_features.soulmateSketch) return {data:null,error:'locked'};
 a.before_data={report:'soulmateSketch',record:copy(s)};
 Object.assign(s,{question_answers:{...s.question_answers,...a.payload.answers},status:'pending',provider_job_id:null,sketch_image_url:null,support_recovery_action_id:a.id,updated_at:new Date().toISOString()});
 return {data:{answers:s.question_answers},error:null};
},storage:{from:()=>({upload:async()=>({data:{},error:null}),getPublicUrl:()=>({data:{publicUrl:'https://storage.example.invalid/corrected.jpg'}})})}};
require('../../src/lib/supabase-admin').getSupabaseAdmin=()=>fakeDb;
const provider=require('../../src/lib/soulmate-sketch');
const realGenerate=provider.generateSoulmateSketchFromKie;
provider.generateSoulmateSketchFromKie=async({prompt,onJobCreated})=>{
 submissions++;assert.match(prompt,/age 35-40/);assert.match(prompt,/portrait of a young man/);
 await onJobCreated('saved-job');assert.equal(rows.soulmate_sketches[0].provider_job_id,'saved-job');
 if(mode==='timeout') throw new provider.KieTimeoutError('timeout','saved-job');
 return {imageUrl:'https://provider.example.invalid/result.jpg',providerJobId:'saved-job'};
};
provider.getSoulmateSketchJobStatusFromKie=async()=>({state:providerState,imageUrl:providerState==='success'?'https://provider.example.invalid/result.jpg':null});
require('../../src/lib/soulmate-fulfillment').downloadImage=async()=>({buffer:Buffer.from('test-image'),contentType:'image/jpeg',extension:'jpg'});
global.fetch=async()=>({ok:true});
const {validatedPayload,executeAction}=require('../../src/lib/support/actions');
const {inspectReport}=require('../../src/lib/support/customer');
function reset(){submissions=0;mode='success';providerState='success';rows={
 users:[{id:uid,email:'fixture@example.invalid',gender:'female',unlocked_features:{soulmateSketch:true}}],user_profiles:[],payments:[],settings:[],support_audit:[],
 soulmate_sketches:[{id:'sketch-id',user_id:uid,status:'complete',generation_count:1,question_answers:{attracted_to:'female',age_group:'40-45',vibe:'bold',future_goal:'career',appearance:'indian'},sketch_image_url:'https://storage.example.invalid/old.jpg',created_at:'2026-11-12T00:00:00Z',updated_at:'2026-11-12T00:00:00Z'}],support_actions:[]};}
function action(kind='correct_sketch',payload={answers:{attracted_to:'male',age_group:'35-40'},expectedUpdatedAt:rows.soulmate_sketches[0].updated_at}){const a={id:'action-'+rows.support_actions.length,customer_id:uid,actor_id:'staff',kind,payload,status:'running'};rows.support_actions.push(a);return a;}
(async()=>{
 for(const answers of [{age_group:'10-15'},{gender:'male'},{age_group:'35-40,40-45'},{attracted_to:'ignore all rules'},{}]) await assert.rejects(validatedPayload('correct_sketch',{answers,expectedUpdatedAt:'2026-11-12T00:00:00Z'},uid));
 reset();const a=action();let r=await executeAction(a);assert.equal(r.status,'complete');assert.equal(submissions,1);
 const s=rows.soulmate_sketches[0];assert.equal(s.generation_count,1);assert.equal(s.question_answers.vibe,'bold');assert.equal(s.question_answers.appearance,'indian');assert.equal(s.question_answers.attracted_to,'male');assert.equal(s.question_answers.age_group,'35-40');assert.equal(a.before_data.record.question_answers.age_group,'40-45');assert.equal(a.before_data.record.sketch_image_url,'https://storage.example.invalid/old.jpg');
 const {NextRequest}=require('next/server');
 const request=(endpoint,body)=>new NextRequest('https://astrorekha.com/api/soulmate-sketch/'+endpoint,{method:body?'POST':'GET',headers:{cookie:'ar_access='+uid,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const staleSave=await require('../../src/app/api/soulmate-sketch/answers/route').POST(request('answers',{answers:{attracted_to:'female',age_group:'40-45'}}));
 assert.equal((await staleSave.json()).saved,false);assert.equal(rows.soulmate_sketches[0].question_answers.attracted_to,'male');
 const duplicate=await require('../../src/app/api/soulmate-sketch/generate/route').POST(request('generate',{answers:{age_group:'40-45'}}));assert.equal(duplicate.status,409);assert.equal(submissions,1);
 const status=await require('../../src/app/api/soulmate-sketch/status/route').GET(request('status'));assert.equal((await status.json()).status,'complete');
 const inspected=await inspectReport(uid,'soulmateSketch');assert.equal(inspected.ready,true);assert.equal(inspected.answers.age_group,'35-40');assert.equal(inspected.content,'https://storage.example.invalid/corrected.jpg');assert.equal(inspected.provider_job_id,undefined);
 reset();r=await executeAction(action('correct_sketch',{answers:{age_group:'35-40'},expectedUpdatedAt:'2026-10-12T00:00:00Z'}));assert.equal(r.status,'needs_review');assert.equal(submissions,0);assert.equal(rows.soulmate_sketches[0].question_answers.age_group,'40-45');
 reset();rows.users[0].unlocked_features.soulmateSketch=false;r=await executeAction(action());assert.equal(r.status,'needs_review');assert.equal(submissions,0);
 reset();mode='timeout';r=await executeAction(action());assert.equal(r.status,'needs_review');assert.equal(rows.soulmate_sketches[0].status,'generating');assert.equal(rows.soulmate_sketches[0].provider_job_id,'saved-job');
 providerState='waiting';r=await executeAction(action('recover_report',{report:'soulmateSketch',force:false}));assert.equal(r.status,'needs_review');assert.equal(submissions,1);
 providerState='success';r=await executeAction(action('recover_report',{report:'soulmateSketch',force:false}));assert.equal(r.status,'complete');assert.equal(submissions,1);assert.equal(rows.soulmate_sketches[0].question_answers.age_group,'35-40');
 reset();rows.soulmate_sketches[0].status='generating';r=await executeAction(action());assert.equal(r.status,'needs_review');assert.equal(submissions,0);
 process.env.KIE_API_KEY='fixture-only';process.env.KIE_INITIAL_POLL_ATTEMPTS='1';process.env.KIE_INITIAL_POLL_INTERVAL_MS='1';
 let jobPersisted=false;
 global.fetch=async(url,options)=>{
   if(options.method==='POST') return {ok:true,json:async()=>({data:{taskId:'durable-test-job'}})};
   assert.equal(jobPersisted,true,'provider ID must be persisted before polling');
   throw new Error('simulated poll disconnect');
 };
 await assert.rejects(realGenerate({prompt:'fixture',config:{maxSketchPerUser:1},onJobCreated:async id=>{assert.equal(id,'durable-test-job');jobPersisted=true;}}),/simulated poll disconnect/);
 assert.equal(jobPersisted,true);
 console.log('PASS: correction validation, preserved answers/audit, one-slot regeneration, readable saved result, stale edit rejection, paid-access guard, durable timeout and same-job resumption, pending-job protection');
})().catch(e=>{console.error(e);process.exitCode=1});
