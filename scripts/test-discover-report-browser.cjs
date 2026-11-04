// Browser -> shared checkout confirmation -> report access -> generation/cache.
// Every API, Supabase request, provider and advertising request is intercepted.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3152';
const out = '/tmp/astrorekha-report-flow-qa'; fs.mkdirSync(out, { recursive: true });
const plans = [
  { id: 'palm-reading', amount: 659.62, features: { palmReading: true } },
  { id: 'palm-birth', amount: 990.02, features: { palmReading: true, birthChart: true } },
  { id: 'palm-birth-sketch', amount: 1886.82, features: { palmReading: true, birthChart: true, soulmateSketch: true, futurePartnerReport: true } },
];
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1kAAAAASUVORK5CYII=', 'base64');
const reading = { cosmicInsight: 'Fixture report generated from the saved birth details and uploaded palm.', tabs: { ageTimeline: { title: 'Fixture timeline', stages: [], milestones: {} }, wealth: {}, mounts: { mounts: [] }, love: {} } };
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  let lastPage;
  try {
    for (const [index, plan] of plans.entries()) {
      const id = 'ptm' + String(index + 1).repeat(24), userId = 'canonical-fixture-' + index;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      let starts = 0, generated = 0, cached = null, birthGenerated = 0, birthCached = null; const errors = [], requests = [];
      const profile = { id: userId, email: 'fixture@example.com', name: 'Fixture', password_hash: 'fixture-only',
        unlocked_features: plan.features, coins: 15, bundle_purchased: plan.id, purchase_type: 'one-time', timezone: 'Asia/Kolkata',
        birth_month: 'June', birth_day: '28', birth_year: '1990', birth_hour: '12', birth_minute: '30', birth_period: 'PM', birth_place: 'Raipur', gender: 'male', sun_sign: 'Cancer' };
      await context.addInitScript(() => {
        if (sessionStorage.getItem('qa-seed')) return; sessionStorage.setItem('qa-seed', '1');
        localStorage.setItem('astrorekha_email', 'fixture@example.com'); localStorage.setItem('astrorekha_whatsapp_number', '9999999999');
        localStorage.setItem('astrorekha_user_id', 'anonymous-fixture');
        localStorage.setItem('astrorekha-onboarding', JSON.stringify({ state: { birthMonth: 'June', birthDay: '28', birthYear: '1990', birthHour: '12', birthMinute: '30', birthPeriod: 'PM', birthPlace: 'Raipur', gender: 'male', timezone: 'Asia/Kolkata' }, version: 0 }));
      });
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
          const table = url.pathname.split('/').pop(); requests.push({ table, method: req.method() });
          if (table === 'users') return route.fulfill({ json: /vnd.pgrst.object/.test(req.headers().accept || '') ? profile : [profile] });
          if (table === 'user_profiles') return route.fulfill({ json: /vnd.pgrst.object/.test(req.headers().accept || '') ? profile : [profile] });
          if (table === 'palm_readings') {
            if (req.method() === 'POST') { const body = req.postDataJSON(); cached = Array.isArray(body) ? body[0] : body; assert.equal(cached.id, userId); return route.fulfill({ json: cached }); }
            return cached ? route.fulfill({ json: cached }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'Fixture has no saved reading yet' } });
          }
          if (table === 'birth_charts') {
            if (req.method() === 'POST') { birthCached = req.postDataJSON(); return route.fulfill({ json: birthCached }); }
            return route.fulfill({ json: birthCached });
          }
          return route.fulfill({ json: [] });
        }
        if (url.hostname === 'secure.paytmpayments.com') return route.fulfill({ status: 303, headers: { location: base + '/payment/processing?txnid=' + id }, body: '' });
        if (url.origin !== base) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let json = { success: true };
        if (url.pathname === '/api/user/payment-state') json = { hasPaidBundlePayment: false, hasRegisteredAccount: false };
        if (url.pathname === '/api/payments/initiate') {
          starts++; const body = req.postDataJSON(); assert.equal(body.bundleId, plan.id); assert.equal(body.birthDetails.birthYear, '1990');
          json = { gateway: 'paytm', txnId: id, amount: String(plan.amount), action: 'https://secure.paytmpayments.com/theia/api/v1/showPaymentPage', fields: { mid: 'fixture', orderId: id, txnToken: 'fixture' } };
        }
        if (['/api/payments/status', '/api/payu/status'].includes(url.pathname)) json = { success: true, status: 'paid', type: 'bundle', bundleId: plan.id, amount: plan.amount, userId };
        if (url.pathname === '/api/palm-reading') {
          generated++; const body = req.postDataJSON(); assert.equal(body.userId, userId); assert.equal(body.birthDate, '1990-06-28'); assert.equal(body.zodiacSign, 'Cancer');
          json = { success: true, reading };
        }
        if (url.pathname === '/api/astrology/geo') json = { success: true, data: { latitude: 21.25, longitude: 81.63, timezone: 5.5 } };
        if (url.pathname === '/api/astrology/birth-chart') {
          birthGenerated++; const body = req.postDataJSON(); assert.equal(body.birthDate, '1990-06-28'); assert.equal(body.birthTime, '12:30'); assert.equal(body.latitude, 21.25);
          json = { success: true, data: { chartType: 'vedic', chart: { output: '<svg xmlns="http://www.w3.org/2000/svg"><text>Fixture birth chart</text></svg>' }, planet_positions: [{ name: 'Ascendant', rasi: { name: 'Cancer' } }], kundli: { nakshatra_details: { chandra_rasi: { name: 'Cancer' } } } } };
        }
        return route.fulfill({ json });
      });
      const page = await context.newPage(); lastPage = page; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/discover/onboarding/bundle-pricing');
      await page.getByRole('radio').nth(index).click(); await page.getByRole('button', { name: /Get My Reading/ }).last().click();
      await page.waitForURL(base + '/onboarding/bundle-upsell'); assert.equal(starts, 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('astrorekha_user_id')), userId);
      // Account access is an isolated browser fixture; no registration or real session is created.
      await context.addCookies([{ name: 'ar_access', value: userId, url: base }]);
      await page.evaluate(() => localStorage.setItem('astrorekha_registration_completed', 'true'));
      await page.goto(base + '/reports'); await page.getByRole('heading', { name: 'Palm Reading Report', exact: true }).waitFor();
      await page.waitForFunction(expected => {
        const state = JSON.parse(localStorage.getItem('astrorekha-user') || '{}').state;
        return state && Object.entries(expected).every(([k, v]) => state.unlockedFeatures[k] === v);
      }, plan.features);
      const state = await page.evaluate(() => JSON.parse(localStorage.getItem('astrorekha-user')).state);
      assert.equal(!!state.unlockedFeatures.birthChart, !!plan.features.birthChart);
      assert.equal(!!state.unlockedFeatures.soulmateSketch, !!plan.features.soulmateSketch);
      assert.equal(!!state.unlockedFeatures.compatibilityTest, false);
      await page.getByRole('heading', { name: 'Palm Reading Report', exact: true }).click(); await page.waitForURL(base + '/palm-reading');
      await page.locator('input[type=file]').setInputFiles({ name: 'fixture-palm.png', mimeType: 'image/png', buffer: image });
      await page.getByText(reading.cosmicInsight, { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Results');
      assert.equal(generated, 1); assert.ok(cached && cached.birth_date === '1990-06-28');
      await page.screenshot({ path: out + '/' + plan.id + '.png' });
      await page.reload(); await page.getByText(reading.cosmicInsight, { exact: true }).waitFor(); assert.equal(generated, 1, 'cached reading must not trigger provider generation again');
      if (plan.features.birthChart) {
        await page.goto(base + '/birth-chart'); await page.getByText('Fixture birth chart', { exact: true }).waitFor(); assert.equal(birthGenerated, 1); assert.ok(birthCached);
        await page.reload(); await page.getByText('Fixture birth chart', { exact: true }).waitFor(); assert.equal(birthGenerated, 1, 'cached chart must not regenerate');
      }
      assert.deepEqual(errors, []); await context.unrouteAll({ behavior: 'wait' }); await context.close();
      console.log('PASS ' + plan.id + ': shared paid confirmation -> exact server unlocks -> report generation with saved birth details -> persistence -> cached reload');
    }
  } catch (error) { if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: out + '/failure.png' }); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
