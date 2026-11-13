/* Metadata-only repair for three GA4-verified orders. Dry run unless --apply.
 * Never sends events, calls a gateway, or invokes fulfillment. */
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const ids = ['pnl43adfb0b6d91742e28067391', 'pnla599f730da90fe253fb9e75a', 'pnl5c55d3573ecfb672281d2e16'];
const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'last_touch', 'landing_path', 'landing_url'];
(async () => {
  const property = process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
  const api = google.analyticsdata({ version: 'v1beta', auth });
  const { data } = await api.properties.runReport({ property: `properties/${property}`, requestBody: {
    dateRanges: [{ startDate: '2026-11-08', endDate: '2026-11-12' }], currencyCode: 'INR',
    dimensions: ['transactionId', 'sessionSourceMedium', 'sessionCampaignName', 'landingPage', 'hostName'].map(name => ({ name })),
    metrics: ['ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })),
    dimensionFilter: { filter: { fieldName: 'transactionId', inListFilter: { values: ids } } }, limit: '100',
  } }, { timeout: 30000 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const before = await db.from('payments').select('*').in('id', ids);
  if (before.error || before.data.length !== 3) throw Error('Expected exactly three existing payment records.');
  const plans = before.data.map(order => {
    const rows = (data.rows || []).filter(r => r.dimensionValues[0].value === order.id);
    if (rows.length !== 1) throw Error(`Ambiguous GA4 evidence: ${order.id}`);
    const r = rows[0], [, source, campaign, landing, host] = r.dimensionValues.map(v => v.value);
    if (source !== 'google / cpc' || !campaign || campaign === '(not set)' || landing !== '/discover' || !['astrorekha.com', 'www.astrorekha.com', '(not set)'].includes(host) || Number(r.metricValues[0].value) !== 1 || Math.abs(Number(r.metricValues[1].value) - order.amount / 100) > .01) throw Error(`GA4 evidence mismatch: ${order.id}`);
    if (order.payment_status !== 'paid' || order.gateway !== 'pinelabs' || order.payment_mode !== 'live' || order.amount !== 65962 || order.currency !== 'INR' || !order.fulfilled_at) throw Error(`Payment validation failed: ${order.id}`);
    if (order.last_touch?.attribution_origin === 'ga4_transaction_recovery') return { id: order.id, alreadyRepaired: true };
    if (order.last_touch || order.first_touch || order.utm_source || order.utm_medium || order.utm_campaign) throw Error(`Existing attribution must not be overwritten: ${order.id}`);
    if (order.landing_path && new URL(order.landing_path, 'https://astrorekha.com').pathname !== landing) throw Error(`Conflicting landing path: ${order.id}`);
    const savedLanding = new URL(order.landing_url || order.landing_path || landing, 'https://astrorekha.com');
    if (!['astrorekha.com', 'www.astrorekha.com'].includes(savedLanding.hostname)) throw Error('Unexpected saved landing host');
    const clickEvidence = Object.fromEntries(['gclid','gbraid','wbraid'].filter(k => savedLanding.searchParams.has(k)).map(k => [k, savedLanding.searchParams.get(k)]));
    const patch = { utm_source: 'google', utm_medium: 'cpc', utm_campaign: campaign,
      last_touch: { ...clickEvidence, utm_source: 'google', utm_medium: 'cpc', utm_campaign: campaign, landing_path: landing,
        attribution_origin: 'ga4_transaction_recovery', ga4_property_id: property, verified_at: new Date().toISOString() },
      landing_path: order.landing_path || landing, landing_url: order.landing_url || `https://astrorekha.com${landing}` };
    return { id: order.id, patch, before: Object.fromEntries(allowed.map(k => [k, order[k]])) };
  });
  const apply = process.argv.includes('--apply');
  if (apply) {
    const backup = `/tmp/astro-google-attribution-repair-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify({ property, evidence: data.rows, plans }, null, 2), { mode: 0o600 });
    console.log(`Metadata backup: ${backup}`);
    for (const plan of plans) {
      if (plan.alreadyRepaired) continue;
      const saved = await db.from('payments').update(plan.patch).eq('id', plan.id).eq('payment_status', 'paid').eq('amount', 65962).is('last_touch', null).is('first_touch', null).is('utm_source', null).is('utm_medium', null).is('utm_campaign', null).select('id');
      if (saved.error || saved.data.length !== 1) throw Error(`Repair failed or record changed: ${plan.id}: ${saved.error?.message || ''}`);
    }
    const after = await db.from('payments').select('*').in('id', ids);
    if (after.error || after.data.length !== 3) throw Error('Verification read failed.');
    for (const old of before.data) {
      const current = after.data.find(r => r.id === old.id);
      for (const key of Object.keys(old)) if (!allowed.includes(key) && JSON.stringify(old[key]) !== JSON.stringify(current[key])) throw Error(`Unexpected changed field: ${old.id} ${key}`);
    }
    console.log('Verified: only attribution fields changed; payment, fulfillment and event-delivery fields unchanged.');
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', orders: plans.map(p => ({ id: p.id, alreadyRepaired: p.alreadyRepaired || false, source: p.patch?.utm_source, campaign: p.patch?.utm_campaign, landing: p.patch?.last_touch?.landing_path })) }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
