const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
require('node:dns/promises').lookup = async () => [{ address: '8.8.8.8', family: 4 }];
const { buildStandalonePrompt, emailBody, processSoulmateJob, privateAddress, refreshSoulmateDeliveryStatuses } = require('../src/lib/soulmate-fulfillment');
const answers = { name: 'Maya', heart: 'I feel like I’ve been waiting forever', preferenceSelection: 'I like men', preference: 'I like women', feeling: 'Safe — someone who stays', birthDate: '1995-01-01', ethnicity: 'South Indian' };
let order, job, email, image, calls, rows, uploadCount, assets, files;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const db = {
  from(table) {
    assert.ok(['soulmate_orders', 'soulmate_generation_jobs', 'soulmate_email_deliveries', 'soulmate_order_assets'].includes(table));
    const filters = []; let values;
    const q = { select() { return q; }, update(v) { values = v; return q; }, eq(k,v) { filters.push(row => row[k] === v); return q; }, single() { return run(); }, maybeSingle() { return run(); }, then(ok,fail) { return run().then(ok,fail); } };
    async function run() { if(table==='soulmate_order_assets')return {data:assets,error:null}; const row = rows[table]; if (!filters.every(f => f(row))) return { data: null, error: { code: 'not-found' } }; if (values) Object.assign(row, values); return { data: { ...row }, error: null }; }
    return q;
  },
  storage: { from(bucket) { assert.equal(bucket, 'soulmate-sketches-private'); return {
    async upload(key, buffer, options) { assert.equal(key, `${order.id}/revision-${job.answer_revision}/sketch.jpg`); assert.equal(options.upsert, false); image = Buffer.from(buffer); uploadCount++; return { error: null }; },
    async download(key) { if(files[key])return {data:new Blob([files[key]]),error:null}; assert.ok([`${order.id}/sketch.jpg`,`${order.id}/revision-${job.answer_revision}/sketch.jpg`].includes(key)); return image ? { data: new Blob([image]), error: null } : { data: null, error: {} }; },
  }; } },
  async rpc(name, params) {
    assert.equal(name, 'begin_soulmate_delivery');
    if (params.p_revision!==order.answer_revision || params.p_lease!==job.lease_id || email.status!=='pending') return {data:false,error:null};
    email.status='submitting'; email.submitted_at=new Date().toISOString();
    return {data:true,error:null};
  },
};
function run() { job.lease_id = crypto.randomUUID(); return processSoulmateJob(db, { ...job }); }
beforeEach(() => {
  process.env.KIE_API_KEY = 'fixture'; process.env.BREVO_API_KEY = 'fixture';
  order = { id: 'sm_aaaaaaaaaaaaaaaaaaaa', answers, customer_email: 'maya@example.invalid', customer_name: 'Maya', payment_status: 'paid', paid_at: new Date().toISOString(), scheduled_send_at: new Date(Date.now() + 8 * 3600000).toISOString() };
  job = { order_id: order.id, status: 'queued', provider_job_id: null, prompt: null, generation_attempts: 0, failures: 0, storage_path: null, image_sha256: null, created_at: new Date().toISOString() };
  email = { order_id: order.id, id: crypto.randomUUID(), status: 'pending', scheduled_at: order.scheduled_send_at, provider_message_id: null, submitted_at: null };
  rows = { soulmate_orders: order, soulmate_generation_jobs: job, soulmate_email_deliveries: email };
  order.answer_revision=1; job.answer_revision=1;
  image = null; uploadCount = 0; calls = []; assets=[];files={};
  global.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); throw new Error('Unexpected network request'); };
});
test('prompt honors confirmed gender and chosen background, excludes identifying details', () => {
  const prompt = buildStandalonePrompt(order.id, answers, order.paid_at);
  assert.match(prompt, /adult woman/); assert.match(prompt, /South Indian/); assert.doesNotMatch(prompt, /Maya|1995|example/);
  assert.equal(buildStandalonePrompt(order.id, { ...answers, preference: 'I’m open to both' }, order.paid_at), buildStandalonePrompt(order.id, { ...answers, preference: 'I’m open to both' }, order.paid_at));
  assert.throws(() => buildStandalonePrompt(order.id, {}, order.paid_at));
});
test('unpaid order cannot create a sketch or send an email', async () => {
  order.payment_status = 'pending'; assert.equal((await run()).ok, false); assert.equal(calls.length, 0);
});
test('generation checkpoints task id and resumes polling without duplicate creation', async () => {
  global.fetch = async (url, init) => { calls.push(String(url)); return String(url).includes('createTask') ? json({ code: 200, data: { taskId: 'task-1' } }) : json({ code: 200, data: { state: 'waiting' } }); };
  assert.equal((await run()).ok, true); assert.equal(job.provider_job_id, 'task-1'); assert.equal(job.status, 'generating');
  await run(); assert.equal(calls.filter(v => v.includes('createTask')).length, 1); assert.equal(uploadCount, 0);
});
test('uncertain create request is flagged, never blindly charged twice', async () => {
  await run(); assert.equal(job.status, 'submitting'); await run(); assert.equal(job.status, 'needs_review'); assert.equal(calls.length, 1);
});
test('successful generation saves private image; scheduled attachment is the same image', async () => {
  job.status = 'generating'; job.provider_job_id = 'task-1';
  const bytes = Buffer.from([255,216,255,1,2,3]);
  let body;
  global.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('recordInfo')) return json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://images.example/sketch.jpg'] }) } });
    if (String(url).includes('images.example')) return new Response(bytes);
    body = JSON.parse(init.body); return json({ messageId: '<fixture@brevo>' }, 201);
  };
  await run(); assert.equal(job.status, 'ready'); assert.equal(uploadCount, 1); assert.deepEqual(image, bytes);
  await run(); assert.equal(email.status, 'scheduled'); assert.equal(body.scheduledAt, order.scheduled_send_at);
  assert.equal(body.to[0].email, order.customer_email); assert.equal(body.attachment[0].content, bytes.toString('base64')); assert.equal(body.headers.idempotencyKey, email.id);
  assert.equal(order.delivered_at, undefined, 'Scheduling is not delivery');
});
test('integrity mismatch blocks wrong sketch from being emailed', async () => {
  job.status = 'ready'; job.storage_path = `${order.id}/sketch.jpg`; job.image_sha256 = 'wrong'; image = Buffer.from('bad');
  assert.equal((await run()).ok, false); assert.equal(calls.length, 0); assert.equal(email.status, 'pending');
});
test('email timeout does not cause a duplicate POST; recovers schedule by batch id', async () => {
  job.status = 'ready'; job.storage_path = `${order.id}/sketch.jpg`; image = Buffer.from('image'); job.image_sha256 = crypto.createHash('sha256').update(image).digest('hex');
  await run(); assert.equal(email.status, 'submitting');
  global.fetch = async (url, init) => { assert.notEqual(init.method, 'POST'); return String(url).includes('emailStatus') ? json({ batches: [{ status: 'queued' }] }) : json({ events: [] }); };
  await run(); assert.equal(email.status, 'scheduled'); assert.equal(email.provider_message_id, null);
});
test('only matching recipient and message delivery marks order delivered', async () => {
  job.status = 'ready'; email.status = 'scheduled'; email.provider_message_id = '<fixture@brevo>';
  global.fetch = async () => json({ events: [{ event: 'delivered', messageId: '<other@brevo>', email: order.customer_email, date: new Date().toISOString() }] });
  await run(); assert.equal(order.delivered_at, undefined);
  global.fetch = async () => json({ events: [{ event: 'delivered', messageId: email.provider_message_id, email: order.customer_email, date: new Date().toISOString() }] });
  await run(); assert.equal(order.fulfillment_status, 'delivered'); assert.equal(email.status, 'delivered');
});
test('bounced mail remains reviewable rather than being marked delivered or resent', async () => {
  job.status = 'ready'; email.status = 'sent'; email.provider_message_id = '<fixture@brevo>';
  global.fetch = async () => json({ events: [{ event: 'hard_bounce', messageId: email.provider_message_id, email: order.customer_email }] });
  await run(); assert.equal(email.status, 'needs_review'); assert.equal(order.delivered_at, undefined);
});
test('late recovered order sends promptly; internal image hosts rejected', () => {
  email.scheduled_at = new Date(Date.now() - 60000).toISOString();
  assert.equal(emailBody(order, email, Buffer.from('image'), 'sketch.jpg').scheduledAt, undefined);
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.2', '::1', '::ffff:127.0.0.1']) assert.ok(privateAddress(ip));
  assert.equal(privateAddress('8.8.8.8'), false);
});

