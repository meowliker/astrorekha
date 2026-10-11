import { getMetaAccountWindowForRequest, type MetaAccountCredential } from "@/lib/meta-ad-accounts";
import { bufferedMetaRange, campaignSpendForBusinessDays, type CampaignSpendRow } from "@/lib/tracking-meta-spend";
import { businessDayStartUtc, type TrackingActivity, type TrackingChild } from "@/lib/tracking-dashboard";

const BASE = "https://graph.facebook.com/v21.0";
type Page<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };
type Action = { action_type?: string; value?: string | number };
type Insight = { adset_id?: string; ad_id?: string; spend?: string; impressions?: string; reach?: string; clicks?: string; inline_link_clicks?: string; actions?: Action[]; action_values?: Action[] };
type MetaObject = { id: string; name?: string; campaign_id?: string; adset_id?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string };
type RawActivity = { event_time?: string; event_type?: string; translated_event_type?: string; object_id?: string; object_name?: string; object_type?: string; actor_name?: string; extra_data?: string | Record<string, unknown> };
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const action = (items: Action[] | undefined, kinds: string[]) => kinds.reduce((value, kind) => value || numeric(items?.find((item) => item.action_type === kind)?.value), 0);

function activityLevel(item: RawActivity): string {
  const label = (item.translated_event_type || "").toLowerCase();
  if (/ad set|adset/.test(label)) return "Ad set";
  if (/\bad\b/.test(label)) return "Ad";
  if (/campaign/.test(label)) return "Campaign";
  // Meta's activity object types use its internal hierarchy names.
  const kind = (item.object_type || "").toUpperCase();
  if (kind === "CAMPAIGN_GROUP") return "Campaign";
  if (kind === "CAMPAIGN") return "Ad set";
  if (kind === "ADGROUP" || kind === "AD") return "Ad";
  return kind.replace(/_/g, " ") || "Account";
}

function activityValue(value: unknown, currency: string, budget: boolean): string {
  if (value == null) return "—";
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.map((item) => activityValue(item, currency, budget)).join(", ");
    const entries = Object.entries(value as Record<string, unknown>);
    const budgetEntry = entries.find(([key]) => /^(daily|lifetime)_budget$|^amount$/i.test(key));
    if (budgetEntry) return `${budgetEntry[0].replace(/_/g, " ")}: ${activityValue(budgetEntry[1], currency, true)}`;
    return entries.map(([key, item]) => `${key.replace(/_/g, " ")}: ${activityValue(item, currency, budget)}`).join(", ") || "—";
  }
  if (budget && Number.isFinite(Number(value)) && String(value).trim() !== "") {
    const amount = Number(value) / 100;
    return currency ? new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount) : `${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (account currency)`;
  }
  return String(value);
}

function budgetAmount(value: unknown, currency: string, minorUnits = false): string | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const fields = value as Record<string, unknown>;
    const ownCurrency = typeof fields.currency === "string" && /^[A-Z]{3}$/.test(fields.currency) ? fields.currency : currency;
    for (const key of ["old_value", "new_value", "value", "amount", "daily_budget", "lifetime_budget", "budget"]) {
      if (fields[key] != null) return budgetAmount(fields[key], ownCurrency, /budget$/.test(key));
    }
    return null;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const raw = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(raw)) return null;
  const amount = minorUnits && !/[₹$€£]/.test(text) ? raw / 100 : raw;
  const code = currency || (text.includes("₹") ? "INR" : text.includes("$") ? "USD" : text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : "");
  return code ? new Intl.NumberFormat("en-IN", { style: "currency", currency: code, useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) : amount.toLocaleString("en-IN", { useGrouping: false, maximumFractionDigits: 2 });
}

function activityDetail(extra: Record<string, unknown>, item: RawActivity, currency: string): string {
  const budget = /budget/i.test(`${item.event_type || ""} ${item.translated_event_type || ""}`);
  const oldValue = extra.old_value ?? extra.old_budget;
  const newValue = extra.new_value ?? extra.new_budget;
  if (oldValue == null && newValue == null) return "";
  if (budget) {
    const before = budgetAmount(oldValue, currency, extra.old_value == null);
    const after = budgetAmount(newValue, currency, extra.new_value == null);
    if (before || after) return `${before || "—"} → ${after || "—"}`;
  }
  return `${activityValue(oldValue, currency, budget)} → ${activityValue(newValue, currency, budget)}`;
}

