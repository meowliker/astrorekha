const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHmac } = require('node:crypto');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { diagnosePineLabsWebhook } = require('../src/lib/pinelabs-webhook-diagnostics');
const { verifyPineLabsWebhook } = require('../src/lib/pinelabs-api');

test('diagnosis distinguishes encodings without authorizing alternate signatures or disclosing input', () => {
  process.env.PINELABS_CLIENT_SECRET = '0123456789abcdef0123456789abcdef';
  const raw = '{ "customer": "private@example.com", "status": "PROCESSED" }';
  const timestamp = String(Math.floor(Date.now() / 1000));
  for (const [name, encoding] of [['utf8', 'utf8'], ['base64-decoded', 'base64'], ['hex-decoded', 'hex']]) {
    const signature = createHmac('sha256', Buffer.from(process.env.PINELABS_CLIENT_SECRET, encoding))
      .update(`event-1.${timestamp}.${raw}`).digest('base64');
    const headers = new Headers({ 'webhook-id': 'event-1', 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` });
    assert.deepEqual(diagnosePineLabsWebhook(raw, headers), [`${name}/raw`]);
    assert.equal(verifyPineLabsWebhook(raw, headers), name === 'utf8');
    const output = JSON.stringify(diagnosePineLabsWebhook(raw, headers));
    for (const sensitive of ['private@example.com', process.env.PINELABS_CLIENT_SECRET, signature, timestamp]) assert.equal(output.includes(sensitive), false);
  }
});

test('formatting diagnosis identifies altered serialization but does not validate it', () => {
  process.env.PINELABS_CLIENT_SECRET = 'fixture-secret';
  const raw = '{ "status": "PROCESSED" }';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.PINELABS_CLIENT_SECRET)
    .update(`event-2.${timestamp}.${JSON.stringify(JSON.parse(raw))}`).digest('base64');
  const headers = new Headers({ 'webhook-id': 'event-2', 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` });
  assert.deepEqual(diagnosePineLabsWebhook(raw, headers), ['utf8/compact-json']);
  assert.equal(verifyPineLabsWebhook(raw, headers), false);
  headers.set('webhook-signature', 'v2,' + signature);
  assert.deepEqual(diagnosePineLabsWebhook(raw, headers), []);
  assert.deepEqual(diagnosePineLabsWebhook(raw, new Headers()), []);
});
