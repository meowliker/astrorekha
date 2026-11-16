// No real AI, database, email, or payment calls. Run from the repository root.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require('ts-node/register');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, ...args);
};

const prompts = require('../prompts/elysia.json');
let state;
function reset(overrides = {}) {
  state = { market: 'IN', session: 'user', coins: 9, pass: null, payments: [], calls: [], logs: [], reads: [],
    replies: ['A practical reading. <follow_up_questions>["What next?","What timing?","Why?"]</follow_up_questions>'],
    chart: { data: { sun_sign: 'Pisces', moon_sign: 'Taurus', ascendant: 'Cancer' } }, ...overrides };
}
const db = { from(table) {
  state.reads.push(table);
  const query = {
    select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
    maybeSingle: async () => ({ data: { coins: state.coins }, error: null }),
    then: (a, b) => Promise.resolve({ data: state.payments, error: null }).then(a, b),
  };
  return query; // Deliberately has no write methods.
} };
const load = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === '@/lib/anthropic') return { anthropic: { messages: { create: async input => {
    state.calls.push(input);
    if (state.aiFails) throw Error('Mock AI unavailable');
    return { id: `mock-${state.calls.length}`, usage: { input_tokens: 10, output_tokens: 8 },
      content: [{ type: 'text', text: state.replies.shift() || 'A corrected answer.' }] };
  } } } };
  if (id === '@/lib/ai-usage-logger') return { logClaudeUsage: async input => { state.logs.push(input); } };
  if (id === '@/lib/supabase-admin') return { getSupabaseAdmin: () => db };
  if (id === '@/lib/customer-market') return { customerMarket: async () => state.market, activeUsChatPass: async () => state.pass };
  if (id === '@/lib/report-session') return { reportSessionUser: () => state.session };
  if (id === '@/lib/us-main/western-chart') return { loadWesternAccountChart: async () => state.chart };
  return load.call(this, id, parent, isMain);
};
// Guard against accidental live requests from any new dependency.
global.fetch = async () => { throw Error('Network disabled in Elysia regression tests'); };
const { NextRequest } = require('next/server');
const { WESTERN_REPORT_INSTRUCTIONS } = require('../src/lib/us-main/western-report');
const emptyRuntime = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-no-prompts-'));
const cwd = process.cwd();
process.chdir(emptyRuntime);
// Import AND invoke with no prompts folder in the runtime working directory.
const { POST } = require('../src/app/api/chat/route');
async function request(body = {}) {
  const response = await POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'user', message: 'Tell me about my chart', ...body }),
  }));
  return { status: response.status, body: await response.json() };
}
function assertPrompts() {
  const prompt = state.calls[0].system;
  assert.ok(prompt.startsWith(prompts.system + '\n\n'));
  assert.ok(prompt.includes(prompts.interpretationRules));
  assert.ok(prompt.includes("=== THIS USER'S PERSONAL DATA ==="));
  assert.equal(state.calls[0].model, 'claude-sonnet-4-5-20250929');
  assert.equal(state.calls[0].max_tokens, 1024);
  return prompt;
}
async function main() {
  reset();
  const india = await request({ userProfile: { sunSign: 'Aquarius' } });
  assert.equal(india.status, 200);
  assert.equal(india.body.reply, 'A practical reading.');
  assert.deepEqual(india.body.followUpQuestions, ['What next?', 'What timing?', 'Why?']);
  assert.equal(india.body.unlimitedPassActive, false);
  assert.equal(state.logs.length, 1);
  assert.match(assertPrompts(), /Sun Sign: Aquarius/);
  assert.ok(!state.calls[0].system.includes(WESTERN_REPORT_INSTRUCTIONS));

  reset({ market: 'US' });
  assert.equal((await request({ userProfile: { sunSign: 'Aquarius' } })).status, 200);
  const usPrompt = assertPrompts();
  assert.ok(usPrompt.includes('"sun_sign":"Pisces"'));
  assert.ok(usPrompt.indexOf(WESTERN_REPORT_INSTRUCTIONS) > usPrompt.indexOf(prompts.interpretationRules));
  assert.ok(!usPrompt.includes('Sun Sign: Aquarius'));

  reset({ market: 'US', chart: null });
  await request();
  assert.match(assertPrompts(), /Unavailable\. Ask the user to complete saved birth details; never substitute old signs/);

  reset();
  await request({ message: 'Which career suits me?', context: { previousMessages: [
    { role: 'assistant', content: 'Welcome to Palm Cosmic' },
    { role: 'user', content: 'I have a question' },
  ] } });
  assert.match(assertPrompts(), /CAREER RESPONSE RULE/);
  assert.deepEqual(state.calls[0].messages.map(m => m.content), ['I have a question', 'Which career suits me?']);

  reset({ coins: 0 });
  assert.equal((await request()).status, 402);
  assert.equal(state.calls.length, 0);
  reset();
  assert.equal((await request({ message: '' })).status, 400);
  assert.equal(state.calls.length, 0);

  reset({ coins: 0, market: 'US', pass: { endsAt: '2030-01-01T00:00:00.000Z' } });
  const usPass = await request();
  assert.equal(usPass.status, 200);
  assert.equal(usPass.body.unlimitedPassActive, true);
  assert.equal(usPass.body.unlimitedPassEndsAt, state.pass.endsAt);
  assert.ok(!state.reads.includes('users'));
  reset({ coins: 0, payments: [{ id: 'in-pass', fulfilled_at: new Date().toISOString() }] });
  assert.equal((await request()).body.unlimitedPassActive, true);

  reset({ replies: ['Welcome to Palm Cosmic', 'This is AstroRekha.'] });
  const correction = await request();
  assert.equal(correction.body.reply, 'This is AstroRekha.');
  assert.equal(state.calls.length, 2);
  assert.ok(state.calls[1].system.startsWith(state.calls[0].system));
  assert.equal(state.logs[1].operation, 'reply_correction');

  reset({ aiFails: true });
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await request()).status, 500); } finally { console.error = originalError; }
  assert.equal(state.logs[0].status, 'failed');

  // Optional build check: both complete instruction strings must be inside emitted JS,
  // so the deployed function no longer needs a loose Elysia text/JSON file.
  if (process.argv.includes('--built')) {
    const builtFiles = [];
    function visit(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.name.endsWith('.js')) builtFiles.push(fs.readFileSync(file, 'utf8'));
      }
    }
    visit(path.join(root, '.next/server'));
    // Webpack may emit JSON.parse('...') and mangle the property names.
    // Decode literal JSON arguments rather than assuming a minifier's escaping.
    const ts = require('typescript');
    const embeddedStrings = [];
    for (const js of builtFiles.filter(text => text.includes('PRIMARY TIMING SOURCE'))) {
      const tree = ts.createSourceFile('server.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function inspect(node) {
        if (ts.isStringLiteral(node)) {
          embeddedStrings.push(node.text);
          try {
            const value = JSON.parse(node.text);
            if (value && typeof value === 'object') embeddedStrings.push(...Object.values(value));
          } catch { /* Ordinary JS strings aren't JSON. */ }
        }
        ts.forEachChild(node, inspect);
      }
      inspect(tree);
    }
    for (const text of Object.values(prompts)) assert.ok(embeddedStrings.includes(text), 'Full prompt must be embedded in built server JS');
    const trace = JSON.parse(fs.readFileSync(path.join(root, '.next/server/app/api/chat/route.js.nft.json')));
    assert.ok(!trace.files.some(file => /prompts\/elysia.*\.txt$/.test(file)), 'No dependency on removed loose text files');
  }
  console.log('PASS: Elysia prompts with empty runtime folder; INR/US context, missing chart, history, career, coin/pass gating, correction, follow-ups and failure handling.');
  for (const [name, text] of Object.entries(prompts)) console.log(`${name} SHA256: ${createHash('sha256').update(text).digest('hex')}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  process.chdir(cwd);
  fs.rmSync(emptyRuntime, { recursive: true, force: true });
  Module._load = load;
  Module._resolveFilename = resolve;
});
