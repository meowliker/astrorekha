import { getMetaAccountWindowForRequest, type MetaAccountCredential } from "@/lib/meta-ad-accounts";
import { businessDayStartUtc, type TrackingCampaign } from "@/lib/tracking-dashboard";
import { bufferedMetaRange, campaignHourlySpendForBusinessDays, campaignSpendForBusinessDays, metaPurchasesMatchBusinessWindow, normalizeHourlySpendToDailyTotals, type CampaignSpendRow } from "@/lib/tracking-meta-spend";

const META_BASE = "https://graph.facebook.com/v21.0";
const PURCHASE_ACTIONS = ["website_purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"];

type MetaAction = { action_type?: string; value?: string | number };
type MetaInsight = {
  campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string;
  reach?: string; clicks?: string; inline_link_clicks?: string;
  actions?: MetaAction[]; action_values?: MetaAction[];
};
type MetaCampaign = {
  id: string; name?: string; objective?: string; effective_status?: string;
  daily_budget?: string; lifetime_budget?: string;
};
type MetaPage<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const action = (items: MetaAction[] | undefined, kinds: string[]) => {
  for (const kind of kinds) {
    const found = items?.find((item) => item.action_type === kind);
    if (found) return number(found.value);
  }
  return 0;
};

async function metaJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    // Never include the request URL: it contains the server-side Meta access token.
    throw new Error(String(payload?.error?.message || `Meta HTTP ${response.status}`));
  }
  return payload as T;
}

async function collectPages<T>(url: string, limitPages: number): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let next: string | undefined = url;
  let pages = 0;
  while (next && pages < limitPages) {
    pages++;
    const payload: MetaPage<T> = await metaJson<MetaPage<T>>(next);
    rows.push(...(payload.data || []));
    next = payload.paging?.next;
  }
  return { rows, truncated: Boolean(next) };
}

/** Fetch each account-calendar day separately: Meta's multi-day hourly breakdown can differ from its single-day numbers. */
export async function fetchMetaTrackingExactHourlySpend(
  credential: MetaAccountCredential,
  day: string,
  usdInrRate: number,
): Promise<{ hourlySpendInr: Record<string, number[]> }> {
  const empty = { hourlySpendInr: {} };
  const accountId = credential.accountId;
  const accountUrl = `${META_BASE}/act_${accountId}`;
  const metadata = await metaJson<{ currency?: string; timezone_offset_hours_utc?: number }>(
    `${accountUrl}?${new URLSearchParams({ access_token: credential.accessToken, fields: "currency,timezone_offset_hours_utc" })}`,
  );
  const offset = Number(metadata.timezone_offset_hours_utc);
  if (!Number.isFinite(offset)) throw new Error("Meta account timezone is unavailable");
  const currency = String(metadata.currency || "INR").toUpperCase();
  const multiplier = currency === "INR" ? 1 : currency === "USD" ? usdInrRate : null;
  if (multiplier == null) return empty;
  const window = getMetaAccountWindowForRequest(credential, day, day, "business_1130_ist");
  if (!window) return empty;
  const businessStart = Date.parse(businessDayStartUtc(day));
  const start = Math.max(businessStart, window.startMillis);
  const end = Math.min(businessStart + 86_400_000, window.endMillis, Date.now());
  if (end <= start) return empty;
  const accountDate = (time: number) => new Date(time + offset * 3_600_000).toISOString().slice(0, 10);
  const first = accountDate(start);
  const last = accountDate(end - 1);
  const accountDays = first === last ? [first] : [first, last];
  const results = await Promise.all(accountDays.map(async (accountDay) => {
    const params = new URLSearchParams({
      access_token: credential.accessToken, fields: "campaign_id,date_start,spend", level: "campaign",
      time_increment: "1", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify({ since: accountDay, until: accountDay }), limit: "5000",
    });
    const response = await collectPages<CampaignSpendRow>(`${accountUrl}/insights?${params}`, 20);
    if (response.truncated) throw new Error(`Meta hourly spend is incomplete for ${accountDay}`);
    return response.rows;
  }));
  const base = { hourly: results.flat(), daily: [], start: day, end: day,
    timezoneOffsetHoursUtc: offset, accountWindow: window, nowMillis: Date.now() };
  const metricRows = () => {
    const rows = campaignHourlySpendForBusinessDays({ ...base, metric: "spend" });
    return Object.fromEntries(Array.from(rows, ([campaignId, days]) => [
      `meta:${accountId}:${campaignId}`, (days[day] || Array(24).fill(0)).map((value) => value * multiplier),
    ]));
  };
  return { hourlySpendInr: metricRows() };
}

