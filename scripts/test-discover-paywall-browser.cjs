// Isolated local browser checks. Every API, payment gateway and advertising request is intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3152';
const checkout = '/discover/onboarding/bundle-pricing';
const pendingKey = 'astrorekha_pending_payu_payment';
const out = '/tmp/astrorekha-discover-paywall-qa';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  let lastPage;
  async function fixture({ gateway = 'paytm', outcome = 'paid', restore = false, otherEmail = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const record = { starts: [], coupons: [], ga: [], pixels: [], pending: [], offers: [], r2: [], errors: [], hosted: 0 };
    const id = (gateway === 'pinelabs' ? 'pnl' : gateway === 'paytm' ? 'ptm' : 'pay_') + 'b'.repeat(24);
    await context.exposeBinding('qaTrack', (_, type, data) => record[type].push(data));
    await context.addInitScript(({ restore, otherEmail, id, checkout, pendingKey }) => {
      window.gtag = (...args) => { void window.qaTrack('ga', args); };
      window.dataLayer = [];
      window.dataLayer.push = function(...items) { for (const item of items) if (item && typeof item.length === 'number') void window.qaTrack('ga', Array.from(item)); return Array.prototype.push.apply(this, items); };
      window.fbq = (...args) => { void window.qaTrack('pixels', args); };
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { setItem.call(this, key, value); if (key === pendingKey) void window.qaTrack('pending', JSON.parse(value)); };
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', 'true');
      localStorage.setItem('astrorekha_email', 'fixture@example.com');
      localStorage.setItem('astrorekha_checkout_email', 'fixture@example.com');
      localStorage.setItem('astrorekha_whatsapp_number', '9999999999');
      localStorage.setItem('astrorekha_user_id', 'fixture-user');
      localStorage.setItem('astrorekha-user', JSON.stringify({ state: { userId: 'fixture-user' }, version: 0 }));
      if (restore || otherEmail) localStorage.setItem(pendingKey, JSON.stringify({ txnid: id, type: 'bundle', email: otherEmail ? 'someone-else@example.com' : 'fixture@example.com', bundleId: 'palm-reading', checkoutPath: checkout, returnTo: '/onboarding/bundle-upsell' }));
    }, { restore, otherEmail, id, checkout, pendingKey });
    let bundleId = 'palm-birth-sketch', amount = 1886.82;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname.endsWith('.r2.dev')) record.r2.push(url.href);
      if (url.hostname === 'jssdk.payu.in') return route.fulfill({ contentType: 'application/javascript', body: `window.bolt={launch:function(p,h){h.responseHandler({response:{txnid:p.txnid,txnStatus:'${outcome === 'paid' ? 'SUCCESS' : 'CANCEL'}'}})}};` });
      if (['secure.paytmpayments.com', 'api.pluralonline.com'].includes(url.hostname)) {
        record.hosted++;
        return route.fulfill({ status: 303, headers: { location: `${base}/payment/processing?txnid=${id}` }, body: '' });
      }
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let json = { success: true };
      if (url.pathname === '/api/user/payment-state') json = { hasPaidBundlePayment: false, hasRegisteredAccount: false };
      if (url.pathname === '/api/marketing/event') {
        const body = req.postDataJSON();
        if (body.eventName === 'product_offer_view') record.offers.push(body);
      }
      if (url.pathname === '/api/payments/initiate') {
        const body = req.postDataJSON(); record.starts.push(body); bundleId = body.bundleId;
        amount = { 'palm-reading': 659.62, 'palm-birth': 990.02, 'palm-birth-sketch': 1886.82 }[bundleId];
        json = { txnId: id, amount: String(amount), key: 'fixture', hash: 'fixture', productInfo: 'Fixture', email: 'fixture@example.com', firstName: 'Fixture' };
        if (gateway === 'paytm') Object.assign(json, { gateway, action: 'https://secure.paytmpayments.com/theia/api/v1/showPaymentPage', fields: { mid: 'fixture', orderId: id, txnToken: 'fixture' } });
        if (gateway === 'pinelabs') Object.assign(json, { gateway, action: 'https://api.pluralonline.com/api/v3/checkout-bff/redirect/checkout?token=fixture' });
      }
      if (['/api/payments/status', '/api/payu/status'].includes(url.pathname)) json = url.searchParams.has('checkoutEmail') ? { success: true, matchesCheckout: true }
        : { success: true, status: outcome, type: 'bundle', bundleId, amount, userId: 'canonical-user' };
      if (url.pathname === '/api/coupons/redeem') {
        const body = req.postDataJSON(); record.coupons.push(body);
        if (body.code === 'INVALID') return route.fulfill({ status: 400, json: { success: false, error: 'Invalid coupon code' } });
        json = { success: true, code: body.code, bundleId: 'palm-birth', userId: 'coupon-user' };
      }
      return route.fulfill({ json });
    });
    const page = await context.newPage(); lastPage = page;
    page.on('pageerror', e => record.errors.push(e.message));
    await page.goto(base + checkout);
    return { context, page, record, id };
  }
  try {
    for (const gateway of ['payu', 'paytm', 'pinelabs']) for (const outcome of ['paid', 'failed']) {
      const { context, page, record, id } = await fixture({ gateway, outcome });
      const hero = await page.getByRole('heading', { name: 'Your Palm Reading', exact: true }).boundingBox();
      assert.ok(hero.y >= 0 && hero.y + hero.height < 844, 'paywall entry must show the hero in the initial viewport');
      const cards = page.getByRole('radiogroup', { name: 'Reading bundles' });
      await cards.getByRole('radio').nth(2).waitFor();
      assert.equal(await cards.getByRole('radio').count(), 3);
      assert.equal(await cards.getByRole('radio').nth(2).getAttribute('aria-checked'), 'true');
      for (const [index, total] of [[0, '₹659.62'], [1, '₹990.02'], [2, '₹1,886.82']]) {
        await cards.getByRole('radio').nth(index).click();
        assert.ok((await cards.getByRole('radio').nth(index).innerText()).includes(total));
        assert.ok((await page.getByRole('button', { name: /Get My Reading/ }).first().innerText()).includes(total));
      }
      // Use a non-default product to verify the selected ID, total and entitlement route agree.
      if (gateway === 'paytm') await cards.getByRole('radio').nth(0).click();
      const terms = page.getByRole('checkbox'); await terms.uncheck();
      for (const button of await page.getByRole('button', { name: /Get My Reading/ }).all()) assert.ok(await button.isDisabled());
      await terms.check();
      const body = await page.locator('body').innerText();
      assert.ok(!/Trustpilot|3\.4 million|Is Ready!|Limited Offer|Most Popular|forecast accuracy|\d+% OFF/i.test(body));
      assert.ok(body.includes('Visionary Era')); assert.ok(body.includes('incl. GST'));
      assert.ok(!body.includes('The displayed amount is your total payable'), 'redundant GST paragraph must stay removed');
      if (gateway === 'paytm' && outcome === 'paid') {
        await page.screenshot({ path: out + '/plans-mobile.png', fullPage: true });
        await page.getByRole('button', { name: /Get My Reading/ }).first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: out + '/total-mobile.png', fullPage: true });
      }
      await page.waitForFunction(() => !!window.bolt);
      await page.getByRole('button', { name: /Get My Reading/ }).last().click();
      if (outcome === 'paid') {
        await page.waitForURL(base + '/onboarding/bundle-upsell');
        assert.equal(await page.evaluate(() => localStorage.getItem('astrorekha_payment_completed')), 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('astrorekha_user_id')), 'canonical-user');
        assert.equal(await page.evaluate(() => localStorage.getItem('astrorekha_bundle_id')), gateway === 'paytm' ? 'palm-reading' : 'palm-birth-sketch');
      } else {
        await page.getByRole('button', { name: 'Back to Checkout' }).click();
        await page.waitForURL(base + checkout);
        await page.getByRole('radiogroup', { name: 'Reading bundles' }).waitFor();
        assert.notEqual(await page.evaluate(() => localStorage.getItem('astrorekha_payment_completed')), 'true');
      }
      assert.equal(record.starts.length, 1); assert.equal(record.pending.length, 1);
      assert.equal(record.pending[0].checkoutPath, checkout); assert.equal(record.pending[0].txnid, id);
      const events = record.ga.filter(x => x[0] === 'event' && x[1] === 'begin_checkout');
      assert.equal(events.length, 1); assert.equal(events[0][2].currency, 'INR');
      assert.equal(events[0][2].value, gateway === 'paytm' ? 659.62 : 1886.82);
      assert.equal(events[0][2].items[0].item_id, record.starts[0].bundleId);
      for (const name of ['InitiateCheckout', 'AddPaymentInfo']) {
        const event = record.pixels.find(x => x[1] === name); assert.ok(event, name);
        assert.equal(event[3].eventID, id); assert.equal(event[2].value, events[0][2].value);
      }
      assert.deepEqual(record.errors, []); assert.deepEqual(record.r2, []);
      assert.ok(record.offers.length > 0);
      console.log(`PASS discover ${gateway} ${outcome}: selection, GST, terms, same checkout/events/unlocks, scoped failed retry`);
      await context.close();
    }
    {
      const { context, page, record } = await fixture();
      await page.goto(base + '/discover/onboarding/step-15');
      await page.getByPlaceholder('Enter your email').fill('fixture@example.com');
      await page.getByPlaceholder('Enter WhatsApp number').fill('9999999999');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForURL(base + checkout);
      await page.waitForTimeout(700);
      const hero = await page.getByRole('heading', { name: 'Your Palm Reading', exact: true }).boundingBox();
      assert.ok(hero.y >= 0 && hero.y + hero.height < 844, 'contact submission must land on the visible paywall hero');
      await page.screenshot({ path: out + '/hero-mobile.png' });
      assert.equal(record.starts.length, 0); assert.deepEqual(record.errors, []); await context.close();
      console.log('PASS contact submission lands on the scoped paywall with its hero visible, without starting checkout');
    }
    {
      const { context, page, record } = await fixture();
      await page.getByRole('button', { name: 'Have a coupon code?' }).click();
      await page.getByLabel('Coupon code', { exact: true }).fill('INVALID');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Invalid coupon code' }).waitFor();
      await page.getByLabel('Coupon code', { exact: true }).fill('VALID');
      await page.getByLabel('Coupon code', { exact: true }).press('Enter');
      await page.waitForURL(base + '/onboarding/bundle-upsell');
      assert.equal(record.starts.length, 0); assert.equal(record.coupons.length, 2);
      assert.equal(await page.evaluate(() => localStorage.getItem('astrorekha_bundle_id')), 'palm-birth');
      assert.equal(record.ga.filter(x => x[0] === 'event' && ['purchase', 'begin_checkout'].includes(x[1])).length, 0);
      assert.equal(record.pixels.filter(x => x[1] === 'Purchase').length, 0);
      assert.deepEqual(record.errors, []); await context.close();
      console.log('PASS coupon errors/redeem preserve assigned bundle and shared upsell, without inventing a payment or purchase event');
    }
    for (const otherEmail of [false, true]) {
      const { context, page, record } = await fixture({ restore: true, otherEmail });
      if (otherEmail) {
        await page.getByRole('radiogroup', { name: 'Reading bundles' }).waitFor();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), pendingKey), null);
        assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('astrorekha_pending_payu_history'))))[0].email, 'someone-else@example.com');
      } else await page.waitForURL(base + '/onboarding/bundle-upsell');
      assert.equal(record.starts.length, 0); assert.deepEqual(record.errors, []);
      await context.close(); console.log(`PASS pending recovery ${otherEmail ? 'isolates a different email and shows a new paywall' : 'resumes the saved transaction without a new charge'}`);
    }
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: out + '/failure.png', fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
