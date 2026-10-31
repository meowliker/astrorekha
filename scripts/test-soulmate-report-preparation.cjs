const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { buildReportPlan, DESCRIPTION_TITLES, validateDescription, descriptionSections, addMonths, descriptionPrompt } = require('../src/lib/soulmate-report-plan');
const { initialPreparation, advanceReportPreparation } = require('../src/lib/soulmate-report-preparation');
const { submitReportSketch, generateReportDescription } = require('../src/lib/soulmate-report-providers');
const { buildSoulmateCart } = require('../src/lib/soulmate-cart');
const { TIMELINE_TITLES, validateTimeline, assertTimelineContext, timelinePrompt, timelineSections } = require('../src/lib/soulmate-timeline');
const date = new Date('2026-10-17T01:00:00Z');
const answers = { name: 'Fixture Buyer', heart: 'I feel like I’ve been waiting forever', preferenceSelection: 'I like men', preference: 'I like women', feeling: 'Safe — someone who stays', birthDate: '1967-04-05', ethnicity: 'Any Indian background' };
const order = (plan = 'express', addons = []) => ({ id: 'sm_aaaaaaaaaaaaaaaaaaaa', catalog_version: 2, payment_status: 'paid', review_status: 'pending', answer_revision: 1, answers, entitlements: buildSoulmateCart(plan, addons).entitlements, scheduled_send_at: '2026-10-17T05:30:00Z', fulfillment_status: 'pending' });
const prose = 'You may imagine a warm and steady connection that grows through mutual care and honest conversation. Its possibilities are an invitation to reflect, with room for your own choices and experience.';
const draft = () => ({ sections: DESCRIPTION_TITLES.map(title => ({ title, paragraphs: [prose, prose] })), closing: prose });
const timelineDraft = () => ({ sections: TIMELINE_TITLES.map(title => ({ title, paragraphs: [prose, prose] })), closing: prose });
// Tiny valid PNG is enough for format/one-page checks; visual review uses a full drawing separately.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64');
function harness(value = order()) {
  let current = value, saved;
  const calls = [], files = [];
  return {
    io: { currentOrder: async () => current, checkpoint: async s => { saved = structuredClone(s); }, saveAsset: async (asset, bytes) => { files.push({ asset, bytes }); } },
    providers: { submit: async () => { calls.push('submit'); return 'fixture-task'; }, poll: async () => { calls.push('poll'); return { buffer: png, contentType: 'image/png', extension: 'png' }; }, describe: async () => { calls.push('describe'); return { report: draft(), model: 'fixture', requestId: 'fixture', usage: {} }; }, timeline: async context => { calls.push('timeline'); assert.match(context.descriptionText, /The face in your sketch/); return { report: timelineDraft(), model: 'fixture', requestId: 'timeline-fixture', usage: {} }; } },
    calls, files, saved: () => saved, change: v => { current = v; },
  };
}
test('all ten purchase baskets select only their purchased reports', () => {
  for (let mask = 0; mask < 8; mask++) {
    const addons = ['description', 'colour', 'priority'].filter((_, i) => mask & (1 << i));
    const p = buildReportPlan(order('standard', addons), date);
    assert.equal(p.description, addons.includes('description'));
    assert.equal(p.profile.colour, addons.includes('colour'));
    assert.deepEqual(p.blockedAssets, []);
  }
  for (const addons of [[], ['timeline']]) {
    const p = buildReportPlan(order('express', addons), date);
    assert.equal(p.description, true); assert.equal(p.profile.colour, true);
    assert.deepEqual(p.blockedAssets, []); assert.equal(p.timeline, addons.includes('timeline'));
  }
});
test('confirmed preference wins; open-to-either choice is stable and unrelated to buyer name', () => {
  const p = buildReportPlan(order(), date);
  assert.equal(p.profile.subject, 'woman'); assert.deepEqual(p.profile.ageRange, [56, 62]);
  assert.match(p.sketchPrompt, /silver strands/);
  const open = { ...order(), answers: { ...answers, preference: 'I’m open to both' } };
  assert.equal(buildReportPlan(open, date).profile.subject, buildReportPlan({ ...open, answers: { ...open.answers, name: 'Another Name' } }, date).profile.subject);
  const man = buildReportPlan({ ...order(), answers: { ...answers, preference: 'I like men', birthDate: '2008-10-17' } }, date);
  assert.equal(man.profile.subject, 'man'); assert.deepEqual(man.profile.ageRange, [18, 21]);
});
test('provider prompts contain no customer identity or exact birthday; B&W has no colour promise', () => {
  const p = buildReportPlan(order('standard', ['description']), date);
  for (const text of [p.sketchPrompt, descriptionPrompt(p)]) {
    assert.equal(text.includes(answers.name), false); assert.equal(text.includes(answers.birthDate), false);
    assert.equal(text.includes(order().id), false);
  }
  assert.match(p.sketchPrompt, /Strict grayscale/);
  assert.match(descriptionPrompt(p), /Never claim to see eye/);
});
test('future dates use current India day or later delivery day, with leap/month-end handling', () => {
  const p = buildReportPlan(order(), new Date('2026-12-31T19:00:00Z'));
  assert.equal(p.preparedOn, '2027-01-01'); assert.deepEqual(p.meetingWindow, { start: '2027-07-01', end: '2028-01-01' });
  assert.equal(addMonths('2027-08-31', 6), '2028-02-29');
  const futureDelivery = buildReportPlan({ ...order(), scheduled_send_at: '2026-10-20T10:00:00Z' }, date);
  assert.equal(futureDelivery.referenceDay, '2026-10-20');
  assert.match(descriptionSections(p, draft())[6].paragraphs[0], /July 2027/);
});
test('invalid, unpaid, approved, incomplete and underage snapshots cannot start', () => {
  for (const patch of [{ payment_status: 'pending' }, { review_status: 'approved' }, { answer_revision: 0 }, { answers: {} }, { answers: { ...answers, birthDate: '2020-01-01' } }, { entitlements: { ...order().entitlements, required_assets: ['sketch'] } }]) {
    assert.throws(() => buildReportPlan({ ...order(), ...patch }, date));
  }
});
test('malformed or past-dated provider content is rejected, ordinary possibility language allowed', () => {
  assert.doesNotThrow(() => validateDescription(draft()));
  for (const invalid of [' October 2025', ' on 12/10', ' next year', ' <script>alert(1)</script>']) {
    const d = draft(); d.sections[0].paragraphs[0] += invalid; assert.throws(() => validateDescription(d));
  }
  const d = draft(); d.sections.pop(); assert.throws(() => validateDescription(d));
});
test('default stays disabled with zero provider calls or checkpoints', async () => {
  const h = harness(); await assert.rejects(advanceReportPreparation(initialPreparation(order(), date), h.io, { providers: h.providers }), /disabled/);
  assert.deepEqual(h.calls, []); assert.equal(h.saved(), undefined);
});
test('resumable preparation includes a purchased timeline after its matching description without email', async () => {
  const o = order('express', ['timeline']), h = harness(o);
  let state = initialPreparation(o, date);
  for (let i = 0; i < 5; i++) state = await advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date });
  assert.equal(state.stage, 'prepared'); assert.deepEqual(h.calls, ['submit', 'poll', 'describe', 'timeline']);
  assert.deepEqual(state.plan.blockedAssets, []); assert.deepEqual(state.assets.map(a => a.kind), ['sketch', 'description', 'timeline']);
  for (const { bytes } of h.files) assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal((h.files[0].bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
  await advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date });
  assert.equal(h.calls.length, 4);
  await assert.rejects(advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: new Date('2028-01-01T00:00:00Z') }), /joint review/);
  assert.equal(h.calls.length, 4);
});
test('sketch-only orders never call Claude and produce only sketch PDF', async () => {
  const o = order('standard'), h = harness(o); let state = initialPreparation(o, date);
  for (let i = 0; i < 3; i++) state = await advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date });
  assert.equal(state.stage, 'prepared'); assert.deepEqual(h.calls, ['submit', 'poll']); assert.equal(state.assets.length, 1);
});
test('an interrupted POST is checkpointed before the request and never blindly resubmitted', async () => {
  const h = harness(); h.providers.submit = async () => { assert.equal(h.saved().stage, 'sketch_submitting'); throw Error('network timeout'); };
  await assert.rejects(advanceReportPreparation(initialPreparation(order(), date), h.io, { execute: true, providers: h.providers, now: date }), /timeout/);
  await assert.rejects(advanceReportPreparation(h.saved(), h.io, { execute: true, providers: h.providers, now: date }), /uncertain/);
});
test('editing answers during generation stops stale results before files can be prepared', async () => {
  const h = harness(); const initial = initialPreparation(order(), date);
  const state = await advanceReportPreparation(initial, h.io, { execute: true, providers: h.providers, now: date });
  h.providers.poll = async () => { h.change({ ...order(), answer_revision: 2 }); return { buffer: png, contentType: 'image/png', extension: 'png' }; };
  await assert.rejects(advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date }), /changed/);
  assert.equal(h.files.length, 0);
});
test('dedicated provider keys are mandatory; generic main-app credentials are not used', async () => {
  const previous = process.env.SOULMATE_KIE_API_KEY; delete process.env.SOULMATE_KIE_API_KEY;
  try { await assert.rejects(submitReportSketch(buildReportPlan(order(), date)), /SOULMATE_KIE_API_KEY/); }
  finally { if (previous) process.env.SOULMATE_KIE_API_KEY = previous; }
});
test('Claude receives the generated image with dedicated credentials and validates complete output', async () => {
  const originalFetch = global.fetch, previous = process.env.SOULMATE_ANTHROPIC_API_KEY;
  process.env.SOULMATE_ANTHROPIC_API_KEY = 'fixture-only-key';
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(init.headers['x-api-key'], 'fixture-only-key');
    const body = JSON.parse(init.body); assert.equal(body.messages[0].content[0].source.data, png.toString('base64'));
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(draft()) }], model: body.model, id: 'fixture' }));
  };
  try { const result = await generateReportDescription(buildReportPlan(order(), date), png, 'image/png'); assert.equal(result.report.sections.length, 6); }
  finally { global.fetch = originalFetch; if (previous) process.env.SOULMATE_ANTHROPIC_API_KEY = previous; else delete process.env.SOULMATE_ANTHROPIC_API_KEY; }
});
test('timeline preserves the description window and rejects stale or malformed dates', () => {
  const context = { ...buildReportPlan(order('express', ['timeline']), date), descriptionText: prose.repeat(4) };
  assert.doesNotThrow(() => assertTimelineContext(context, date));
  assert.throws(() => assertTimelineContext({ ...context, meetingWindow: { start: '2026-10-16', end: '2027-10-17' } }, date), /dates need review/);
  assert.throws(() => assertTimelineContext({ ...context, meetingWindow: { start: '2027-02-30', end: '2027-10-17' } }, date), /Invalid/);
  assert.throws(() => assertTimelineContext(context, new Date('2027-01-01T00:00:00Z')), /dates need review/);
  const sections = timelineSections(context, timelineDraft());
  assert.match(sections[1].paragraphs[0], /^April 2027 - October 2027/);
  assert.equal(sections[0].paragraphs[0], 'From October 2026');
  assert.deepEqual(sections[2].paragraphs, timelineDraft().sections[2].paragraphs);
  assert.deepEqual(sections[3].paragraphs, timelineDraft().sections[3].paragraphs);
  assert.match(timelinePrompt(context), /Do not repeat appearance, initials, career/);
  assert.ok(timelinePrompt(context).includes(context.descriptionText));
  assert.equal(timelinePrompt(context).includes(answers.name), false);
});
test('timeline rejects extra dates and durations rather than inventing a conflicting schedule', () => {
  for (const addition of [' in 2028', ' on 22/12', ' in June', ' after six months', ' next year']) {
    const value = timelineDraft(); value.sections[0].paragraphs[0] += addition; assert.throws(() => validateTimeline(value));
  }
});
test('bundle without timeline never generates it', async () => {
  const h = harness(); let state = initialPreparation(order(), date);
  for (let i = 0; i < 4; i++) state = await advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date });
  assert.deepEqual(h.calls, ['submit', 'poll', 'describe']); assert.deepEqual(state.assets.map(a => a.kind), ['sketch', 'description']);
});
test('editing during timeline generation stops stale output before any PDF is saved', async () => {
  const o = order('express', ['timeline']), h = harness(o); let state = initialPreparation(o, date);
  for (let i = 0; i < 3; i++) state = await advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date });
  h.providers.timeline = async () => { h.change({ ...o, answer_revision: 2 }); return { report: timelineDraft(), model: 'fixture', requestId: 'fixture' }; };
  await assert.rejects(advanceReportPreparation(state, h.io, { execute: true, providers: h.providers, now: date }), /changed/);
  assert.equal(h.files.length, 0);
  await assert.rejects(advanceReportPreparation({ ...h.saved(), plan: buildReportPlan({ ...o, answer_revision: 2 }, date) }, h.io, { execute: true, providers: h.providers, now: date }), /uncertain/);
});
