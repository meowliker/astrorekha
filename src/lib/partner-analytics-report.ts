import { google, type analyticsdata_v1beta as GA } from "googleapis";
import type { ViewerPermissions } from "@/lib/partner-analytics-access";
import { partnerFunnels, type PartnerFunnel } from "./partner-funnels";
import { previousAnalyticsRange, shiftAnalyticsDate, type AnalyticsRange } from "./partner-analytics-period";

const metricNames = { traffic: "sessions", purchases: "ecommercePurchases", revenue: "purchaseRevenue" } as const;
export type AnalyticsMetric = keyof typeof metricNames;
export type AnalyticsValues = Partial<Record<AnalyticsMetric, number | null>>;
type ReportRow = { label: string; values: AnalyticsValues };

export type PartnerFunnelAnalytics = {
  key: PartnerFunnel;
  comparison: (ReportRow & { previous: AnalyticsValues })[];
  details: {
    channels: ReportRow[];
    daily: { date: string; groups: AnalyticsValues[] }[];
    landingPages: { path: string; groups: AnalyticsValues[] }[];
    events: { label: string; count: number | null }[];
  } | null;
};

export type PartnerAnalyticsReport = {
  metrics: AnalyticsMetric[];
  previousRange: AnalyticsRange;
  funnels: PartnerFunnelAnalytics[];
  thresholded: boolean;
};

const channels = new Set([
  "Direct", "Organic Search", "Paid Search", "Organic Social", "Paid Social", "Referral",
  "Email", "Cross-network", "Display", "Paid Video", "Organic Video", "Paid Shopping",
  "Organic Shopping", "Affiliates", "Audio", "SMS", "Mobile Push Notifications", "Unassigned", "Paid Other",
]);

const pathVariants = (path: string) => path === "/" ? [path] : [path, `${path}/`];
const landingPages = partnerFunnels.flatMap(funnel => funnel.paths.flatMap(pathVariants));
const trackingEvents: Record<PartnerFunnel, Record<string, string>> = {
  astrorekha: { quiz_start: "Quiz starts", quiz_complete: "Quiz completions", begin_checkout: "Checkout starts" },
  soulmate: { soulmate_chat_start: "Chat starts", soulmate_chat_complete: "Chat completions", begin_checkout: "Checkout starts" },
  "us-soulmate": { us_soulmate_chat_start: "Chat starts", us_soulmate_chat_complete: "Chat completions", begin_checkout: "Checkout starts" },
};

type Filter = GA.Schema$FilterExpression;
const oneOf = (fieldName: string, values: string[], caseSensitive = false): Filter =>
  ({ filter: { fieldName, inListFilter: { values, caseSensitive } } });
const all = (...expressions: Filter[]): Filter => ({ andGroup: { expressions } });
const any = (...expressions: Filter[]): Filter => ({ orGroup: { expressions } });
const not = (notExpression: Filter): Filter => ({ notExpression });

const googleAds = any(
  oneOf("sessionSourcePlatform", ["Google Ads"]),
  all(oneOf("sessionSource", ["google", "google_ads", "googleads"]),
    oneOf("sessionMedium", ["cpc", "ppc", "paid", "paidsearch", "paid_search", "cpm"])),
);
const metaAds = all(
  oneOf("sessionSource", ["meta", "facebook", "instagram", "fb", "ig", "facebook.com", "instagram.com", "m.facebook.com", "l.facebook.com", "l.instagram.com"]),
  any(
    oneOf("sessionDefaultChannelGroup", ["Paid Social"]),
    oneOf("sessionMedium", ["cpc", "ppc", "paid", "paid_social", "paid-social", "paidsocial", "paid social", "cpm"]),
  ),
);

const includeRealTraffic = not(oneOf("sessionSource", ["codex_qa"]));
const thresholded = (report: GA.Schema$RunReportResponse) => report.metadata?.subjectToThresholding === true;
const rowKey = (row: GA.Schema$Row) => (row.dimensionValues ?? []).map(item => item.value).join("|");
const rowsByKey = (report: GA.Schema$RunReportResponse) => new Map((report.rows ?? []).map(row => [rowKey(row), row]));

function sumMetric(rows: GA.Schema$Row[], index: number, missing: number | null): number | null {
  if (!rows.length) return missing;
  let sum = 0;
  for (const row of rows) {
    const value = row.metricValues?.[index]?.value;
    if (value == null || !Number.isFinite(Number(value))) return null;
    sum += Number(value);
  }
  return sum;
}

function metricValues(rows: GA.Schema$Row[], metrics: AnalyticsMetric[], unavailable: boolean): AnalyticsValues {
  return Object.fromEntries(metrics.map((key, index) => [key, sumMetric(rows, index, unavailable ? null : 0)]));
}

function matchingRows(rows: Map<string, GA.Schema$Row>, paths: string[], suffix: string) {
  return paths.flatMap(path => {
    const row = rows.get(`${path}|${suffix}`);
    return row ? [row] : [];
  });
}

