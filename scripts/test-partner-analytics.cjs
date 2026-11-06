/* eslint-disable @typescript-eslint/no-require-imports -- Route integration test loads TypeScript and a disposable SQL database. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  const target = name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name;
  return resolve.call(this, target, parent, ...rest);
};
const { NextRequest } = require('next/server');
const { analyticsDate, analyticsPresets, previousAnalyticsRange, validAnalyticsRange } = require('../src/lib/partner-analytics-period');

test('analytics ranges follow the property calendar and compare inclusive dates', () => {
  const today = analyticsDate(new Date('2026-11-02T02:00:00Z'), 'America/Chicago');
  assert.equal(today, '2026-11-01');
  const presets = Object.fromEntries(analyticsPresets(today).map(({ label, range }) => [label, range]));
  assert.deepEqual(presets['Last 7 days'], { start: '2026-10-25', end: '2026-10-31' });
  assert.deepEqual(presets['Last month'], { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(presets['Last quarter'], { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(previousAnalyticsRange({ start: '2026-11-01', end: '2026-11-02' }), { start: '2026-10-30', end: '2026-10-31' });
  assert.ok(validAnalyticsRange({ start: '2024-01-01', end: '2024-12-31' }, today));
  assert.ok(!validAnalyticsRange({ start: '2024-01-01', end: '2025-01-01' }, today));
  assert.ok(!validAnalyticsRange({ start: '2026-02-30', end: '2026-03-01' }, today));
  assert.ok(!validAnalyticsRange({ start: today, end: '2026-11-02' }, today));
});

// Keep route authentication and authorization real. Adapt only the PostgREST transport.
function adapter(sql) {
  return {
    from(table) {
      let selected = '*', operation = 'select', record = {}, sorting = '';
      const predicates = [];
      const query = {
        select(fields) { selected = fields; return this; },
        insert(data) { operation = 'insert'; record = data; return this; },
        update(data) { operation = 'update'; record = data; return this; },
        delete() { operation = 'delete'; return this; },
        eq(key, value) { predicates.push([key, '=', value]); return this; },
        gt(key, value) { predicates.push([key, '>', value]); return this; },
        lt(key, value) { predicates.push([key, '<', value]); return this; },
        order(key, { ascending }) { sorting = ` order by ${key} ${ascending ? 'asc' : 'desc'}`; return this; },
        async run(single) {
          const params = [];
          const param = value => '$' + params.push(value);
          let statement = `select ${selected} from ${table}`;
          if (operation === 'insert') {
            statement = `insert into ${table} (${Object.keys(record).join(',')}) values (${Object.values(record).map(param).join(',')})`;
          }
          if (operation === 'update') statement = `update ${table} set ${Object.entries(record).map(([key, value]) => key + '=' + param(value)).join(',')}`;
          if (operation === 'delete') statement = `delete from ${table}`;
          if (predicates.length) statement += ' where ' + predicates.map(([key, operator, value]) => key + operator + param(value)).join(' and ');
          if (operation === 'select') statement += sorting;
          else statement += ' returning ' + selected;
          try {
            const { rows } = await sql.query(statement, params);
            return { data: single ? rows[0] || null : rows, error: null };
          } catch (error) { return { data: null, error }; }
        },
        maybeSingle() { return this.run(true); },
        single() { return this.run(true); },
        then(accept, reject) { return this.run(false).then(accept, reject); },
      };
      return query;
    },
    rpc(name, args) {
      if (name === 'read_partner_live_traffic') {
        return { async abortSignal() {
          const { rows } = await sql.query('select * from read_partner_live_traffic($1,$2)', [args.p_time_zone, args.p_checked_at]);
          return { data: rows, error: null };
        } };
      }
      assert.equal(name, 'allow_partner_analytics_login');
      return sql.query('select allow_partner_analytics_login($1,$2) as allowed', [args.p_key, args.p_limit])
        .then(({ rows }) => ({ data: rows[0].allowed, error: null }));
    },
  };
}

test('viewer accounts are isolated from admin and server permissions govern each report', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table admin_sessions (id text primary key, expires_at timestamptz not null);
      insert into admin_sessions values ('admin-fixture', now() + interval '1 day');
      create table marketing_events (created_at timestamptz, event_name text, path text, route text, url text, utm_source text);
      create table us_soulmate_marketing_events (like marketing_events);
      grant select on marketing_events, us_soulmate_marketing_events to service_role;
      insert into marketing_events values
        (now(), 'page_view', '/', null, 'https://astrorekha.com/?utm_source=facebook&utm_medium=paid', 'facebook'),
        (now(), 'page_view', '/discover', null, 'https://astrorekha.com/discover?fbclid=organic', null),
        (now(), 'page_view', '/admin', null, null, null),
        (now(), 'page_view', '/', null, 'https://astrorekha.com/?utm_source=codex_qa&gclid=test', 'codex_qa'),
        (now(), 'soulmate_landing_view', '/soulmate', null, null, null),
        ('2026-11-01 05:55:00Z', 'page_view', '/', null, 'https://astrorekha.com/', null),
        ('2026-11-01 04:59:59Z', 'page_view', '/', null, 'https://astrorekha.com/', null),
        ('2026-11-01 05:00:00Z', 'page_view', '/', null, 'https://astrorekha.com/?gclid=ad', null),
        ('2026-11-01 18:29:59Z', 'page_view', '/', null, 'https://astrorekha.com/', null),
        ('2026-11-01 18:30:00Z', 'page_view', '/', null, 'https://astrorekha.com/', null);
      insert into us_soulmate_marketing_events values
        (now(), 'us_soulmate_landing_view', '/us/soulmate', null, 'https://astrorekha.com/us/soulmate?gclid=ad', null);
    `);
    await db.exec(readFileSync(path.join(__dirname, '../supabase/migrations/20261106140000_partner_analytics.sql'), 'utf8'));
    await db.exec(readFileSync(path.join(__dirname, '../supabase/migrations/20261106150000_partner_live_traffic.sql'), 'utf8'));
    await db.exec('set role service_role');
    const { rows: boundary } = await db.query("select * from read_partner_live_traffic('America/Chicago','2026-11-01 05:20:00Z') order by channel");
    assert.deepEqual(boundary.map(row => [row.channel, Number(row.today_views), Number(row.recent_views)]), [
      ['google', 1, 1], ['other', 0, 1],
    ]);
    const { rows: indiaBoundary } = await db.query("select * from read_partner_live_traffic('Asia/Kolkata','2026-11-01 18:35:00Z')");
    assert.deepEqual(indiaBoundary.map(row => [row.channel, Number(row.today_views), Number(row.recent_views)]), [['other', 1, 2]]);
    await db.exec('reset role');
    const supabase = require.resolve('../src/lib/supabase-admin');
    require.cache[supabase] = { id: supabase, filename: supabase, loaded: true, exports: { getSupabaseAdmin: () => adapter(db) } };
    const reportModule = require.resolve('../src/lib/partner-analytics-report');
    let queryCount = 0, beforeReply = async () => {};
    require.cache[reportModule] = { id: reportModule, filename: reportModule, loaded: true, exports: {
      readPartnerAnalytics: async (permissions, range) => {
        queryCount++;
        const values = Object.fromEntries(['traffic', 'purchases', 'revenue'].filter(key => permissions[key]).map(key => [key, 10]));
        await beforeReply();
        return { range, metrics: Object.keys(values), comparison: [{ label: 'Google Ads', values }],
          channels: permissions.channels ? [{ label: 'Paid Search', values }] : [] };
      },
    } };
    const admin = require('../src/app/api/admin/analytics-access/route');
    const portal = require('../src/app/api/partner-analytics/route');
    const origin = 'https://astrorekha.example';
    const viewerPath = '/api/partner-analytics';
    const adminPath = '/api/admin/analytics-access';
    const makeRequest = (pathname, body, headers = {}) => new NextRequest(origin + pathname, {
      ...(body && { method: 'POST', body: JSON.stringify(body) }),
      headers: { origin, 'content-type': 'application/json', ...headers },
    });
    const adminHeaders = { authorization: 'Bearer admin-fixture' };
    const modify = data => admin.POST(makeRequest(adminPath, data, adminHeaders));
    const create = { action: 'create', email: 'Agency@example.invalid', label: 'Ads team', traffic: true };
    assert.equal((await portal.GET(makeRequest(viewerPath))).status, 401);
    assert.equal(queryCount, 0);
    assert.equal((await admin.POST(makeRequest(adminPath, create))).status, 401);
    assert.equal((await admin.POST(makeRequest(adminPath, create, { ...adminHeaders, origin: 'https://unrelated.example' }))).status, 403);
    const created = await modify(create);
    assert.equal(created.status, 201);
    const { viewer, password } = await created.json();
    assert.equal(viewer.email, 'agency@example.invalid');
    assert.equal(viewer.revenue, false);
    assert.equal((await modify(create)).status, 409);
    const list = await (await admin.GET(makeRequest(adminPath, null, adminHeaders))).text();
    assert.doesNotMatch(list, /password/);
    assert.equal(list.includes(password), false);
    const login = pass => portal.POST(makeRequest(viewerPath, { action: 'login', email: viewer.email, password: pass }));
    const loggedIn = await login(password);
    assert.equal(loggedIn.status, 200);
    const setCookie = loggedIn.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /Path=\/api\/partner-analytics/i);
    const cookie = setCookie.split(';')[0];
    const view = () => portal.GET(makeRequest(viewerPath + '?days=7&revenue=true', null, { cookie }));
    const data = await view();
    assert.match(data.headers.get('cache-control'), /no-store/);
    assert.deepEqual((await data.json()).report.metrics, ['traffic']);
    const custom = params => portal.GET(makeRequest(viewerPath + '?' + params, null, { cookie }));
    assert.equal((await portal.GET(makeRequest(viewerPath + '?view=live'))).status, 401);
    const limitedLive = await custom('view=live');
    assert.match(limitedLive.headers.get('cache-control'), /no-store/);
    const { live } = await limitedLive.json();
    assert.equal(live.total.recent, 3);
    assert.deepEqual(live.channels, []);
    const india = (await (await custom('view=live&clock=india')).json()).live;
    assert.equal(india.timeZone, 'Asia/Kolkata');
    assert.equal(india.date, analyticsDate(new Date(india.checkedAt), india.timeZone));
    assert.equal(india.total.recent, 3);
    assert.equal((await custom('view=live&clock=invalid')).status, 400);
    const requestedRange = { start: '2026-09-03', end: '2026-10-11' };
    const selected = await custom(new URLSearchParams(requestedRange));
    assert.equal(selected.status, 200);
    const selectedBody = await selected.json();
    assert.deepEqual(selectedBody.calendar.range, requestedRange);
    assert.deepEqual(selectedBody.report.range, requestedRange);
    const beforeInvalid = queryCount;
    for (const params of ['start=2026-09-01', 'start=2026-09-01&end=2026-09-15&days=7', 'start=2026-09-31&end=2026-10-15', 'start=2024-01-01&end=2025-01-01']) {
      assert.equal((await custom(params)).status, 400);
    }
    assert.equal(queryCount, beforeInvalid);
    const unauthorized = await admin.GET(makeRequest(adminPath, null, { cookie, authorization: 'Bearer ' + cookie.split('=')[1] }));
    assert.equal(unauthorized.status, 401);
    const update = { action: 'update', id: viewer.id, active: true, traffic: true, purchases: true, revenue: false, channels: true };
    assert.equal((await modify(update)).status, 200);
    const expanded = (await (await view()).json()).report;
    assert.deepEqual(expanded.metrics, ['traffic', 'purchases']);
    assert.equal(expanded.channels.length, 1);
    assert.equal('revenue' in expanded.channels[0].values, false);

    const expandedLive = (await (await custom('view=live')).json()).live;
    assert.deepEqual(expandedLive.channels.map(row => [row.label, row.recent]), [
      ['Google Ads', 1], ['Meta Ads', 1], ['Other or untagged', 1],
    ]);
    assert.equal((await modify({ ...update, traffic: false })).status, 200);
    assert.deepEqual(await (await custom('view=live')).json(), { live: null });
    assert.equal((await modify(update)).status, 200);

    beforeReply = async () => { await modify({ ...update, purchases: false, channels: false }); };
    const stale = await view();
    assert.equal(stale.status, 409);
    assert.equal('report' in await stale.json(), false);
    beforeReply = async () => {};
    const reset = await (await modify({ action: 'reset', id: viewer.id })).json();
    assert.equal((await view()).status, 401);
    assert.equal((await login(password)).status, 401);
    const renewed = await login(reset.password);
    assert.equal(renewed.status, 200);
    await modify({ ...update, active: false });
    const renewedCookie = renewed.headers.get('set-cookie').split(';')[0];
    assert.equal((await portal.GET(makeRequest(viewerPath, null, { cookie: renewedCookie }))).status, 401);
    assert.equal((await login(reset.password)).status, 401);
    for (let i = 0; i < 4; i++) assert.equal((await login('a'.repeat(32))).status, 401);
    assert.equal((await login('a'.repeat(32))).status, 429);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from partner_analytics_viewers'), /permission denied/);
    await assert.rejects(db.query("select allow_partner_analytics_login('test',1)"), /permission denied/);
    await assert.rejects(db.query("select * from read_partner_live_traffic('America/Chicago', now())"), /permission denied/);
  } finally { await db.close(); }
});
