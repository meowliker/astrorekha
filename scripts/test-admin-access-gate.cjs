/* eslint-disable @typescript-eslint/no-require-imports */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, ...args);
};
require('ts-node').register({transpileOnly: true, compilerOptions: {module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx'}});
const React = require('react');
const {create, act} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
let currentPath = '/admin/orders';
const redirects = [];
const router = {replace: value => redirects.push(value)};
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  return name === 'next/navigation' ? {usePathname: () => currentPath, useRouter: () => router} : originalLoad.call(this, name, ...args);
};
const Gate = require('../src/components/admin/AdminAccessGate').default;
Module._load = originalLoad;
const token = 'a'.repeat(64);
const member = {id: 'Staff', name: 'Staff', isAdministrator: false, workspaces: ['astrorekha']};
const response = (status, data = member) => ({status, ok: status === 200, json: async () => data});

function setup(t, fetcher, {expiry = new Date(Date.now() + 3600000).toISOString(), savedToken = token} = {}) {
  currentPath = '/admin/orders';
  redirects.length = 0;
  const saved = new Map([['admin_session_token', savedToken], ['admin_session_expiry', expiry]]);
  const storage = {getItem: key => saved.get(key) ?? null, removeItem: key => saved.delete(key)};
  const events = new EventTarget();
  const descriptors = ['localStorage', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]);
  Object.defineProperty(global, 'localStorage', {value: storage, configurable: true});
  Object.defineProperty(global, 'window', {value: events, configurable: true});
  t.mock.method(global, 'fetch', fetcher);
  let tree;
  const render = () => React.createElement(Gate, null, React.createElement('div', null, 'Protected content'));
  t.after(async () => {
    if (tree) await act(async () => tree.unmount());
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
  });
  return {
    saved, events,
    async mount() { await act(async () => { tree = create(render()); }); },
    async navigate(p) { currentPath = p; await act(async () => tree.update(render())); },
    text() { return JSON.stringify(tree.toJSON()); },
    async retry() { await act(async () => tree.root.findByType('button').props.onClick()); },
    async unmount() { await act(async () => tree.unmount()); tree = null; },
  };
}

test('expired saved session redirects immediately without a network round trip', async t => {
  let requests = 0;
  const app = setup(t, async () => { requests++; return response(200); }, {expiry: '2020-01-01T00:00:00Z'});
  await app.mount();
  assert.equal(requests, 0);
  assert.deepEqual(redirects, ['/admin/login']);
  assert.equal(app.saved.has('admin_session_token'), false);
});

test('navigation reuses verified access but still blocks unassigned workspaces', async t => {
  let requests = 0;
  const app = setup(t, async () => { requests++; return response(200); });
  await app.mount();
  assert.match(app.text(), /Protected content/);
  await app.navigate('/admin/revenue');
  assert.match(app.text(), /Protected content/);
  assert.equal(requests, 1);
  await app.navigate('/admin/us-main/orders');
  assert.match(app.text(), /do not have access/);
  assert.doesNotMatch(app.text(), /Protected content/);
  assert.equal(requests, 1);
});

test('slow request ends after eight seconds with retry, never logs out on a timeout', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let requests = 0;
  const app = setup(t, async (_url, {signal}) => {
    if (++requests > 1) return response(200);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  await app.mount();
  assert.match(app.text(), /Checking workspace access/);
  await act(async () => t.mock.timers.tick(8000));
  assert.match(app.text(), /Try again/);
  assert.doesNotMatch(app.text(), /Checking workspace access/);
  assert.equal(app.saved.get('admin_session_token'), token);
  assert.equal(redirects.length, 0);
  await app.retry();
  assert.match(app.text(), /Protected content/);
});

test('periodic verification revokes visible access and does not overlap requests', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let requests = 0;
  let finish;
  const app = setup(t, async () => ++requests === 1 ? response(200) : new Promise(resolve => { finish = resolve; }));
  await app.mount();
  await act(async () => t.mock.timers.tick(30000));
  assert.equal(requests, 2);
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(requests, 2);
  await act(async () => finish(response(401, {error: 'Sign in to admin'})));
  assert.deepEqual(redirects, ['/admin/login']);
  assert.doesNotMatch(app.text(), /Protected content/);
});

test('a late 401 from an abandoned request cannot redirect a new login', async t => {
  let finish;
  const app = setup(t, () => new Promise(resolve => { finish = resolve; }));
  await app.mount();
  await app.navigate('/admin/login');
  await act(async () => finish(response(401, {})));
  assert.equal(redirects.length, 0);
  assert.equal(app.saved.get('admin_session_token'), token);
});

test('server outages show retry without removing the session', async t => {
  const app = setup(t, async () => response(503, {error: 'Access service unavailable'}));
  await app.mount();
  assert.match(app.text(), /Try again/);
  assert.equal(redirects.length, 0);
  assert.equal(app.saved.get('admin_session_token'), token);
});

test('cross-tab logout immediately hides protected data and redirects', async t => {
  const app = setup(t, async () => response(200));
  await app.mount();
  app.saved.delete('admin_session_token');
  const event = new Event('storage');
  event.key = 'admin_session_token';
  await act(async () => app.events.dispatchEvent(event));
  assert.doesNotMatch(app.text(), /Protected content/);
  assert.deepEqual(redirects, ['/admin/login']);
});

test('idle transient failures retain verified content and recover without remounting', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let count = 0;
  const app = setup(t, async () => ++count === 2 ? response(503, {}) : response(200));
  await app.mount();
  await act(async () => t.mock.timers.tick(30000));
  assert.match(app.text(), /Protected content/);
  assert.doesNotMatch(app.text(), /Try again/);
  assert.equal(app.saved.get('admin_session_token'), token);
  await act(async () => t.mock.timers.tick(30000));
  assert.equal(count, 3);
  assert.match(app.text(), /Protected content/);
  assert.equal(redirects.length, 0);
});
