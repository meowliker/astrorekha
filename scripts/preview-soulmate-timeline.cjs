#!/usr/bin/env node
// Local preview only. No database, storage, email, approval or scheduler access.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest); };
const { assertTimelineContext, timelineFingerprint } = require('../src/lib/soulmate-timeline');
const { generateReportTimeline } = require('../src/lib/soulmate-report-providers');
const { renderTimelinePdf } = require('../src/lib/soulmate-report-pdf');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
(async () => {
  if (args.includes('--help')) { console.log('node scripts/preview-soulmate-timeline.cjs --context file.json --image sketch.jpg --out preview-directory [--env-file .env.local] [--execute]\nDefault: validate inputs only. Explicit execution generates a local preview, including for an owner-requested sample outside a purchased entitlement. Never attaches or sends it.'); return; }
  const context = JSON.parse(fs.readFileSync(option('--context'), 'utf8'));
  const image = fs.readFileSync(option('--image'));
  const contentType = /\.png$/i.test(option('--image')) ? 'image/png' : 'image/jpeg';
  assertTimelineContext(context);
  const fingerprint = timelineFingerprint(context, image);
  if (!args.includes('--execute')) { console.log(JSON.stringify({ mode: 'preview-plan', meetingWindow: context.meetingWindow, fingerprint, providerCalls: 0, writes: 0 })); return; }
  require('dotenv').config({ path: option('--env-file') || '.env.local' });
  if (!process.env.SOULMATE_ANTHROPIC_API_KEY?.trim()) throw Error('Missing dedicated Soulmate Claude key');
  process.umask(0o077);
  const dir = path.resolve(option('--out'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, '.lock'), fd = fs.openSync(lock, 'wx', 0o600);
  const statePath = path.join(dir, 'preview-state.json');
  const atomic = (file, content) => { fs.writeFileSync(`${file}.tmp`, content, { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file); };
  try {
    let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { fingerprint, stage: 'planned' };
    if (state.fingerprint !== fingerprint) throw Error('Source changed; choose a fresh preview directory');
    if (state.stage === 'submitting') throw Error('Previous request outcome uncertain. Inspect saved response before retrying; no automatic generation retry.');
    if (!state.result) {
      state.stage = 'submitting'; atomic(statePath, JSON.stringify(state, null, 2));
      const result = await generateReportTimeline(context, image, contentType, async payload => atomic(path.join(dir, 'provider-response.json'), JSON.stringify(payload, null, 2)));
      state = { ...state, stage: 'generated', result }; atomic(statePath, JSON.stringify(state, null, 2));
    }
    const pdf = renderTimelinePdf(context, state.result.report);
    const output = path.join(dir, 'Soulmate-Connection-Timeline.pdf');
    atomic(output, pdf);
    atomic(path.join(dir, 'report.json'), JSON.stringify(state.result.report, null, 2));
    atomic(path.join(dir, 'source-context.json'), JSON.stringify(context, null, 2));
    state.stage = 'prepared'; atomic(statePath, JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ output, bytes: pdf.length, attached: false, emailed: false, automatic: false }));
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
