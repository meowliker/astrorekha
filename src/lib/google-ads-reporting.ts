import { google } from 'googleapis';
import { campaignNameKey, trackingDayStartUtc, nextTrackingDayStartUtc, type TrackingCampaign, type TrackingDayMode } from './tracking-dashboard';
import type { AcquisitionFunnel } from './admin-acquisition';

// Direct, read-only access granted to the existing Google service account.
export const GOOGLE_ADS_CUSTOMERS = ['4870113996', '6752275511'] as const;
const API_VERSION = 'v26';
const HOUR = 3_600_000, DAY = 24 * HOUR;
type Metrics = { costMicros?: string; clicks?: string; impressions?: string };
type Row = {
  customer?: { id: string; descriptiveName: string; currencyCode: string; timeZone: string };
  campaign?: { id: string; name: string; status?: string; advertisingChannelType?: string };
  campaignBudget?: { amountMicros?: string };
  segments?: { date: string; hour?: number };
  landingPageView?: { unexpandedFinalUrl: string };
  adGroupAd?: { ad: { finalUrls?: string[] } };
  metrics?: Metrics;
};
type Snapshot = { customer: NonNullable<Row['customer']>; campaigns: Row[]; destinations: Row[]; landing: Row[]; hours: Row[]; fetchedAt: string };
export type GoogleAccountReport = {
  account: { id: string; name: string; currency: string; timezone: string; error?: string };
  campaigns: TrackingCampaign[];
  dailySpendInr: Record<string, { total: number; indian: number }>;
  hourlySpendInr: Record<string, Record<string, number[]>>;
  warnings: string[];
};
export type GoogleSpendReport = { failedAccountIds?: string[]; accounts: GoogleAccountReport[]; complete: boolean; warnings: string[]; fetchedAt: string };
const cache = new Map<string, { until: number; promise: Promise<Snapshot> }>();
let auth: InstanceType<typeof google.auth.GoogleAuth> | undefined;