async function pages<T>(url: string, maxPages = 20): Promise<T[]> {
  const rows: T[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < maxPages; page++) {
    const response = await fetch(next, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const result = await response.json().catch(() => null) as Page<T> | null;
    if (!response.ok || result?.error) throw new Error(result?.error?.message || `Meta HTTP ${response.status}`);
    rows.push(...(result?.data || []));
    next = result?.paging?.next;
  }
  if (next) throw new Error("Meta detail exceeded the page limit. Narrow the date range.");
  return rows;
}

function url(path: string, token: string, params: Record<string, string>) {
  return `${BASE}/${path}?${new URLSearchParams({ access_token: token, ...params })}`;
}

function emptyChild(object: MetaObject, level: "adset" | "ad", account: { id: string; name: string; currency: string }, campaignId: string): TrackingChild {
  const id = object.id;
  return {
    level, id, parentId: level === "adset" ? campaignId : object.adset_id || "",
    key: `meta:${account.id}:${level}:${id}`, accountId: account.id, accountName: account.name, currency: account.currency,
    campaignId, campaignName: object.name || id, objective: null, status: object.effective_status || null,
    dailyBudget: object.daily_budget ? numeric(object.daily_budget) / 100 : null,
    lifetimeBudget: object.lifetime_budget ? numeric(object.lifetime_budget) / 100 : null,
    spend: 0, spendInr: account.currency === "INR" || account.currency === "USD" ? 0 : null,
    metaCalendarSpend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
    landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0, metaPurchaseValue: 0, leads: 0,
    orders: 0, grossRevenue: 0, refunds: 0, refundAmount: 0, revenue: 0,
    utmSources: [], utmMediums: [], utmTerms: [], utmContents: [], attribution: "none", adBreakdown: [],
  };
}

export async function fetchMetaTrackingChildren(credential: MetaAccountCredential, campaignId: string, dates: { start: string; end: string }, rate: number) {
  const accountId = credential.accountId;
  const accountBase = `act_${accountId}`;
  const token = credential.accessToken;
  const meta = await fetch(url(accountBase, token, { fields: "name,currency,timezone_offset_hours_utc" }), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const metaData = await meta.json() as { name?: string; currency?: string; timezone_offset_hours_utc?: number; error?: { message?: string } };
  if (!meta.ok || metaData.error) throw new Error(metaData.error?.message || "Unable to read Meta account");
  const currency = String(metaData.currency || "INR").toUpperCase();
  const offset = Number(metaData.timezone_offset_hours_utc);
  if (!Number.isFinite(offset)) throw new Error("Meta account timezone is unavailable");
  const account = { id: accountId, name: metaData.name || credential.label || accountId, currency };
  const accountWindow = getMetaAccountWindowForRequest(credential, dates.start, dates.end, "business_1130_ist");
  if (!accountWindow) return { adsets: [] as TrackingChild[], ads: [] as TrackingChild[] };
  const window = accountWindow;
  const buffered = bufferedMetaRange(dates.start, dates.end);

  async function levelRows(level: "adset" | "ad") {
    const idField = level === "adset" ? "adset_id" : "ad_id";
    const metadataFields = level === "adset" ? "id,name,campaign_id,effective_status,daily_budget,lifetime_budget" : "id,name,adset_id,campaign_id,effective_status";
    const insight = (fields: string, range: { since: string; until: string }, hourly: boolean) => url(`${campaignId}/insights`, token, {
      fields, level, time_range: JSON.stringify(range), limit: "5000",
      ...(hourly ? { time_increment: "1", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" } : {}),
    });
    const [objects, metrics, hourly, daily] = await Promise.all([
      pages<MetaObject>(url(`${campaignId}/${level === "adset" ? "adsets" : "ads"}`, token, { fields: metadataFields, limit: "500" })),
      pages<Insight>(insight(`${idField},spend,impressions,reach,clicks,inline_link_clicks,actions,action_values`, { since: dates.start, until: dates.end }, false)),
      pages<CampaignSpendRow & Record<string, string>>(insight(`${idField},date_start,spend`, buffered, true)),
      pages<CampaignSpendRow & Record<string, string>>(insight(`${idField},date_start,spend`, buffered, false)),
    ]);
    const rows = new Map(objects.map((object) => [object.id, emptyChild(object, level, account, campaignId)]));
    for (const metric of metrics) {
      const id = metric[idField];
      if (!id) continue;
      const row = rows.get(id) || emptyChild({ id }, level, account, campaignId);
      row.metaCalendarSpend = (row.metaCalendarSpend || 0) + numeric(metric.spend);
      row.impressions += numeric(metric.impressions); row.reach += numeric(metric.reach);
      row.clicks += numeric(metric.clicks); row.linkClicks += numeric(metric.inline_link_clicks);
      row.landingPageViews += action(metric.actions, ["landing_page_view"]);
      row.addToCarts += action(metric.actions, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"]);
      row.checkouts += action(metric.actions, ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"]);
      row.metaPurchases += action(metric.actions, ["website_purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"]);
      row.metaPurchaseValue += action(metric.action_values, ["website_purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"]);
      row.leads += action(metric.actions, ["lead", "offsite_conversion.fb_pixel_lead"]);
      rows.set(id, row);
    }
    const keyed = (items: Array<CampaignSpendRow & Record<string, string>>) => items.map((item) => ({ ...item, campaign_id: item[idField] }));
    const spend = campaignSpendForBusinessDays({ hourly: keyed(hourly), daily: keyed(daily), start: dates.start, end: dates.end,
      timezoneOffsetHoursUtc: offset, accountWindow: window, nowMillis: Date.now() });
    for (const [id, value] of spend) {
      const row = rows.get(id) || emptyChild({ id }, level, account, campaignId);
      row.spend = value;
      row.spendInr = currency === "INR" ? value : currency === "USD" ? value * rate : null;
      rows.set(id, row);
    }
    return Array.from(rows.values());
  }
  const [adsets, ads] = await Promise.all([levelRows("adset"), levelRows("ad")]);
  return { adsets, ads };
}

export async function fetchMetaTrackingActivities(credential: MetaAccountCredential, dates: { start: string; end: string }): Promise<TrackingActivity[]> {
  const since = new Date(`${dates.start}T11:30:00+05:30`).toISOString();
  const until = new Date(Date.parse(`${dates.end}T11:30:00+05:30`) + 86_400_000).toISOString();
  const [raw, currency] = await Promise.all([pages<RawActivity>(url(`act_${credential.accountId}/activities`, credential.accessToken, {
    fields: "event_time,event_type,translated_event_type,object_id,object_name,object_type,actor_name,extra_data",
    since, until, limit: "100",
  }), 20), fetch(url(`act_${credential.accountId}`, credential.accessToken, { fields: "currency" }), { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .then(async (response) => {
      const account = await response.json().catch(() => ({})) as { currency?: string };
      return response.ok && /^[A-Z]{3}$/.test(account.currency || "") ? account.currency! : "";
    }).catch(() => "")]);
  return raw.filter((item) => /^(create_|delete_|update_|edit_|merge_|ad_account_(update|remove|reset)_|campaign_ended)/.test(item.event_type || "")).map((item, index) => {
    let extra: Record<string, unknown> = {};
    try { extra = typeof item.extra_data === "string" ? JSON.parse(item.extra_data) : item.extra_data || {}; } catch { /* Meta sometimes returns non-JSON detail. */ }
    const detail = activityDetail(extra, item, currency);
    return { id: `${credential.accountId}:${item.event_time || ""}:${item.object_id || ""}:${index}`,
      accountId: credential.accountId, accountName: credential.label || credential.accountId,
      at: item.event_time || "", actor: item.actor_name || "Meta", action: item.translated_event_type || (item.event_type || "Changed").replace(/_/g, " "),
      object: item.object_name || item.object_id || "Ad account", objectType: activityLevel(item), detail };
  });
}

export async function fetchMetaTrackingHourlySpend(credential: MetaAccountCredential, campaignId: string, day: string, rate: number) {
  const token = credential.accessToken;
  const accountResponse = await fetch(url(`act_${credential.accountId}`, token, { fields: "currency,timezone_offset_hours_utc" }), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const account = await accountResponse.json() as { currency?: string; timezone_offset_hours_utc?: number; error?: { message?: string } };
  if (!accountResponse.ok || account.error) throw new Error(account.error?.message || "Meta account unavailable");
  const offset = Number(account.timezone_offset_hours_utc);
  if (!Number.isFinite(offset)) throw new Error("Meta account timezone is unavailable");
  const accountWindow = getMetaAccountWindowForRequest(credential, day, day, "business_1130_ist");
  if (!accountWindow) return { spendInr: Array(24).fill(0) as number[] };
  const buffered = bufferedMetaRange(day, day);
  const rows = await pages<CampaignSpendRow>(url(`${campaignId}/insights`, token, {
    fields: "campaign_id,date_start,spend", level: "campaign", time_increment: "1",
    breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone", time_range: JSON.stringify(buffered), limit: "5000",
  }));
  const start = Date.parse(businessDayStartUtc(day));
  const end = start + 86_400_000;
  const now = Date.now();
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    const hour = Number(row.hourly_stats_aggregated_by_advertiser_time_zone?.match(/^(\d{1,2}):/)?.[1]);
    if (!row.date_start || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const rawStart = Date.parse(`${row.date_start}T00:00:00Z`) + (hour - offset) * 3_600_000;
    const rawEnd = Math.min(rawStart + 3_600_000, now);
    if (rawEnd <= rawStart) continue;
    const clippedStart = Math.max(rawStart, start, accountWindow.startMillis);
    const clippedEnd = Math.min(rawEnd, end, accountWindow.endMillis);
    if (clippedEnd <= clippedStart) continue;
    const spend = numeric(row.spend) * (clippedEnd - clippedStart) / (rawEnd - rawStart);
    for (let bucket = Math.floor((clippedStart - start) / 3_600_000); bucket <= Math.floor((clippedEnd - start - 1) / 3_600_000); bucket++) {
      if (bucket < 0 || bucket >= 24) continue;
      const bucketStart = start + bucket * 3_600_000;
      const overlap = Math.min(clippedEnd, bucketStart + 3_600_000) - Math.max(clippedStart, bucketStart);
      hourly[bucket] += spend * overlap / (clippedEnd - clippedStart);
    }
  }
  const currency = String(account.currency || "INR").toUpperCase();
  const multiplier = currency === "INR" ? 1 : currency === "USD" ? rate : 0;
  return { spendInr: hourly.map((value) => value * multiplier) };
}
