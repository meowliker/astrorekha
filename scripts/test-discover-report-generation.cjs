// Real report handlers with isolated provider/database boundaries. No API keys or live jobs are used.
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const Module = require('node:module'), path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
let providerCalls = [], response, palmFailure, sketchFailure, locked, sketch, writes;
class Timeout extends Error { constructor() { super('pending'); this.jobId = 'fixture-job'; } }
class Anthropic { constructor() { this.messages = { create: async value => { providerCalls.push(value); if (palmFailure) throw Error('fixture unavailable'); return { id: 'fixture', content: [{ type: 'text', text: response }], usage: {} }; } }; } }
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === '@anthropic-ai/sdk') return { __esModule: true, default: Anthropic };
  if (name === '@/lib/ai-usage-logger') return { logClaudeUsage: async () => {} };
  if (name === '@/lib/supabase-admin') return { getSupabaseAdmin: () => db };
  if (name === '@/lib/soulmate-sketch') return {
    KieTimeoutError: Timeout,
    buildSoulmateSketchPrompt: answers => JSON.stringify(answers),
    generateSoulmateSketchFromKie: async value => { providerCalls.push(value); if (sketchFailure === 'pending') throw new Timeout(); if (sketchFailure) throw Error('fixture failure'); return { imageUrl: 'https://example.com/fixture.jpg', providerJobId: 'fixture-job' }; },
    getSoulmateSketchJobStatusFromKie: async id => { providerCalls.push({ poll: id }); return { state: 'success', imageUrl: 'https://example.com/fixture.jpg' }; },
  };
  return load.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...args);
};
const db = { from(table) {
  let patch = null;
  const execute = async () => {
    if (table === 'settings') return { data: null };
    if (table === 'users') return { data: { id: 'fixture-user', unlocked_features: { soulmateSketch: !locked } } };
    assert.equal(table, 'soulmate_sketches');
    if (patch) { writes++; sketch = { ...sketch, ...patch }; patch = null; }
    return { data: sketch, error: null };
  };
  const q = { select() { return q; }, eq() { return q; }, maybeSingle: execute, upsert(value) { patch = value; return q; }, update(value) { patch = value; return q; }, then(ok, fail) { return execute().then(ok, fail); } };
  return q;
} };
const { NextRequest } = require('next/server');
const palm = require('../src/app/api/palm-reading/route');
const generate = require('../src/app/api/soulmate-sketch/generate/route');
const status = require('../src/app/api/soulmate-sketch/status/route');
const palmBody = { imageData: 'data:image/jpeg;base64,Zml4dHVyZQ==', birthDate: '1990-06-28', zodiacSign: 'Cancer', gender: 'male', userId: 'fixture-user' };
const req = (url, body, auth = true) => new NextRequest('http://localhost' + url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { 'content-type': 'application/json', ...(auth ? { cookie: 'ar_access=fixture-user' } : {}) } });
beforeEach(() => { providerCalls = []; response = JSON.stringify({ cosmicInsight: 'Fixture reading', tabs: { ageTimeline: { stages: [] }, wealth: {}, mounts: {}, love: {} } }); palmFailure = false; sketchFailure = null; locked = false; writes = 0; sketch = { user_id: 'fixture-user', generation_count: 0, question_answers: { attracted_to: 'female', main_worry: 'communication' } }; });
test('palm generation passes the saved birth date, zodiac and uploaded image to the provider and returns the report structure', async () => {
  const result = await palm.POST(req('/api/palm-reading', palmBody)); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.success, true); assert.equal(body.reading.cosmicInsight, 'Fixture reading');
  const content = providerCalls[0].messages[0].content;
  assert.equal(content[0].source.data, 'Zml4dHVyZQ=='); assert.ok(content[1].text.includes('1990-06-28')); assert.ok(content[1].text.includes('Cancer'));
});
test('incomplete birth details do not start generation, and provider failure returns a recoverable error', async () => {
  assert.equal((await palm.POST(req('/api/palm-reading', { ...palmBody, birthDate: '' }))).status, 400); assert.equal(providerCalls.length, 0);
  palmFailure = true; const failed = await palm.POST(req('/api/palm-reading', palmBody)); assert.equal(failed.status, 500); assert.equal((await failed.json()).success, false);
});
test('locked or unsigned sketch requests do not invoke the provider or grant access', async () => {
  assert.equal((await generate.POST(req('/api/soulmate-sketch/generate', { answers: {} }, false))).status, 401);
  locked = true; assert.equal((await generate.POST(req('/api/soulmate-sketch/generate', { answers: {} }))).status, 403);
  assert.equal(providerCalls.length, 0); assert.equal(writes, 0);
});
test('unlocked sketch generation merges saved answers, persists the completed report and rejects repeat generation', async () => {
  const body = await (await generate.POST(req('/api/soulmate-sketch/generate', { answers: { vibe: 'calm', attracted_to: ' ' } }))).json();
  assert.equal(body.success, true); assert.equal(sketch.status, 'complete'); assert.equal(sketch.generation_count, 1);
  assert.equal(sketch.question_answers.attracted_to, 'female'); assert.equal(sketch.question_answers.vibe, 'calm');
  assert.equal((await generate.POST(req('/api/soulmate-sketch/generate', { answers: {} }))).status, 409); assert.equal(providerCalls.length, 1);
});
test('slow generation retains its job ID and status polling completes that same job without resubmission', async () => {
  sketchFailure = 'pending'; const pending = await (await generate.POST(req('/api/soulmate-sketch/generate', { answers: {} }))).json();
  assert.equal(pending.pending, true); assert.equal(sketch.provider_job_id, 'fixture-job'); assert.equal(sketch.status, 'generating');
  sketch.updated_at = new Date(0).toISOString(); const complete = await (await status.GET(req('/api/soulmate-sketch/status'))).json();
  assert.equal(complete.status, 'complete'); assert.equal(complete.remaining, 0);
  assert.equal(providerCalls.filter(x => x.prompt).length, 1); assert.equal(providerCalls.filter(x => x.poll).length, 1);
});
