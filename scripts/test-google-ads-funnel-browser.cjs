// Local isolated browser fixtures: all app APIs, payment destinations and marketing
// senders are intercepted. The public MediaPipe model is read-only; no photo leaves the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3152';
const out = process.env.QA_OUTPUT_DIR || '/tmp/astrorekha-google-ads-qa';
const hand = process.env.QA_HAND_FIXTURE;
const id = 'ptm' + 'a'.repeat(24);
const sign = { name: 'Cancer', symbol: '♋', element: 'Water', description: 'Fixture' };
fs.mkdirSync(out, { recursive: true });

async function isolated(browser, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', ...extra });
  const records = { apis: [], pixels: [], r2: [], hosted: 0, pageErrors: [] };
  await context.addInitScript(() => {
    window.__qaGA = []; window.__qaPixels = [];
    window.gtag = (...args) => window.__qaGA.push(args);
    window.fbq = (...args) => window.__qaPixels.push(args);
    const count = Number(sessionStorage.getItem('qa_documents') || 0);
    sessionStorage.setItem('qa_documents', String(count + 1));
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname.endsWith('.r2.dev')) records.r2.push(url.pathname);
    if (url.origin === 'https://secure.paytmpayments.com') {
      assert.equal(req.method(), 'POST');
      assert.equal(new URLSearchParams(req.postData()).get('orderId'), id);
      records.hosted++;
      return route.fulfill({ status: 303, headers: { location: `${base}/payment/processing?txnid=${id}` }, body: '' });
    }
    if (url.hostname === 'geocoding-api.open-meteo.com') return route.fulfill({ json: {
      results: [{ name: 'Raipur', admin1: 'Chhattisgarh', country: 'India', latitude: 21.25, longitude: 81.63 }],
    } });
    if (['cdn.jsdelivr.net', 'storage.googleapis.com'].includes(url.hostname)) return route.continue();
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = req.postDataJSON?.();
    records.apis.push({ path: url.pathname, query: url.search, body });
    let json = { success: true };
    if (url.pathname === '/api/astrology/signs') json = { success: true, sunSign: sign, moonSign: sign, ascendant: sign, modality: 'Cardinal', polarity: 'Feminine' };
    if (url.pathname === '/api/user/payment-state') json = { hasPaidBundlePayment: false, hasRegisteredAccount: false };
    if (url.pathname === '/api/payments/initiate') json = { gateway: 'paytm', txnId: id, amount: '1886.82',
      action: `https://secure.paytmpayments.com/theia/api/v1/showPaymentPage?mid=fixture&orderId=${id}`,
      fields: { mid: 'fixture', orderId: id, txnToken: 'fixture-token' } };
    if (['/api/payments/status', '/api/payu/status'].includes(url.pathname)) json = url.searchParams.has('checkoutEmail')
      ? { success: true, matchesCheckout: true }
      : { success: true, status: 'paid', gateway: 'paytm', userId: 'fixture-user', type: 'bundle', bundleId: 'palm-birth-sketch', amount: 1886.82 };
    return route.fulfill({ json });
  });
  const page = await context.newPage();
  page.on('pageerror', error => records.pageErrors.push(error.message));
  return { context, page, records };
}
const text = page => page.locator('body').innerText();
async function screenshot(page, name) {
  // Let the existing entrance transitions settle before capturing review evidence.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, name), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const htmls = [];
    for (const userAgent of ['Mozilla/5.0 Chrome/130.0.0.0', 'AdsBot-Google (+http://www.google.com/adsbot.html)', 'Googlebot']) {
      const response = await fetch(`${base}/discover`, { headers: { 'user-agent': userAgent } });
      assert.equal(response.status, 200); const html = await response.text(); htmls.push(html);
      assert.ok(html.includes('AI-generated digital reports')); assert.ok(html.includes('Visionary Era'));
      assert.ok(html.includes('href="/discover/onboarding"'));
      assert.ok(!html.includes('Loading AstroRekha'));
    }
    assert.equal(htmls[0], htmls[1]); assert.equal(htmls[1], htmls[2]);
    const noJS = await isolated(browser, { javaScriptEnabled: false });
    await noJS.page.goto(`${base}/discover`);
    await noJS.page.getByRole('link', { name: 'Begin Your Journey', exact: true }).waitFor();
    assert.ok(await noJS.page.getByRole('link', { name: 'Contact us', exact: true }).isVisible());
    await noJS.page.screenshot({ path: path.join(out, 'google-ads-no-js.png'), fullPage: true });
    await noJS.context.close();
    console.log('PASS server-rendered public entry, identical Chrome/AdsBot/Googlebot content and visible no-JS CTA/business links');

    const returning = await isolated(browser);
    await returning.context.addInitScript(() => localStorage.setItem('astrorekha_registration_completed', 'true'));
    await returning.page.goto(`${base}/discover`);
    await returning.page.getByRole('link', { name: 'Continue to your account' }).waitFor();
    assert.equal(new URL(returning.page.url()).pathname, '/discover');
    await returning.context.close();
    console.log('PASS returning customers remain on the same public entry with an explicit account link');

    const navigation = await isolated(browser);
    await navigation.page.goto(`${base}/discover/onboarding/birthday`);
    await navigation.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await navigation.page.waitForURL(`${base}/discover/onboarding/birth-time`);
    await navigation.page.goBack();
    await navigation.page.waitForURL(`${base}/discover/onboarding/birthday`);
    await navigation.page.reload();
    await navigation.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await navigation.page.waitForURL(`${base}/discover/onboarding/birth-time`);
    await navigation.context.close();
    assert.equal((await fetch(`${base}/discover/onboarding/bundle-pricing`)).status, 200);
    for (const suffix of ['step-19', 'birthday/nested']) {
      assert.equal((await fetch(`${base}/discover/onboarding/${suffix}`)).status, 404);
    }
    for (const asset of ['/logo.webp', '/palmscanner-optimized.mp4', '/palmoutline.webp']) {
      assert.equal((await fetch(base + asset, { method: 'HEAD' })).status, 200);
    }
    assert.ok((await (await fetch(base + '/sitemap.xml')).text()).includes('https://astrorekha.com/discover'));
    assert.ok((await (await fetch(base + '/robots.txt')).text()).includes('Sitemap: https://astrorekha.com/sitemap.xml'));
    console.log('PASS direct entry, back, reload and forward stay in the new journey; unknown steps 404; first-party assets and crawler discovery work');

    for (const googleAds of [true, false]) {
      const { context, page, records } = await isolated(browser);
      const prefix = googleAds ? '/discover/onboarding' : '/onboarding';
      const where = step => prefix + (step ? '/' + step : '');
      await page.goto(`${base}${googleAds ? '/discover' : '/'}?utm_source=google&utm_medium=cpc&utm_campaign=fixture-campaign&gclid=fixture-click`);
      if (googleAds) await page.getByRole('link', { name: 'Begin Your Journey', exact: true }).click();
      else await page.getByRole('button', { name: 'Begin Your Journey', exact: true }).click();
      await page.waitForURL(base + where(''));
      await page.getByRole('button', { name: /♀.*Female/ }).click(); await page.waitForURL(base + where('birthday'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('birth-time'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('birthplace'));
      await page.getByPlaceholder('Your birthplace').fill('Raipur');
      await page.getByRole('button', { name: /Raipur/ }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-5'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-6'));
      assert.equal((await text(page)).includes('Forecast accuracy'), !googleAds);
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-7'));
      await page.getByRole('button', { name: /Single/ }).click(); await page.waitForURL(base + where('step-8'));
      await page.getByRole('button', { name: /Career/ }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-9'));
      await page.getByRole('button', { name: 'Blue', exact: true }).click(); await page.waitForURL(base + where('step-10'));
      await page.getByRole('button', { name: /Earth/ }).click(); await page.waitForURL(base + where('step-11'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-12'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForURL(base + where('step-13'));
      assert.equal((await text(page)).includes('just got predictions'), !googleAds);
      await screenshot(page, googleAds ? 'google-ads-palm-upload.png' : 'original-palm-upload.png');
      if (googleAds) assert.deepEqual(records.r2, []);
      assert.ok(hand, 'Set QA_HAND_FIXTURE to an authorized non-customer hand image');
      await page.locator('input[type=file]').setInputFiles(hand);
      await page.getByRole('button', { name: 'Proceed', exact: true }).waitFor();
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Proceed');
        return button && !button.disabled;
      }, null, { timeout: 60000 });
      await page.getByRole('button', { name: 'Proceed', exact: true }).click();
      await page.waitForURL(base + where('step-14'), { timeout: 30000 });
      await page.getByRole('link', { name: googleAds ? 'Continue to Your Reading' : 'Get the Results!' }).click();
      await page.waitForURL(base + where('step-15'));
      assert.equal((await text(page)).includes('recovery from illness'), !googleAds);
      await screenshot(page, googleAds ? 'google-ads-contact.png' : 'original-contact.png');
      await page.getByPlaceholder('Enter your email').fill('fixture@example.com');
      await page.getByPlaceholder('Enter WhatsApp number').fill('9999999999');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForURL(base + (googleAds ? '/discover/onboarding/bundle-pricing' : '/onboarding/bundle-pricing'));
      const attribution = await page.evaluate(() => JSON.parse(localStorage.getItem('astrorekha_attribution')));
      assert.equal(attribution.utm_campaign, 'fixture-campaign'); assert.equal(attribution.click_id, 'fixture-click');
      assert.ok(attribution.landing_path.startsWith(googleAds ? '/discover?' : '/?'));
      const telemetry = await page.evaluate(() => ({
        documents: sessionStorage.getItem('qa_documents'), ga: [...window.__qaGA, ...(window.dataLayer || []).filter(x => x && typeof x.length === 'number').map(x => Array.from(x))],
      }));
      assert.equal(telemetry.documents, '1', 'no forced document reload before the paywall');
      assert.equal(telemetry.ga.filter(x => x[0] === 'event' && x[1] === 'quiz_start').length, 1);
      assert.equal(telemetry.ga.filter(x => x[0] === 'event' && x[1] === 'quiz_complete').length, 1);
      assert.ok(records.apis.some(r => r.path === '/api/marketing/event' && r.body?.attribution?.utm_campaign === 'fixture-campaign'));
      if (googleAds) assert.ok(records.apis.some(r => r.path === '/api/ab-test/event' && r.body?.metadata?.route === prefix + '/step-13'));
      await page.getByRole('button', { name: /Get My Reading/ }).last().waitFor();
      await screenshot(page, googleAds ? 'discover-paywall.png' : 'shared-paywall-from-original.png');
      if (googleAds) {
        assert.deepEqual(records.r2, []);
        assert.ok(!/Trustpilot|3.4 million|Is Ready!|just got predictions|Limited Offer|Most Popular/i.test(await text(page)));
        assert.ok((await text(page)).includes('incl. GST'));
        await page.getByRole('button', { name: /Get My Reading/ }).last().click();
        await page.waitForURL(base + '/onboarding/bundle-upsell', { timeout: 20000 });
        assert.equal(records.hosted, 1); assert.equal(records.apis.filter(r => r.path === '/api/payments/initiate').length, 1);
        const initiation = records.apis.find(r => r.path === '/api/payments/initiate').body;
        assert.equal(initiation.attribution.utm_campaign, 'fixture-campaign'); assert.equal(initiation.attribution.click_id, 'fixture-click');
        console.log('PASS new route -> one mocked hosted checkout -> existing payment processing and upsell, attribution preserved');
      }
      assert.deepEqual(records.pageErrors, []);
      fs.writeFileSync(path.join(out, googleAds ? 'google-ads-telemetry.json' : 'original-telemetry.json'), JSON.stringify({ records, attribution, telemetry }, null, 2));
      console.log(`PASS ${googleAds ? 'Google Ads' : 'original'} 14-step mobile journey including real hand-model validation -> ${googleAds ? 'scoped' : 'original'} paywall`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
