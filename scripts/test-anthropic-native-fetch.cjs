// Real SDK + localhost HTTP fixtures only. Never sends a request to Anthropic.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const url = require('node:url');
const originalParse = url.parse;
let legacyCalls = 0;
url.parse = function (...args) { legacyCalls++; return originalParse.apply(this, args); };
// Instrument before requiring the SDK because node-fetch captures url.parse.
const Anthropic = require('@anthropic-ai/sdk');
after(() => { url.parse = originalParse; });
const model = 'claude-sonnet-4-5-20250929';
const body = { model, max_tokens: 1024, system: 'Fixture system prompt', messages: [{ role: 'user', content: [
  { type: 'text', text: 'Fixture palm question' },
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'Zml4dHVyZQ==' } },
] }] };
const reply = { id: 'fixture-response', type: 'message', role: 'assistant', model,
  content: [{ type: 'text', text: 'Fixture answer' }], stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 11, output_tokens: 7 } };
async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try { await run(baseURL); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
function send(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'fixture-request', 'retry-after-ms': '1' });
  res.end(JSON.stringify(value));
}
test('reproduces the old SDK URL parser and removes it with native fetch, preserving payload, auth and response', async () => {
  const requests = [];
  await withServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    requests.push({ url: req.url, method: req.method, key: req.headers['x-api-key'], version: req.headers['anthropic-version'], body: JSON.parse(text) });
    send(res, 200, reply);
  }, async baseURL => {
    const options = { apiKey: 'fixture-only', baseURL, maxRetries: 0 };
    legacyCalls = 0;
    const old = await new Anthropic(options).messages.create(body);
    assert.ok(legacyCalls > 0, 'baseline must prove the deprecated parser is actually reached');
    legacyCalls = 0;
    const current = await new Anthropic({ ...options, fetch: globalThis.fetch }).messages.create(body);
    assert.equal(legacyCalls, 0, 'native fetch must not call legacy url.parse');
    assert.deepEqual(current, old);
    assert.deepEqual(requests[1], requests[0]);
    assert.deepEqual(requests[1].body, body);
    assert.equal(requests[1].url, '/v1/messages');
    assert.equal(requests[1].key, 'fixture-only');
    assert.equal(requests[1].version, '2023-06-01');
  });
});
test('SDK retry policy and provider errors still work with native fetch', async () => {
  let attempts = 0;
  await withServer((req, res) => {
    req.resume(); attempts++;
    send(res, attempts === 1 ? 429 : 200, attempts === 1 ? { type: 'error', error: { type: 'rate_limit_error', message: 'fixture' } } : reply);
  }, async baseURL => {
    const client = new Anthropic({ apiKey: 'fixture-only', baseURL, fetch: globalThis.fetch, maxRetries: 1 });
    assert.equal((await client.messages.create(body)).id, reply.id);
    assert.equal(attempts, 2);
  });
  await withServer((req, res) => { req.resume(); send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'fixture bad input' } }); }, async baseURL => {
    const client = new Anthropic({ apiKey: 'fixture-only', baseURL, fetch: globalThis.fetch, maxRetries: 0 });
    await assert.rejects(client.messages.create(body), error => error.status === 400 && error.message.includes('fixture bad input'));
  });
});
test('configured SDK timeout still aborts a slow request without retries', async () => {
  let attempts = 0;
  await withServer(req => { attempts++; req.resume(); }, async baseURL => {
    const client = new Anthropic({ apiKey: 'fixture-only', baseURL, fetch: globalThis.fetch, timeout: 80, maxRetries: 0 });
    await assert.rejects(client.messages.create(body), error => error instanceof Anthropic.APIConnectionTimeoutError);
    assert.equal(attempts, 1);
  });
});
test('every app Claude client explicitly uses native fetch; no other client options are overridden', () => {
  const root = path.resolve(__dirname, '../src');
  let clients = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('new Anthropic(')) continue;
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function inspect(node) {
        if (ts.isNewExpression(node) && node.expression.getText(tree) === 'Anthropic') {
          clients++;
          const options = node.arguments?.[0];
          assert.ok(options && ts.isObjectLiteralExpression(options), file);
          const transport = options.properties.find(p => p.name?.getText(tree) === 'fetch');
          assert.ok(transport && ts.isPropertyAssignment(transport), `Missing native fetch in ${file}`);
          assert.equal(transport.initializer.getText(tree), 'globalThis.fetch', file);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(tree);
    }
  }
  walk(root); assert.equal(clients, 10);
});