function bundle(approved=true,due=true) {
  order.catalog_version=2;order.review_status=approved?'approved':'pending';order.entitlements={required_assets:['sketch','description','timeline']};
  order.scheduled_send_at=new Date(Date.now()+(due?-60000:12*3600000)).toISOString();email.scheduled_at=order.scheduled_send_at;
  for(const kind of order.entitlements.required_assets){const key=`${order.id}/${kind}.pdf`;const buffer=Buffer.from(kind);files[key]=buffer;assets.push({kind,storage_path:key,filename:`${kind}.pdf`,size_bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')});}
}
test('new bundles cannot generate or email before approval or scheduled delivery',async()=>{
  bundle(false,true);await run();assert.equal(calls.length,0);assert.equal(email.status,'pending');
  bundle(true,false);await run();assert.equal(calls.length,0);assert.equal(email.status,'pending');
  order.scheduled_send_at='invalid';await run();assert.equal(calls.length,0);
});
test('approved due bundle sends every purchased file, and repeated worker only reconciles',async()=>{
  bundle();let body;global.fetch=async(url,init)=>{calls.push(init.method||'GET');if(init.method==='POST'){body=JSON.parse(init.body);return json({messageId:'bundle-message'});}return json({events:[]});};
  assert.equal((await run()).ok,true);assert.equal(email.status,'sent');
  assert.deepEqual(body.attachment.map(a=>a.name),['sketch.pdf','description.pdf','timeline.pdf']);assert.equal(body.scheduledAt,undefined);
  assert.equal(body.attachment[1].content,Buffer.from('description').toString('base64'));
  await run();assert.deepEqual(calls,['POST','GET']);
});
test('incomplete or altered bundle cannot be emailed',async()=>{
  bundle();assets.pop();assert.equal((await run()).ok,false);assert.equal(calls.length,0);assert.equal(email.status,'pending');
  bundle();assets[0].sha256='bad';assert.equal((await run()).ok,false);assert.equal(calls.length,0);
});
test('missing email configuration does not mark bundle submitted',async()=>{
  bundle();delete process.env.BREVO_API_KEY;assert.equal((await run()).ok,false);assert.equal(email.status,'pending');assert.equal(calls.length,0);
});

test('an answer revision during attachment download prevents stale delivery',async()=>{
  bundle();
  const original=db.storage.from;
  db.storage.from=(bucket)=>{const store=original(bucket);return {...store,download:async(key)=>{const result=await store.download(key);order.answer_revision=2;job.answer_revision=2;job.lease_id=null;return result;}};};
  try { assert.equal((await run()).ok,true);assert.equal(email.status,'pending');assert.equal(calls.length,0); }
  finally { db.storage.from=original; }
});

const statusDb = { ...db, from(table) { const q = db.from(table); q.in = () => Promise.resolve({data: [{...email}], error: null}); return q; } };
test('dashboard reconciles delivery before the original promise time using GET only and fresh events', async()=>{
  order.catalog_version=2;order.review_status='approved';
  email.status='scheduled';email.provider_message_id='approved-message';email.scheduled_at=new Date(Date.now()-60000).toISOString();
  const sent=new Date(Date.now()-59000).toISOString(), delivered=new Date(Date.now()-58000).toISOString();
  global.fetch=async(url,init)=>{assert.ok(String(url).includes('/statistics/events'));assert.equal(init.method,undefined);assert.equal(init.cache,'no-store');return json({events:[{messageId:email.provider_message_id,email:order.customer_email,event:'requests',date:sent},{messageId:email.provider_message_id,email:order.customer_email,event:'delivered',date:delivered}]});};
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),0);
  assert.equal(email.status,'delivered');assert.equal(email.sent_at,sent);assert.equal(email.delivered_at,delivered);assert.equal(order.fulfillment_status,'delivered');
  global.fetch=async()=>assert.fail('Delivered email must not be queried or resent');
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),0);
});
test('dashboard provider failure retains saved status and returns a visible-warning signal',async()=>{
  email.status='scheduled';email.provider_message_id='message';email.scheduled_at=new Date(Date.now()-60000).toISOString();
  global.fetch=async()=>json({error:'unavailable'},503);
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),1);assert.equal(email.status,'scheduled');assert.equal(order.fulfillment_status,undefined);
});
test('dashboard never starts pending orders or queries unpaid/future emails',async()=>{
  global.fetch=async()=>assert.fail('Must not make a provider request');
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),0);
  email.status='scheduled';email.provider_message_id='message';
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),0);
  email.scheduled_at=new Date(Date.now()-60000).toISOString();order.payment_status='failed';
  assert.equal(await refreshSoulmateDeliveryStatuses(statusDb,[order]),0);
});
