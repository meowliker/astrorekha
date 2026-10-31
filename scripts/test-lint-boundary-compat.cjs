// Keep provider payloads and error responses compatible while tightening their types.
// Functions are loaded in isolation: no provider, database or analytics requests.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadFunction(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} exists in ${file}`);
  const js = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${js}\n${name}`, { exports: {}, Error });
}

test('SDK errors retain their message and code, malformed throws retain fallback behavior', () => {
  const message = loadFunction('src/lib/error-message.ts', 'getErrorMessage');
  const code = loadFunction('src/lib/error-message.ts', 'getErrorCode');
  for (const error of [new Error('Provider unavailable'), { message: 'Provider unavailable', code: 503 }]) {
    assert.equal(message(error), 'Provider unavailable');
  }
  assert.equal(code({ code: 503 }), 503);
  assert.equal(code({ code: 'PGRST116' }), 'PGRST116');
  for (const error of [null, undefined, 'rejected', 0, { message: {}, code: {} }]) {
    assert.equal(message(error) || 'fallback', 'fallback');
    assert.equal(code(error), undefined);
  }
});

test('chat accepts legacy string signs, structured signs and incomplete chart data', () => {
  const context = loadFunction('src/app/api/chat/route.ts', 'buildUserContext');
  const output = context(null, { chart: { houses: {
    1: { sign: 'Aries' }, 2: { sign: { formatted: 'Taurus' } },
    3: { sign: null }, 4: {},
  } } });
  assert.match(output, /House 1: Aries/);
  assert.match(output, /House 2: Taurus/);
  assert.match(output, /House 3: unknown/);
  assert.match(output, /House 4: unknown/);
  assert.doesNotThrow(() => context(null, null));
});

for (const [file, name] of [
  ['src/lib/birth-chart-report-generator.ts', 'getAnthropicText'],
  ['src/lib/future-partner-report.ts', 'extractText'],
]) {
  test(`${name} ignores non-text provider blocks and preserves report text`, () => {
    const extract = loadFunction(file, name);
    assert.equal(extract({ content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: '  report  ' }] }), 'report');
    assert.equal(extract({ content: [{ type: 'tool_use' }] }), '');
    assert.equal(extract({ content: [] }), '');
  });
}

test('sketch responses keep accepting each supported provider image shape', () => {
  const extract = loadFunction('src/lib/soulmate-sketch.ts', 'extractImageUrl');
  const url = 'https://example.invalid/sketch.png';
  for (const payload of [
    { image_url: url }, { resultJson: JSON.stringify({ resultUrls: [url] }) },
    { data: { resultJson: JSON.stringify({ resultUrls: [url] }) } },
    { data: { resultUrls: [url] } }, { data: [{ url }] },
  ]) assert.equal(extract(payload), url);
  assert.equal(extract(null), null);
  assert.equal(extract({ data: { resultJson: 'invalid JSON' } }), null);
});
