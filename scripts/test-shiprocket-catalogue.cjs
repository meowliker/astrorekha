/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route tests stub the database boundary. */
const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', jsx: 'react-jsx' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, ...rest);
};
const { NextRequest } = require('next/server');
const { DEFAULT_PRICING, normalizePricing } = require('../src/lib/pricing');
const { quotePaymentOrder } = require('../src/lib/payment-quote');
const { buildCatalogue } = require('../src/lib/shiprocket-catalogue/catalogue');
let databaseFailure, reads;
const query = {
  select(fields) { assert.equal(fields, 'value'); return query; },
  eq(key, value) { assert.equal(key, 'key'); assert.equal(value, 'pricing'); return query; },
  async maybeSingle() { return databaseFailure ? { error: { message: 'private DB diagnostic' }, data: null } : { data: { value: DEFAULT_PRICING }, error: null }; },
};
const admin = require.resolve('../src/lib/supabase-admin');
require.cache[admin] = { id: admin, filename: admin, loaded: true, exports: { getSupabaseAdmin: () => ({ from(table) { assert.equal(table, 'settings'); reads++; return query; } }) } };
const base = '../src/app/api/integrations/shiprocket/v1/';
const routes = Object.fromEntries(['products', 'collections', 'catalogue', 'products/[id]'].map(name => [name, require(base + name + '/route')]));
function request(queryString = '', key = 'fixture-key-012345678901234567890123456789') {
  return new NextRequest('http://localhost/api/integrations/shiprocket/v1/products' + queryString, { headers: key ? { authorization: 'Bearer ' + key } : {} });
}
beforeEach(() => {
  process.env.SHIPROCKET_CATALOG_ENABLED = 'true';
  process.env.SHIPROCKET_CATALOG_API_KEY = 'fixture-key-012345678901234567890123456789';
  databaseFailure = false; reads = 0;
});
test('every exposed product matches its existing checkout quote and has a unique ID', () => {
  const pricing = normalizePricing(DEFAULT_PRICING);
  const catalog = buildCatalogue(pricing);
  assert.equal(new Set(catalog.products.map(product => product.id)).size, catalog.products.length);
  for (const product of catalog.products) {
    const quote = quotePaymentOrder(pricing, product.selection);
    assert.equal(product.price.payable_minor, quote.amount);
    assert.equal(product.price.gst_minor, quote.gstAmount);
    assert.equal(product.requires_shipping, false);
  }
  assert.equal(catalog.products.find(product => product.id === 'bundle:palm-reading').price.payable_minor, 65962);
  const combo = catalog.products.find(product => product.id === 'soulmate:standard+description+colour+priority');
  assert.ok(combo);
  assert.equal(combo.price.payable_minor, quotePaymentOrder(pricing, combo.selection).amount);
});
test('hidden standalone reports and inactive offers are excluded while existing bundles retain their contents', () => {
  const catalog = buildCatalogue(normalizePricing(DEFAULT_PRICING));
  const hidden = ['pastLifeReport', 'futurePartnerReport', 'prediction2026', 'vastuShastraGuide'];
  assert.ok(catalog.products.filter(product => ['report', 'upsell'].includes(product.selection.type)).every(product => !product.includes.features.some(feature => hidden.includes(feature))));
  assert.ok(!catalog.products.some(product => product.id === 'bundle:palm-birth-compat'));
  assert.ok(catalog.products.find(product => product.id === 'bundle:palm-birth-sketch').includes.features.includes('futurePartnerReport'));
});
test('disabled switch, missing configuration and invalid credentials fail before DB access', async () => {
  delete process.env.SHIPROCKET_CATALOG_ENABLED;
  assert.equal((await routes.products.GET(request())).status, 404);
  process.env.SHIPROCKET_CATALOG_ENABLED = 'true';
  delete process.env.SHIPROCKET_CATALOG_API_KEY;
  assert.equal((await routes.products.GET(request())).status, 503);
  process.env.SHIPROCKET_CATALOG_API_KEY = 'fixture-key-012345678901234567890123456789';
  assert.equal((await routes.products.GET(request('', null))).status, 401);
  assert.equal(reads, 0);
});
test('normal GET routes support pagination, collection filtering and namespaced product lookup', async () => {
  const response = await routes.products.GET(request('?collection=bundles&limit=1&page=2'));
  const page = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(page.products.length, 1);
  assert.equal(page.products[0].collection_id, 'bundles');
  const detail = await routes['products/[id]'].GET(request(), { params: Promise.resolve({ id: page.products[0].id }) });
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).product, page.products[0]);
  assert.ok((await (await routes.collections.GET(request())).json()).collections.length);
  assert.ok((await (await routes.catalogue.GET(request('?q=palm'))).json()).products.every(product => product.name.toLowerCase().includes('palm')));
});
test('invalid filters, unknown products and DB failures return bounded public errors', async () => {
  for (const queryString of ['?page=0', '?limit=101', '?collection=unknown', '?q=' + 'x'.repeat(201)]) {
    assert.equal((await routes.products.GET(request(queryString))).status, 400);
  }
  assert.equal((await routes['products/[id]'].GET(request(), { params: Promise.resolve({ id: 'report:future-partner-report' }) })).status, 404);
  databaseFailure = true;
  const response = await routes.catalogue.GET(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'Current catalogue unavailable');
});
