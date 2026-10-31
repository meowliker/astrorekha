const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
process.env.BREVO_API_KEY = 'fixture-api-key';
process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
process.env.BREVO_SENDER_NAME = 'Fixture';
let failures = 0;
const monitor = require.resolve('../src/lib/brevo-send-monitoring');
require.cache[monitor] = { id: monitor, filename: monitor, loaded: true, exports: { recordBrevoSendFailure: async () => { failures++; } } };
const originalFetch = global.fetch;
const calls = [];
let status = 201;
global.fetch = async (url, options) => {
  calls.push({ url: String(url), headers: new Headers(options.headers), body: JSON.parse(options.body) });
  return new Response(JSON.stringify(status >= 400 ? { code: 'fixture_error', message: 'Fixture failure' } : { id: 123, messageId: 'fixture-message', contacts: { success: ['buyer@example.com'], failure: [] } }), { status, headers: { 'content-type': 'application/json' } });
};
const brevo = require('../src/lib/brevo');

test('updated Brevo SDK preserves contact/list requests, email payloads and failure monitoring', async () => {
  try {
    await brevo.upsertContact('buyer@example.com', { PURCHASED: true }, [2]);
    assert.deepEqual(calls.at(-1).body, { email: 'buyer@example.com', updateEnabled: true, attributes: { PURCHASED: true }, listIds: [2] });
    await brevo.addContactToList('buyer@example.com', 2);
    assert.equal(calls.at(-1).url, 'https://api.brevo.com/v3/contacts/lists/2/contacts/add');
    assert.deepEqual(calls.at(-1).body, { emails: ['buyer@example.com'] });
    await brevo.removeContactFromList('buyer@example.com', 2);
    assert.equal(calls.at(-1).url, 'https://api.brevo.com/v3/contacts/lists/2/contacts/remove');
    const to = { email: 'buyer@example.com', name: 'Buyer' };
    assert.equal(await brevo.sendEmail(to, 'Receipt', '<p>Paid</p>'), true);
    assert.deepEqual(calls.at(-1).body, { to: [to], subject: 'Receipt', htmlContent: '<p>Paid</p>', sender: { email: 'sender@example.com', name: 'Fixture' } });
    await brevo.sendTemplateEmail(to, 7, { ORDER: 'order-fixture' });
    assert.deepEqual(calls.at(-1).body, { to: [to], templateId: 7, params: { ORDER: 'order-fixture' } });
    const attachment = [{ name: 'invoice.pdf', content: Buffer.from('%PDF fixture').toString('base64') }];
    await brevo.sendEmailWithAttachments(to, 'Invoice', '<p>Invoice</p>', attachment);
    assert.deepEqual(calls.at(-1).body.attachment, attachment);
    for (const call of calls) assert.equal(call.headers.get('api-key'), 'fixture-api-key');
    const before = calls.length;
    status = 503;
    assert.equal(await brevo.sendEmail(to, 'Receipt', '<p>Paid</p>'), false);
    assert.equal(calls.length, before + 1, 'SDK must not retry and duplicate email sends');
    assert.equal(failures, 1);
    status = 409;
    await brevo.upsertContact('buyer@example.com');
    assert.equal(failures, 1, 'existing contacts do not trigger delivery alerts');
  } finally { global.fetch = originalFetch; }
});

test('updated Nodemailer builds OTP/reset-style emails with no external transport', async () => {
  const mailer = require('nodemailer');
  const transport = mailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const result = await transport.sendMail({ from: 'sender@example.com', to: 'buyer@example.com', subject: 'Verification code', html: '<p>123456</p>' });
  assert.deepEqual(result.envelope.to, ['buyer@example.com']);
  assert.match(result.message.toString(), /Subject: Verification code/);
  assert.match(result.message.toString(), /123456/);
  transport.close();
});