export async function readPartnerAnalytics(permissions: ViewerPermissions, range: AnalyticsRange, today?: string): Promise<PartnerAnalyticsReport> {
  const metrics = (Object.keys(metricNames) as AnalyticsMetric[]).filter(key => permissions[key]);
  const todayOnly = range.start === today;
  const previousRange = previousAnalyticsRange(range);
  if (!metrics.length) return { metrics, previousRange, funnels: [], thresholded: false };

  const propertyId = process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!propertyId || !/^\d+$/.test(propertyId) || !clientEmail || !privateKey) throw new Error("GA4 reporting unavailable");
  const property = `properties/${propertyId}`;
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const api = google.analyticsdata({ version: "v1beta", auth });
  const dateRange = ({ start, end }: AnalyticsRange, name?: string) => ({ startDate: start, endDate: end, name });
  const base: GA.Schema$RunReportRequest = {
    dateRanges: [dateRange(range)],
    metrics: metrics.map(key => ({ name: metricNames[key] })),
    ...(permissions.revenue ? { currencyCode: "INR" } : {}),
  };

  async function batch(requests: GA.Schema$RunReportRequest[]) {
    const { data } = await api.properties.batchRunReports({ property, requestBody: { requests } }, { timeout: 10000 });
    if (data.reports?.length !== requests.length) throw new Error("GA4 report incomplete");
    return data.reports;
  }

  const groups = [
    { label: "Google Ads", filter: googleAds },
    ...(permissions.channels ? [
      { label: "Meta Ads", filter: all(not(googleAds), metaAds) },
      { label: "Other traffic", filter: not(any(googleAds, metaAds)) },
    ] : [{ label: "All other traffic", filter: not(googleAds) }]),
  ];
  const scope = all(includeRealTraffic, oneOf("landingPage", landingPages, true));
  const totals = groups.map(({ filter }) => ({
    ...base,
    dimensions: [{ name: "landingPage" }],
    dateRanges: [dateRange(range, "selected"), dateRange(previousRange, "prior")],
    dimensionFilter: all(scope, filter),
  }));
  const channelQuery = {
    ...base, dimensions: [{ name: "landingPage" }, { name: "sessionDefaultChannelGroup" }],
    dimensionFilter: scope,
  };
  const eventNames = Array.from(new Set(Object.values(trackingEvents).flatMap(Object.keys)));
  const eventQuery = {
    dateRanges: base.dateRanges, dimensions: [{ name: "landingPage" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: all(scope, oneOf("eventName", eventNames, true)),
  };
  const dailyQueries = groups.map(({ filter }) => ({
    ...base, dimensions: [{ name: "landingPage" }, { name: "date" }],
    dimensionFilter: all(scope, filter),
  }));
  const [overview, dailyReports] = await Promise.all([
    batch([...totals, ...(permissions.channels ? [channelQuery, ...(permissions.traffic ? [eventQuery] : [])] : [])]),
    permissions.channels ? batch(dailyQueries) : Promise.resolve([]),
  ]);

  const totalsRows = overview.slice(0, groups.length).map(rowsByKey);
  const dailyRows = dailyReports.map(rowsByKey);
  const channelReport = overview[groups.length];
  const eventReport = overview[groups.length + 1];
  const eventRows = eventReport && rowsByKey(eventReport);
  const reportDates: string[] = [];
  for (let date = range.end; date >= range.start; date = shiftAnalyticsDate(date, -1)) reportDates.push(date);

  const funnels = partnerFunnels.map(({ key, paths }): PartnerFunnelAnalytics => {
    const variants = paths.flatMap(pathVariants);
    const comparison = groups.map(({ label }, index) => ({
      label,
      values: metricValues(matchingRows(totalsRows[index], variants, "selected"), metrics, todayOnly || thresholded(overview[index])),
      previous: metricValues(matchingRows(totalsRows[index], variants, "prior"), metrics, thresholded(overview[index])),
    }));
    if (!permissions.channels) return { key, comparison, details: null };

    const breakdown = new Map<string, GA.Schema$Row[]>();
    for (const row of channelReport.rows ?? []) {
      const [path, name] = row.dimensionValues?.map(item => item.value) ?? [];
      if (!path || !variants.includes(path)) continue;
      const label = name && channels.has(name) ? name : "Other channels";
      const matching = breakdown.get(label) ?? [];
      matching.push(row);
      breakdown.set(label, matching);
    }

    return {
      key,
      comparison,
      details: {
        channels: [...breakdown].map(([label, rows]) => ({
          label, values: metricValues(rows, metrics, thresholded(channelReport)),
        })).sort((a, b) => a.label.localeCompare(b.label)),
        daily: reportDates.map(date => ({
          date,
          groups: dailyRows.map((rows, index) => metricValues(
            matchingRows(rows, variants, date.replaceAll("-", "")),
            metrics, date === today || thresholded(dailyReports[index]),
          )),
        })),
        landingPages: paths.map(path => ({
          path,
          groups: totalsRows.slice(0, 2).map((rows, index) => metricValues(
            matchingRows(rows, pathVariants(path), "selected"), metrics, todayOnly || thresholded(overview[index]),
          )),
        })),
        events: eventRows ? Object.entries(trackingEvents[key]).map(([event, label]) => ({
          label,
          count: sumMetric(matchingRows(eventRows, variants, event), 0, todayOnly || thresholded(eventReport) ? null : 0),
        })) : [],
      },
    };
  });

  return { metrics, previousRange, funnels, thresholded: [...overview, ...dailyReports].some(thresholded) };
}
