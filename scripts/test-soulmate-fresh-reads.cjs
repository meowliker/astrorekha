const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { getSupabaseAdmin } = require('../src/lib/supabase-admin');
const { soulmateAdmin } = require('../src/lib/soulmate-admin');

test('Soulmate admin bypasses stale fetch responses for sessions, orders, and saved profit rows', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key';
  let orders = [{ id: 'first' }], sessionActive = true;
  const calls = [];
  global.fetch = async (input, init) => {
    const table = new URL(input).pathname.split('/').pop();
    calls.push({ table, cache: init.cache });
    const fresh = init.cache === 'no-store';
    if (table === 'admin_sessions') return Response.json(sessionActive || !fresh ? { id: 'fixture', expires_at: '2099-01-01' } : null);
    if (table === 'soulmate_profit_sheet') return Response.json([{ date: '2026-10-16', data: { orders: fresh ? orders.length : 1 } }]);
    return Response.json(fresh ? orders : [{ id: 'first' }]);
  };
  try {
    const request = new Request('http://localhost', { headers: { authorization: 'Bearer fixture' } });
    const db = await soulmateAdmin(request);
    assert.ok(db);
    assert.equal((await db.from('soulmate_orders').select('id')).data.length, 1);
    orders = [{ id: 'first' }, { id: 'new-order' }];
    assert.equal((await db.from('soulmate_orders').select('id')).data.length, 2);
    assert.equal((await db.from('soulmate_profit_sheet').select('*')).data[0].data.orders, 2);
    sessionActive = false;
    assert.equal(await soulmateAdmin(request), null);
    assert.ok(calls.every(call => call.cache === 'no-store'));
    await getSupabaseAdmin().from('unrelated_main_flow').select('id');
    assert.equal(calls.at(-1).cache, undefined, 'Main-flow client behavior stays unchanged');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