export function validateGoogleRange(start: string, end: string) {
  for (const value of [start, end]) if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Choose valid Google Ads report dates.');
  if (end < start || Date.parse(end) - Date.parse(start) >= 366 * DAY) throw new Error('Choose up to 366 days for Google Ads reporting.');
}
function shift(day: string, n: number) { return new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10); }
function credentialAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) throw new Error('Google Ads service-account credentials are not configured.');
  return auth ||= new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/adwords'] });
}
async function search(customerId: string, query: string): Promise<Row[]> {
  if (!(GOOGLE_ADS_CUSTOMERS as readonly string[]).includes(customerId)) throw new Error('Google Ads account is not configured.');
  const token = await credentialAuth().getAccessToken();
  const rows: Row[] = []; let pageToken: string | undefined;
  for (let page = 0; page < 100; page++) {
    const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }), signal: AbortSignal.timeout(20_000), cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok) {
      const code = body.error?.details?.flatMap((d: { errors?: { errorCode?: Record<string, string> }[] }) => d.errors || []).map((e: { errorCode?: Record<string, string> }) => Object.values(e.errorCode || {}).join(',')).join(',') || response.status;
      throw new Error(`Google Ads ${customerId}: ${code}. Check account access and Cloud API access.`);
    }
    rows.push(...(body.results || [])); pageToken = body.nextPageToken;
    if (!pageToken) return rows;
  }
  throw new Error('Google Ads report exceeds the pagination limit. Choose fewer dates.');
}
async function snapshot(id: string, start: string, end: string): Promise<Snapshot> {
  const key = `${id}:${start}:${end}`;
  const cached = cache.get(key); if (cached && cached.until > Date.now()) return cached.promise;
  for (const [cacheKey, entry] of cache) {
    const [account, first, last] = cacheKey.split(':');
    if (account === id && first <= start && last >= end && entry.until > Date.now()) return entry.promise;
  }
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  const promise = (async () => {
    const range = `segments.date BETWEEN '${start}' AND '${end}'`;
    const [customer, campaigns, destinations, landing, hours] = await Promise.all([
      search(id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1'),
      search(id, 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign'),
      search(id, 'SELECT campaign.id, ad_group_ad.ad.final_urls FROM ad_group_ad'),
      search(id, `SELECT campaign.id, landing_page_view.unexpanded_final_url, segments.date, metrics.cost_micros FROM landing_page_view WHERE ${range}`),
      search(id, `SELECT campaign.id, segments.date, segments.hour, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE ${range}`),
    ]);
    if (!customer[0]?.customer) throw new Error(`Google Ads ${id}: account metadata unavailable.`);
    return { customer: customer[0].customer, campaigns, destinations, landing, hours, fetchedAt: new Date().toISOString() };
  })();
  cache.set(key, { until: Date.now() + 300_000, promise });
  try { return await promise; } catch (error) { cache.delete(key); throw error; }
}

/** Use the actual reported landing URL, never the account's country or campaign name. */
export function googleDestination(url: string): AcquisitionFunnel | null {
  try {
    const parsed = new URL(url); if (!['astrorekha.com', 'www.astrorekha.com'].includes(parsed.hostname)) return null;
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (/^\/us\/soulmate(?:\/|$)/.test(path)) return 'us-soulmate';
    if (/^\/soulmate(?:\/|$)/.test(path)) return 'soulmate';
    if (/^\/us(?:\/|$)/.test(path)) return 'us-main';
    if (path === '/' || /^\/(?:discover|google-ads|onboarding)(?:\/|$)/.test(path)) return 'astrorekha';
    return null;
  } catch { return null; }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(ms: number, zone: string) {
  let fmt = formatters.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(zone, fmt); }
  const p = Object.fromEntries(fmt.formatToParts(ms).map(p => [p.type, p.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
/** Enumerate actual clock hours, preserving DST's repeated hour. No half-hour spend estimates. */
export function googleClockHours(date: string, zone: string): Map<number, number[]> {
  const hours = new Map<number, number[]>(), midnight = Date.parse(date);
  for (let at = midnight - DAY; at <= midnight + 2 * DAY; at += 30 * 60_000) {
    const p = localParts(at, zone); if (p.date !== date || p.minute !== 0) continue;
    hours.set(p.hour, [...(hours.get(p.hour) || []), at]);
  }
  return hours;
}
function metric(value: string | undefined) { const n = Number(value || 0); if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid Google Ads metric.'); return n; }
function campaignRow(row: Row, customer: Snapshot['customer']): TrackingCampaign {
  return { network: 'google', key: `google:${customer.id}:${row.campaign!.id}`, accountId: `google:${customer.id}`, accountName: `Google · ${customer.descriptiveName}`, currency: customer.currencyCode,
    campaignId: row.campaign!.id, campaignName: row.campaign!.name, objective: row.campaign!.advertisingChannelType || null, status: row.campaign!.status === 'ENABLED' ? 'ACTIVE' : row.campaign!.status || null,
    dailyBudget: row.campaignBudget?.amountMicros ? Number(row.campaignBudget.amountMicros) / 1e6 : null, lifetimeBudget: null, bidAmount: null, bidStrategy: null,
    spend: 0, spendInr: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0, metaPurchaseValue: 0, leads: 0,
    metaPurchaseWindowAligned: false, orders: 0, grossRevenue: 0, refunds: 0, refundAmount: 0, revenue: 0, utmSources: [], utmMediums: [], utmTerms: [], utmContents: [], attribution: 'none', adBreakdown: [] };
}
export function aggregateGoogleSnapshot(data: Snapshot, funnel: AcquisitionFunnel, start: string, end: string, mode: TrackingDayMode, rate: number): GoogleAccountReport {
  const { customer } = data;
  const targetCurrency = funnel.startsWith('us-') ? 'USD' : 'INR';
  const factor = customer.currencyCode === targetCurrency ? 1 : customer.currencyCode === 'USD' && targetCurrency === 'INR' ? rate : customer.currencyCode === 'INR' && targetCurrency === 'USD' ? 1 / rate : NaN;
  const report: GoogleAccountReport = { account: { id: `google:${customer.id}`, name: `Google · ${customer.descriptiveName}`, currency: customer.currencyCode, timezone: customer.timeZone }, campaigns: [], dailySpendInr: {}, hourlySpendInr: {}, warnings: [] };
  for (let date = start; date <= end; date = shift(date, 1)) report.dailySpendInr[date] = { total: 0, indian: 0 };
  const windows = Object.keys(report.dailySpendInr).map(date => ({ date, start: Date.parse(trackingDayStartUtc(date, mode)), end: Date.parse(nextTrackingDayStartUtc(date, mode)) }));
  const current = new Map<string, Set<AcquisitionFunnel | null>>();
  for (const row of data.destinations) for (const url of row.adGroupAd?.ad.finalUrls || []) { const id = row.campaign!.id; const set = current.get(id) || new Set(); set.add(googleDestination(url)); current.set(id, set); }
  const landing = new Map<string, { funnels: Set<AcquisitionFunnel | null>; micros: number }>();
  for (const row of data.landing) { const key = `${row.campaign!.id}:${row.segments!.date}`, value = landing.get(key) || { funnels: new Set(), micros: 0 }; value.funnels.add(googleDestination(row.landingPageView!.unexpandedFinalUrl)); value.micros += metric(row.metrics?.costMicros); landing.set(key, value); }
  const dailyCosts = new Map<string, number>();
  for (const row of data.hours) { const key = `${row.campaign!.id}:${row.segments!.date}`; dailyCosts.set(key, (dailyCosts.get(key) || 0) + metric(row.metrics?.costMicros)); }
  const rows = new Map<string, TrackingCampaign>();
  const getRow = (id: string) => { let row = rows.get(id); if (!row) { const info = data.campaigns.find(r => r.campaign!.id === id); if (!info) throw new Error('Google campaign metadata is incomplete.'); row = campaignRow(info, customer); rows.set(id, row); } return row; };
  // Zero-spend campaigns may use current URLs. Paid hours must agree with reported landing-page cost.
  for (const [id, destinations] of current) if (destinations.size === 1 && destinations.has(funnel)) getRow(id);
  const clocks = new Map<string, Map<number, number[]>>();
  const warnings = new Set<string>();
  for (const item of data.hours) {
    const id = item.campaign!.id, date = item.segments!.date, cost = metric(item.metrics?.costMicros);
    let hours = clocks.get(date); if (!hours) { hours = googleClockHours(date, customer.timeZone); clocks.set(date, hours); }
    const instants = hours.get(item.segments!.hour!) || [];
    if (!instants.length) throw new Error('Google Ads returned an invalid account-local hour.');
    const overlaps = windows.filter(w => instants.some(at => at < w.end && at + HOUR > w.start));
    if (!overlaps.length) continue;
    const mapping = landing.get(`${id}:${date}`);
    const destinations = mapping?.funnels || current.get(id) || new Set([null]);
    if (destinations.size === 1 && !destinations.has(null) && !destinations.has(funnel)) continue;
    const mapped = destinations.size === 1 && destinations.has(funnel) && (cost === 0 || !!mapping && mapping.micros === dailyCosts.get(`${id}:${date}`));
    if (!mapped) {
      if (cost > 0) { warnings.add('Some Google spend has an unknown or mixed funnel destination. Profit and ROAS are withheld until that spend can be assigned reliably.'); report.account.error = 'Incomplete funnel attribution'; }
      continue;
    }
    const row = getRow(id);
    const exact = overlaps.length === 1 && instants.every(at => at >= overlaps[0].start && at + HOUR <= overlaps[0].end);
    if (!exact && (cost > 0 || metric(item.metrics?.clicks) > 0 || metric(item.metrics?.impressions) > 0)) {
      row.spendInr = null; report.account.error = 'Reporting window splits a Google clock hour';
      warnings.add('This reporting window splits a Google account clock hour. Google provides hourly totals only, so affected spend and ROAS are unavailable rather than estimated.'); continue;
    }
    if (!exact) continue;
    if (!Number.isFinite(factor) || factor <= 0) { report.account.error = 'Configure a valid currency exchange rate'; row.spendInr = null; continue; }
    const native = cost / 1e6, converted = native * factor, window = overlaps[0];
    row.spend += native; if (row.spendInr !== null) row.spendInr += converted;
    row.clicks += metric(item.metrics?.clicks); row.linkClicks = row.clicks; row.impressions += metric(item.metrics?.impressions);
    report.dailySpendInr[window.date].total += converted;
    if (customer.currencyCode === 'INR' && targetCurrency === 'INR') report.dailySpendInr[window.date].indian += converted;
    const bucket = (instants[0] - window.start) / HOUR;
    if (Number.isInteger(bucket) && instants.length === 1) {
      const day = ((report.hourlySpendInr[row.key] ||= {})[window.date] ||= Array(24).fill(0)); day[bucket] += converted;
    } else if (cost > 0) row.hourlySpendUnavailable = true;
  }
  report.campaigns = [...rows.values()];
  report.warnings = [...warnings];
  if (report.account.error && !warnings.size) report.warnings.push(report.account.error);
  return report;
}
export async function readGoogleSpend(funnel: AcquisitionFunnel, start: string, end: string, mode: TrackingDayMode, rate: number): Promise<GoogleSpendReport> {
  validateGoogleRange(start, end);
  const results = await Promise.all(GOOGLE_ADS_CUSTOMERS.map(async id => {
    try { const raw = await snapshot(id, shift(start, -1), shift(end, 2)); return { report: aggregateGoogleSnapshot(raw, funnel, start, end, mode, rate), fetchedAt: raw.fetchedAt }; }
    catch (error) { return { report: { account: { id: `google:${id}`, name: `Google · ${id}`, currency: '', timezone: '', error: error instanceof Error ? error.message : 'Google Ads unavailable' }, campaigns: [], dailySpendInr: {}, hourlySpendInr: {}, warnings: [error instanceof Error ? error.message : 'Google Ads unavailable'] } satisfies GoogleAccountReport, fetchedAt: new Date().toISOString() }; }
  }));
  return googleSpendReport(results);
}
export function googleSpendReport(results: {report: GoogleAccountReport; fetchedAt: string}[]): GoogleSpendReport {
  return { failedAccountIds: results.filter(r => r.report.account.error).map(r => r.report.account.id), accounts: results.map(r => r.report).filter(r => r.campaigns.length > 0), complete: results.every(r => !r.report.account.error), warnings: results.flatMap(r => r.report.warnings), fetchedAt: results.map(r => r.fetchedAt).sort()[0] };
}
/** Saved Google campaign IDs/names only. A click ID by itself cannot identify a campaign. */
export function matchGoogleCampaign(campaigns: TrackingCampaign[], campaign: string | null | undefined) {
  if (!campaign) return undefined;
  const matches = campaigns.filter(row => row.network === 'google' && (row.campaignId === campaign || campaignNameKey(row.campaignName) === campaignNameKey(campaign)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function googleSpendForDay(report: GoogleSpendReport, date: string) {
  if (!report.complete) return null;
  return report.accounts.reduce((sum, account) => ({
    total: sum.total + (account.dailySpendInr[date]?.total || 0),
    indian: sum.indian + (account.dailySpendInr[date]?.indian || 0),
  }), { total: 0, indian: 0 });
}

/** The selected-day endpoint uses campaign -> 24 values, unlike the range snapshot. */
export function googleHourlySpendForDay(report: GoogleSpendReport | null, day: string): Record<string, number[]> {
  return Object.fromEntries((report?.accounts || []).flatMap(account => Object.entries(account.hourlySpendInr).map(([key, dates]) => [key, dates[day] || Array(24).fill(0)])));
}