export async function fetchMetaTrackingAccount(
  credential: MetaAccountCredential,
  dates: { start: string; end: string },
  usdInrRate: number
): Promise<{
  account: { id: string; name: string; currency: string; timezone: string | null; error?: string };
  campaigns: TrackingCampaign[];
  dailySpendInr: Record<string, { total: number; indian: number }>;
  hourlySpendInr: Record<string, Record<string, number[]>>;
  warnings: string[];
}> {
  const accountId = credential.accountId;
  const accountUrl = `${META_BASE}/act_${accountId}`;
  const fallbackName = credential.label || `Ad account ${accountId}`;

  try {
    const metadata = await metaJson<{ name?: string; currency?: string; timezone_name?: string; timezone_offset_hours_utc?: number }>(
      `${accountUrl}?${new URLSearchParams({ access_token: credential.accessToken, fields: "name,currency,timezone_name,timezone_offset_hours_utc" })}`
    );
    const currency = String(metadata.currency || "INR").toUpperCase();
    const accountName = metadata.name || fallbackName;
    const account = { id: accountId, name: accountName, currency, timezone: metadata.timezone_name || null };

    const insightParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
      level: "campaign",
      time_range: JSON.stringify({ since: dates.start, until: dates.end }),
      limit: "200",
    });
    const campaignParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget",
      limit: "200",
    });
    const buffered = bufferedMetaRange(dates.start, dates.end);
    const hourlyParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "campaign_id,date_start,spend,inline_link_clicks",
      level: "campaign",
      time_increment: "1",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify(buffered),
      limit: "5000",
    });
    const dailyParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "campaign_id,date_start,spend",
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify(buffered),
      limit: "5000",
    });
    const [insights, metadataRows, hourlySpend, dailySpend] = await Promise.all([
      collectPages<MetaInsight>(`${accountUrl}/insights?${insightParams}`, 20),
      collectPages<MetaCampaign>(`${accountUrl}/campaigns?${campaignParams}`, 20),
      collectPages<CampaignSpendRow>(`${accountUrl}/insights?${hourlyParams}`, 20),
      collectPages<CampaignSpendRow>(`${accountUrl}/insights?${dailyParams}`, 20),
    ]);
    const warnings: string[] = [];
    if (insights.truncated) warnings.push(`${accountName}: Meta insights exceeded 4,000 campaigns; narrow the date range.`);
    if (metadataRows.truncated) warnings.push(`${accountName}: campaign metadata exceeded 4,000 rows; some statuses may be missing.`);
    if (hourlySpend.truncated || dailySpend.truncated) throw new Error(`Hourly campaign spend is incomplete for ${accountName}; narrow the date range.`);
    if (!hourlySpend.rows.length && dailySpend.rows.some((row) => number(row.spend) > 0)) {
      throw new Error(`Hourly campaign spend is unavailable for ${accountName}; spend cannot match the Profit Sheet yet.`);
    }
    const offset = Number(metadata.timezone_offset_hours_utc);
    if (!Number.isFinite(offset)) throw new Error(`Meta did not return the timezone offset for ${accountName}.`);
    const accountWindow = getMetaAccountWindowForRequest(credential, dates.start, dates.end, "business_1130_ist");
    if (!accountWindow) throw new Error(`No active reporting window for ${accountName}.`);
    const metaPurchaseWindowAligned = metaPurchasesMatchBusinessWindow(metadata.timezone_name, accountWindow, dates);
    const normalizedHourly = normalizeHourlySpendToDailyTotals(hourlySpend.rows, dailySpend.rows);
    const spendByCampaign = campaignSpendForBusinessDays({
      hourly: normalizedHourly, daily: dailySpend.rows, start: dates.start, end: dates.end,
      timezoneOffsetHoursUtc: offset, accountWindow, nowMillis: Date.now(),
    });
    const hourlyByCampaign = campaignHourlySpendForBusinessDays({
      hourly: normalizedHourly, daily: dailySpend.rows, start: dates.start, end: dates.end,
      timezoneOffsetHoursUtc: offset, accountWindow, nowMillis: Date.now(),
    });
    const clicksByCampaign = campaignHourlySpendForBusinessDays({
      hourly: normalizedHourly, daily: [], start: dates.start, end: dates.end,
      timezoneOffsetHoursUtc: offset, accountWindow, nowMillis: Date.now(), metric: "inline_link_clicks",
    });
    const multiplier = currency === "INR" ? 1 : currency === "USD" ? usdInrRate : null;
    const hourlySpendInr: Record<string, Record<string, number[]>> = {};
    if (multiplier != null) for (const [id, days] of hourlyByCampaign) {
      hourlySpendInr[`meta:${accountId}:${id}`] = Object.fromEntries(Object.entries(days).map(([day, values]) => [day, values.map((value) => value * multiplier)]));
    }
    const dailySpendInr: Record<string, { total: number; indian: number }> = {};
    for (let day = dates.start; day <= dates.end; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      const daily = campaignSpendForBusinessDays({ hourly: normalizedHourly, daily: dailySpend.rows,
        start: day, end: day, timezoneOffsetHoursUtc: offset, accountWindow, nowMillis: Date.now() });
      const total = Array.from(daily.values()).reduce((sum, spend) => sum + spend, 0) * (currency === "USD" ? usdInrRate : 1);
      dailySpendInr[day] = { total: currency === "INR" || currency === "USD" ? total : 0, indian: currency === "INR" ? total : 0 };
    }
    const byId = new Map<string, TrackingCampaign>();

    function baseCampaign(id: string, name: string): TrackingCampaign {
      return {
        key: `meta:${accountId}:${id}`, accountId, accountName, currency,
        campaignId: id, campaignName: name, objective: null, status: null,
        dailyBudget: null, lifetimeBudget: null,
        spend: 0, spendInr: currency === "INR" || currency === "USD" ? 0 : null,
        metaCalendarSpend: 0,
        impressions: 0, reach: 0, clicks: 0, linkClicks: 0, businessLinkClicks: 0,
        landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0,
        metaPurchaseValue: 0, metaPurchaseWindowAligned, leads: 0, orders: 0, grossRevenue: 0,
        refunds: 0, refundAmount: 0, revenue: 0,
        utmSources: [], utmMediums: [], utmTerms: [], utmContents: [],
        attribution: "none", adBreakdown: [],
      };
    }

    for (const campaign of metadataRows.rows) {
      if (!campaign.id) continue;
      const row = baseCampaign(campaign.id, campaign.name || campaign.id);
      row.objective = campaign.objective || null;
      row.status = campaign.effective_status || null;
      row.dailyBudget = campaign.daily_budget ? number(campaign.daily_budget) / 100 : null;
      row.lifetimeBudget = campaign.lifetime_budget ? number(campaign.lifetime_budget) / 100 : null;
      byId.set(campaign.id, row);
    }

    for (const insight of insights.rows) {
      const id = String(insight.campaign_id || "").trim();
      if (!id) continue;
      const row = byId.get(id) || baseCampaign(id, insight.campaign_name || id);
      row.campaignName = insight.campaign_name || row.campaignName;
      // Other Meta insight metrics still use the account's calendar-day attribution window.
      row.metaCalendarSpend = (row.metaCalendarSpend || 0) + number(insight.spend);
      row.impressions += number(insight.impressions);
      row.reach += number(insight.reach);
      row.clicks += number(insight.clicks);
      row.linkClicks += number(insight.inline_link_clicks);
      row.landingPageViews += action(insight.actions, ["landing_page_view"]);
      row.addToCarts += action(insight.actions, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"]);
      row.checkouts += action(insight.actions, ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"]);
      row.metaPurchases += action(insight.actions, PURCHASE_ACTIONS);
      row.metaPurchaseValue += action(insight.action_values, PURCHASE_ACTIONS);
      row.leads += action(insight.actions, ["lead", "offsite_conversion.fb_pixel_lead"]);
      byId.set(id, row);
    }
    for (const [id, spend] of spendByCampaign) {
      const row = byId.get(id) || baseCampaign(id, id);
      row.spend = spend;
      row.spendInr = currency === "INR" ? spend : currency === "USD" ? spend * usdInrRate : null;
      byId.set(id, row);
    }
    for (const [id, days] of clicksByCampaign) {
      const row = byId.get(id) || baseCampaign(id, id);
      row.businessLinkClicks = Object.values(days).flat().reduce((sum, value) => sum + value, 0);
      byId.set(id, row);
    }
    return { account, campaigns: Array.from(byId.values()), dailySpendInr, hourlySpendInr, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta request failed";
    return { account: { id: accountId, name: fallbackName, currency: "INR", timezone: null, error: message }, campaigns: [], dailySpendInr: {}, hourlySpendInr: {}, warnings: [`${fallbackName}: ${message}`] };
  }
}
