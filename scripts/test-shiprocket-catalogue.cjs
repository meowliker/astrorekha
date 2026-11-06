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
const { toShiprocketCatalogue } = require('../src/lib/shiprocket-catalogue/partner-format');
const pricingUpdatedAt = '2026-11-05T12:00:00.000Z';
const fixtureKey = 'fixture-key-012345678901234567890123456789';
let databaseFailure, reads;
const query = {
  select(fields) { assert.equal(fields, 'value,updated_at'); return query; },
  eq(key, value) { assert.equal(key, 'key'); assert.equal(value, 'pricing'); return query; },
  async maybeSingle() { return databaseFailure ? { error: { message: 'private DB diagnostic' }, data: null } : { data: { value: DEFAULT_PRICING, updated_at: pricingUpdatedAt }, error: null }; },
};
const admin = require.resolve('../src/lib/supabase-admin');
require.cache[admin] = { id: admin, filename: admin, loaded: true, exports: { getSupabaseAdmin: () => ({ from(table) { assert.equal(table, 'settings'); reads++; return query; } }) } };
const base = '../src/app/api/integrations/shiprocket/v1/';
const routes = Object.fromEntries(['products', 'collections', 'catalogue', 'products/[id]'].map(name => [name, require(base + name + '/route')]));
const feeds = Object.fromEntries(['products', 'collections', 'catalogue'].map(name => [
  name, require('../src/app/api/integrations/shiprocket/v2/' + name + '/route'),
]));
function request(queryString = '', key = fixtureKey) {
  return new NextRequest('http://localhost/api/integrations/shiprocket/v1/products' + queryString, { headers: key ? { authorization: 'Bearer ' + key } : {} });
}
beforeEach(() => {
  process.env.SHIPROCKET_CATALOG_ENABLED = 'true';
  process.env.SHIPROCKET_CATALOG_API_KEY = fixtureKey;
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
  process.env.SHIPROCKET_CATALOG_API_KEY = fixtureKey;
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

test('Shiprocket feeds paginate collections and products using the documented response envelope', async () => {
  const response = await feeds.collections.GET(request('?page=1&limit=1'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const first = await response.json();
  assert.deepEqual(Object.keys(first), ['data']);
  assert.deepEqual(Object.keys(first.data), ['total', 'collections']);
  const { collections, total } = first.data;
  assert.equal(total, 5);
  assert.equal(collections.length, 1);
  const [bundleCollection] = collections;
  assert.equal(bundleCollection.handle, 'bundles');
  assert.equal(bundleCollection.updated_at, pricingUpdatedAt);

  const all = (await (await feeds.products.GET(request())).json()).data;
  assert.equal(all.total, all.products.length);
  const filter = `?collection_id=${bundleCollection.id}`;
  const bundles = (await (await feeds.catalogue.GET(request(filter))).json()).data;
  assert.equal(bundles.total, all.products.filter(product => product.variants[0].sku.startsWith('bundle:')).length);
  const secondPage = (await (await feeds.catalogue.GET(request(filter + '&page=2&limit=1'))).json()).data;
  assert.equal(secondPage.total, bundles.total);
  assert.deepEqual(secondPage.products, bundles.products.slice(1, 2));
  const emptyPage = (await (await feeds.catalogue.GET(request(filter + '&page=100'))).json()).data;
  assert.deepEqual(emptyPage, { total: bundles.total, products: [] });

  const ids = [...collections.map(collection => collection.id), ...all.products.flatMap(product => [product.id, product.variants[0].id])];
  assert.ok(ids.every(id => Number.isSafeInteger(id) && id > 0));
  assert.equal(new Set(ids).size, ids.length);
  const palm = bundles.products.find(product => product.variants[0].sku === 'bundle:palm-reading');
  assert.deepEqual(palm, all.products.find(product => product.id === palm.id));
  assert.equal(palm.variants[0].price, '659.62');
  assert.equal(palm.variants[0].grams, 0);
  assert.equal(palm.status, 'active');
  assert.equal(new URL(palm.image.src).origin, 'https://astrorekha.com');
  assert.equal(palm.selection, undefined);
});

test('Shiprocket IDs survive price and title edits and every variant uses the checkout total', () => {
  const pricing = normalizePricing(DEFAULT_PRICING);
  const source = buildCatalogue(pricing);
  const feed = toShiprocketCatalogue(source, pricingUpdatedAt);
  for (const { item } of feed.products) {
    const variant = item.variants[0];
    const product = source.products.find(product => product.id === variant.sku);
    assert.equal(Math.round(Number(variant.price) * 100), quotePaymentOrder(pricing, product.selection).amount);
  }
  const edited = structuredClone(source);
  edited.products[0].name = 'Updated title';
  edited.products[0].description = '<script> & content';
  edited.products[0].price.payable_minor += 100;
  const updated = toShiprocketCatalogue(edited, pricingUpdatedAt).products[0].item;
  const initial = feed.products[0].item;
  assert.equal(updated.id, initial.id);
  assert.equal(updated.handle, initial.handle);
  assert.equal(updated.variants[0].id, initial.variants[0].id);
  assert.notEqual(updated.variants[0].price, initial.variants[0].price);
  assert.equal(updated.body_html, '<p>&lt;script&gt; &amp; content</p>');
});

test('Shiprocket feeds reject unauthenticated requests, malformed queries and unavailable pricing', async () => {
  for (const route of Object.values(feeds)) {
    assert.equal((await route.GET(request('', null))).status, 401);
  }
  for (const queryString of ['', '?collection_id=bundles', '?collection_id=1&page=0', '?collection_id=1&limit=101']) {
    assert.equal((await feeds.catalogue.GET(request(queryString))).status, 400);
  }
  assert.equal(reads, 0);
  assert.equal((await feeds.catalogue.GET(request('?collection_id=1'))).status, 400);
  databaseFailure = true;
  assert.equal((await feeds.products.GET(request())).status, 503);
  process.env.SHIPROCKET_CATALOG_ENABLED = 'false';
  assert.equal((await feeds.products.GET(request())).status, 404);
});

test('all v2 feeds accept a raw X-Api-Key and reject an invalid key before reading pricing', async () => {
  const { collections } = toShiprocketCatalogue(buildCatalogue(normalizePricing(DEFAULT_PRICING)), pricingUpdatedAt);
  for (const [name, route] of Object.entries(feeds)) {
    const params = name === 'catalogue' ? `?collection_id=${collections[0].id}` : '';
    const url = `http://localhost/api/integrations/shiprocket/v2/${name}${params}`;
    const valid = new NextRequest(url, { headers: { 'X-Api-Key': fixtureKey } });
    assert.equal((await route.GET(valid)).status, 200);

    const readsBefore = reads;
    for (const key of ['', 'incorrect', `Bearer ${fixtureKey}`]) {
      const invalid = new NextRequest(url, { headers: { 'X-Api-Key': key, Authorization: `Bearer ${fixtureKey}` } });
      assert.equal((await route.GET(invalid)).status, 401);
    }
    assert.equal(reads, readsBefore);
  }

  const v1 = new NextRequest('http://localhost/api/integrations/shiprocket/v1/products', {
    headers: { 'X-Api-Key': fixtureKey },
  });
  assert.equal((await routes.products.GET(v1)).status, 401);
});
