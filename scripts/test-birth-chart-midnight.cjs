const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
process.env.PROKERALA_CLIENT_ID = 'fixture-client'; process.env.PROKERALA_CLIENT_SECRET = 'fixture-secret';
const { NextRequest } = require('next/server');
const { POST } = require('../src/app/api/astrology/birth-chart/route');
test('midnight, noon and late-night birth times reach every provider request without a twelve-hour shift', async () => {
  const original = global.fetch; const urls = [];
  global.fetch = async value => {
    const url = new URL(value);
    assert.equal(url.origin, 'https://api.prokerala.com');
    if (url.pathname === '/token') return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    urls.push(url);
    if (url.pathname.endsWith('/chart')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { headers: { 'content-type': 'image/svg+xml' } });
    return Response.json({ data: { nakshatra_details: {}, planet_position: [{ name: 'Ascendant', rasi: { name: 'Cancer' } }] } });
  };
  try {
    for (const time of ['00:00', '00:30', '12:00', '12:30', '23:59']) {
      urls.length = 0;
      const result = await POST(new NextRequest('http://localhost/api/astrology/birth-chart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ birthDate: '1990-06-28', birthTime: time, latitude: 21.25, longitude: 81.63, timezone: 5.5, chartType: 'vedic' }) }));
      assert.equal(result.status, 200); assert.equal((await result.json()).success, true); assert.equal(urls.length, 5);
      for (const url of urls) {
        assert.equal(url.searchParams.get('datetime'), `1990-06-28T${time}:00+05:30`);
        assert.equal(url.searchParams.get('coordinates'), '21.25,81.63');
      }
    }
  } finally { global.fetch = original; }
});
