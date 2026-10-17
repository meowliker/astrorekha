#!/usr/bin/env node
// Explicit manual style experiment; never imported by the application or fulfillment worker.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(n, p, ...rest) { return resolve.call(this, n.startsWith('@/') ? path.join(__dirname, '../src', n.slice(2)) : n, p, ...rest); };
const { buildSoulmateSketchPrompt } = require('../src/lib/soulmate-sketch-prompts');
const { downloadImage } = require('../src/lib/soulmate-fulfillment');
const dir = path.join(__dirname, '../output/imagegen/soulmate-pencil-comparison');
const variants = [
  { letter: 'A', style: 'pencil', label: 'Finished pencil', model: 'nano-banana-2', credits: 12, source: 'https://kie.ai/nano-banana-2' },
  { letter: 'B', style: 'loose', label: 'Loose pencil study', model: 'nano-banana-2', credits: 12, source: 'https://kie.ai/nano-banana-2' },
  { letter: 'C', style: 'pencil', label: 'Finished pencil / Seedream', model: 'seedream/4.5-text-to-image', credits: 6.5, source: 'https://kie.ai/seedream-4-5' },
];
const jobs = [true, false].flatMap(colour => variants.map(v => {
  const prompt = buildSoulmateSketchPrompt({ subject: 'woman', ageRange: [56, 62], background: 'Any Indian', colour, hair: 'softly waved shoulder-length', clothing: 'muted teal', mood: 'A kind, steady gaze and reassuring warmth' }, v.style);
  const input = v.model === 'nano-banana-2'
    ? { prompt, aspect_ratio: '1:1', resolution: '2K', output_format: 'jpg', google_search: false, image_input: [] }
    : { prompt, aspect_ratio: '1:1', quality: 'basic' };
  return { ...v, id: `${colour ? 'colour' : 'bw'}-${v.letter.toLowerCase()}`, colour, request: { model: v.model, input } };
}));
function save(file, value) { fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
(async () => {
  const action = process.argv[2];
  if (!['--submit', '--poll'].includes(action)) {
    console.log(JSON.stringify({ mode: 'plan-only', images: jobs.length, plannedCredits: jobs.reduce((s,j) => s + j.credits,0), maximumPerImage: 12, commands: ['--submit', '--poll'] },null,2)); return;
  }
  require('dotenv').config({ path: path.join(__dirname, '../.env.production.local') });
  const key = process.env.SOULMATE_KIE_API_KEY?.trim();
  if (!key) throw Error('Missing dedicated Soulmate Kie key');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  process.umask(0o077); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, '.lock'), fd = fs.openSync(lock, 'wx', 0o600);
  async function balance() {
    const r = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const p = await r.json(); if (!r.ok || p.code !== 200 || typeof p.data !== 'number') throw Error('Unable to verify credit balance'); return p.data;
  }
  try {
    if (action === '--submit') {
      const startingBalance = await balance();
      const unsubmitted = jobs.filter(j => !fs.existsSync(path.join(dir, j.id + '.json')));
      if (startingBalance < unsubmitted.reduce((s,j) => s+j.credits,0)) throw Error('Not enough credits for planned batch');
      if (!fs.existsSync(path.join(dir, 'batch.json'))) save(path.join(dir, 'batch.json'), { createdAt: new Date().toISOString(), startingBalance, plannedCredits: 61, maxPerImage: 12, pricingChecked: '2026-10-17', pricingSources: variants.map(v => v.source) });
      for (const j of jobs) {
        if (j.credits > 12 || j.request.input.resolution === '4K' || j.request.input.quality === 'high') throw Error('Credit ceiling exceeded');
        if (j.request.input.prompt.length > 3000) throw Error('Prompt too long');
        const file = path.join(dir, j.id + '.json');
        if (fs.existsSync(file)) { const prior = JSON.parse(fs.readFileSync(file)); if (!prior.taskId) throw Error(`Inspect uncertain submission ${j.id}; no duplicate POST`); continue; }
        save(file, { ...j, stage: 'submitting', submittedAt: new Date().toISOString() });
        const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', { method: 'POST', headers, body: JSON.stringify(j.request), signal: AbortSignal.timeout(30000) });
        const p = await r.json();
        if (!r.ok || p.code !== 200 || !p.data?.taskId) throw Error(`Submission ${j.id} not confirmed (${r.status}/${p.code}); inspect before retry`);
        save(file, { ...j, stage: 'submitted', taskId: p.data.taskId, submittedAt: new Date().toISOString() });
        console.log(JSON.stringify({ sample: j.id, status: 'submitted', model: j.model, listedCredits: j.credits }));
      }
      save(path.join(dir, 'balance-after-submission.json'), { balance: await balance(), checkedAt: new Date().toISOString() });
    } else {
      for (const j of jobs) {
        const file = path.join(dir, j.id + '.json');
        if (!fs.existsSync(file)) { console.log(JSON.stringify({ sample: j.id, status: 'not-submitted' })); continue; }
        const saved = JSON.parse(fs.readFileSync(file));
        if (saved.stage === 'complete') { console.log(JSON.stringify({ sample: j.id, status: 'complete', file: saved.filename })); continue; }
        if (!saved.taskId) throw Error(`No task id for ${j.id}; manual inspection required`);
        const r = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(saved.taskId)}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(20000) });
        const p = await r.json(); if (!r.ok || p.code !== 200) throw Error(`Status unavailable for ${j.id}`);
        if (p.data?.state !== 'success') { console.log(JSON.stringify({ sample: j.id, status: p.data?.state || 'unknown' })); continue; }
        const result = JSON.parse(p.data.resultJson);
        if (result.resultUrls?.length !== 1) throw Error('Expected a single output');
        const image = await downloadImage(result.resultUrls[0]);
        const filename = `${j.id}.${image.extension}`;
        fs.writeFileSync(path.join(dir, filename), image.buffer, { mode: 0o600 });
        save(file, { ...saved, stage: 'complete', filename, bytes: image.buffer.length, completedAt: new Date().toISOString(), providerResult: p.data });
        console.log(JSON.stringify({ sample: j.id, status: 'complete', file: filename }));
      }
      save(path.join(dir, 'balance-latest.json'), { balance: await balance(), checkedAt: new Date().toISOString() });
    }
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
