const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { buildSoulmateCart } = require('../src/lib/soulmate-cart');
const { DESCRIPTION_TITLES, descriptionSections } = require('../src/lib/soulmate-report-plan');
const { TIMELINE_TITLES } = require('../src/lib/soulmate-timeline');
const { initialPreparation } = require('../src/lib/soulmate-report-preparation');
const { renderTimelinePdf } = require('../src/lib/soulmate-report-pdf');
const { deterministicReportIssues, checkPreparedPdf } = require('../src/lib/soulmate-report-quality');
const providers = require('../src/lib/soulmate-report-providers');
const supabase = require('../src/lib/supabase-admin');
const { processAutomaticReportJob, repairReportState, runAutomaticSoulmateReports } = require('../src/lib/soulmate-report-worker');
const sharp = require('sharp');
const oid = 'sm_aaaaaaaaaaaaaaaaaaaa';
const answers = { name: 'Fixture', heart: 'I keep attracting the wrong people', preferenceSelection: 'I like men', preference: 'I like women', feeling: 'Safe — someone who stays', birthDate: '1990-06-28', ethnicity: 'Any Indian background' };
function order(plan='express', addons=['timeline']) { return { id: oid, catalog_version: 2, payment_status: 'paid', review_status: 'pending', answer_revision: 1, answers, entitlements: buildSoulmateCart(plan, addons).entitlements, scheduled_send_at: new Date(Date.now()+12*3600000).toISOString(), fulfillment_status: 'queued' }; }
const openings = ['Quietly considering these possibilities can leave room for','Alongside this gentle thought you might find space for','Reflecting on the image may invite an interest in','Your own experience remains the best guide toward','Allowing a connection to develop can make room for','The ordinary moments between people can offer possibilities for','Taking time to listen might open a path toward','Within a steady exchange there could be space for','Thinking about a shared future may bring attention toward','Leaving room for personal choice can encourage reflection on','Approaching a new situation with curiosity may make space for','Noticing how a conversation unfolds can offer insight into','Finally a thoughtful approach to connection can invite awareness of'];
function report(titles) { const prose = i => openings[i] + ' a warm bond where both people feel heard and have time to learn what matters to the other person, with care and respect for the small choices that make a shared life feel kind and open, and space to see how this could grow in its own way.'; return { sections: titles.map((title,i)=>({ title, paragraphs: [prose(i*2),prose(i*2+1)] })), closing: prose(12) }; }
function harness(value=order()) {
  const stored = new Map(); let saved = null, status = 'preparing', finishes = 0, lastError, calls = [];
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: value }) }),
    storage: { from: () => ({ upload: async (p,b) => { stored.set(p,Buffer.from(b)); return {}; }, download: async p => ({ data: stored.has(p) ? new Blob([stored.get(p)]) : null, error: stored.has(p) ? null : {} }) }) },
    rpc: async (name,args) => {
      if (args.p_revision !== value.answer_revision || value.review_status !== 'pending' || value.payment_status !== 'paid') return { error: {} };
      if(name==='checkpoint_soulmate_reports') { saved=JSON.parse(JSON.stringify(args.p_state)); status=args.p_hold?'needs_review':'preparing'; lastError=args.p_error; }
      if(name==='finish_soulmate_reports') { assert.equal(saved.quality.passed,true); assert.equal(saved.quality.model,'local-checks-v1'); finishes++; status='ready'; value.review_status='approved'; }
      return {};
    }
  };
  supabase.getSupabaseAdmin = () => db;
  providers.submitReportSketch = async () => { calls.push('sketch'); return 'mock-task'; };
  providers.pollReportSketch = async () => { calls.push('poll'); return { buffer: await sharp({ create:{width:1024,height:1024,channels:3,background:'#c4b8ae'} }).jpeg().toBuffer(), contentType:'image/jpeg', extension:'jpg' }; };
  providers.generateReportDescription = async () => { calls.push('description'); return { report:report(DESCRIPTION_TITLES),model:'mock',requestId:'mock',usage:{} }; };
  providers.generateReportTimeline = async () => { calls.push('timeline'); return { report:report(TIMELINE_TITLES),model:'mock',requestId:'mock',usage:{} }; };
  return { tick: () => processAutomaticReportJob({ order_id:oid, answer_revision:1, lease_id:'lease', state:saved, failures:0 }), saved:()=>saved, setState:s=>saved=s, status:()=>status, finishes:()=>finishes, error:()=>lastError, calls, value, stored };
}
test('automatic worker prepares exactly the purchased set, checks stored PDFs, and approves once', async () => {
  for (const [plan,addons] of [['standard',[]],['standard',['description']],['express',['timeline']]]) {
    const h=harness(order(plan,addons));
    for(let i=0;i<10 && h.status()!=='ready' && h.status()!=='needs_review';i++) await h.tick();
    assert.equal(h.status(),'ready',h.error()); assert.equal(h.finishes(),1);
    assert.deepEqual(h.saved().assets.map(a=>a.kind),h.value.entitlements.required_assets);
    assert.equal(h.calls.filter(c=>c==='sketch').length,1);
    assert.equal(h.calls.includes('timeline'),addons.includes('timeline'));
    assert.equal(h.saved().image.base64,undefined,'No image payload stored in row');
    await h.tick(); assert.equal(h.finishes(),1,'Approved order cannot finalize again');
  }
});
test('ambiguous image submission is held, never billed twice', async()=>{
  const h=harness(); providers.submitReportSketch=async()=>{h.calls.push('sketch');throw new Error('timeout');};
  await h.tick(); assert.equal(h.status(),'needs_review'); await h.tick();
  assert.equal(h.calls.length,1); assert.match(h.error(),/uncertain/);
});
test('complete Claude response is recovered after an interrupted checkpoint without re-generation',async()=>{
  const h=harness(order('express',[])); await h.tick(); await h.tick();
  const payload={stop_reason:'end_turn',model:'mock',id:'received',content:[{type:'text',text:JSON.stringify(report(DESCRIPTION_TITLES))}]};
  h.setState({...h.saved(),stage:'description_submitting',descriptionRaw:payload});
  assert.equal(await h.tick(),'recovered'); assert.equal(h.saved().description.requestId,'received'); assert.equal(h.calls.includes('description'),false);
});
test('local checks identify duplicate prose, zodiac assignment and unvalidated dates',()=>{
  const s={...initialPreparation(order()),description:{report:report(DESCRIPTION_TITLES)},timeline:{report:report(TIMELINE_TITLES)}};
  assert.deepEqual(deterministicReportIssues(s),[]);
  s.description.report.sections[1].paragraphs[0]=s.description.report.sections[0].paragraphs[0];
  s.timeline.report.sections[0].paragraphs[0]+=' She is a Cancer and you meet on 12 October 2026.';
  const issues=deterministicReportIssues(s); assert(issues.some(i=>/Repeated|Duplicate/.test(i.reason))); assert(issues.some(i=>i.kind==='timeline'));
});
test('repair is bounded and invalidates dependent timeline and PDF approval',()=>{
  const s={...initialPreparation(order()),startedAt:new Date().toISOString(),stage:'prepared',description:{report:report(DESCRIPTION_TITLES)},timeline:{report:report(TIMELINE_TITLES)},quality:{passed:true},assets:[]};
  const next=repairReportState(s,[{kind:'description',reason:'Repeated text'}]);
  assert.equal(next.stage,'sketch_ready'); assert.equal(next.description,undefined); assert.equal(next.timeline,undefined); assert.equal(next.quality,undefined);
  const second=repairReportState(next,[{kind:'description',reason:'Paragraph too long'}]);
  assert.match(second.feedback.description,/Repeated text\nParagraph too long/);
  assert.throws(()=>repairReportState(second,[{kind:'description',reason:'Repeated text'}]),/after repair/);
  assert.throws(()=>repairReportState(s,[{kind:'sketch',reason:'Invalid image'}]),/manual attention/);
});
test('valid custom chat answers can prepare without changing the saved preferences', async()=>{
  const value=order('standard',[]);
  value.answers={...answers,heart:'I have one person in my heart',feeling:'A calm connection with mutual respect'};
  const h=harness(value);
  for(let i=0;i<6 && h.status()!=='ready';i++) await h.tick();
  assert.equal(h.status(),'ready',h.error());
  assert.equal(h.saved().plan.profile.heart,value.answers.heart);
  assert.equal(h.saved().plan.profile.feeling,value.answers.feeling);
  assert.equal(h.calls.filter(c=>c==='sketch').length,1);
});
test('confirmed terminal timeout retries once, preserving failed task history',async()=>{
  const h=harness(order('standard',[]));
  await h.tick();
  providers.pollReportSketch=async id=>{throw new providers.SoulmateSketchFailure(id,'524',true);};
  assert.equal(await h.tick(),'sketch_retry_queued');
  assert.equal(h.saved().stage,'planned');
  assert.equal(h.saved().failedSketchTasks[0].taskId,'mock-task');
  await h.tick();
  assert.equal(await h.tick(),'needs_review');
  assert.equal(h.calls.filter(c=>c==='sketch').length,2);
});
test('provider refusal never creates a replacement image',async()=>{
  const h=harness(); await h.tick();
  providers.pollReportSketch=async id=>{throw new providers.SoulmateSketchFailure(id,'400',false);};
  assert.equal(await h.tick(),'needs_review');
  assert.equal(h.calls.filter(c=>c==='sketch').length,1);
});
test('paragraph tolerance permits a fitting 86-word paragraph but rejects excessive prose',()=>{
  const s={...initialPreparation(order()),description:{report:report(DESCRIPTION_TITLES)},timeline:{report:report(TIMELINE_TITLES)}};
  const original=s.timeline.report.sections[0].paragraphs[0];
  const padTo=n=>original+' '+Array.from({length:n-original.split(/\s+/).length},(_,i)=>`detail${String.fromCharCode(97+i%26)}`).join(' ');
  s.timeline.report.sections[0].paragraphs[0]=padTo(86);
  assert.deepEqual(deterministicReportIssues(s),[]);
  s.timeline.report.sections[0].paragraphs[0]=padTo(100);
  assert(deterministicReportIssues(s).some(i=>i.kind==='timeline'&&/paragraph/.test(i.reason)));
});
test('timeline pagination fits longer allowed prose without redundant forced page breaks',()=>{
  const plan=initialPreparation(order()).plan;
  const description=report(DESCRIPTION_TITLES),draft=report(TIMELINE_TITLES);
  const extend=p=>p+' '+Array.from({length:86-p.split(/\s+/).length},()=> 'care').join(' ');
  draft.sections.forEach(s=>s.paragraphs=s.paragraphs.map(extend)); draft.closing=extend(draft.closing);
  const context={...plan,descriptionText:JSON.stringify({sections:descriptionSections(plan,description),closing:description.closing})};
  const pdf=renderTimelinePdf(context,draft);
  assert(checkPreparedPdf('timeline',pdf)<=3);
});
test('unpaid, delivered and changed-answer snapshots cannot submit provider requests',async()=>{
  for(const patch of [{payment_status:'failed'},{fulfillment_status:'delivered'},{answer_revision:2}]) {
    const h=harness({...order(),...patch});await h.tick();assert.equal(h.calls.length,0);
  }
});
test('production opt-in is required and local runs remain inert',async()=>{
  process.env.SOULMATE_AUTO_REPORTS_ENABLED='true';process.env.VERCEL_ENV='preview';
  assert.equal((await runAutomaticSoulmateReports()).enabled,false);
  process.env.VERCEL_ENV='production';delete process.env.SOULMATE_AUTO_REPORTS_ENABLED;
  assert.equal((await runAutomaticSoulmateReports()).enabled,false);
});
test('image compression retains square resolution and rejects tiny/malformed input',async()=>{
  const bytes=await sharp({create:{width:2048,height:2048,channels:3,background:'#ccaa88'}}).png().toBuffer();
  const result=await providers.normalizeReportImage(bytes);assert(result.buffer.length<2800000);assert.equal((await sharp(result.buffer).metadata()).width,2048);
  await assert.rejects(providers.normalizeReportImage(Buffer.from('bad')));
  await assert.rejects(providers.normalizeReportImage(await sharp({create:{width:5,height:5,channels:3,background:'white'}}).png().toBuffer()),/dimensions/);
  assert.throws(()=>checkPreparedPdf('sketch',Buffer.from('%PDF-1.3 /Type /Page /Type /Page')),/layout/);
});
