import { google, type analyticsdata_v1beta as GA } from "googleapis";
import type { ViewerPermissions } from "@/lib/partner-analytics-access";
import { previousAnalyticsRange, shiftAnalyticsDate, type AnalyticsRange } from "./partner-analytics-period";

const metricNames = { traffic: "sessions", purchases: "ecommercePurchases", revenue: "purchaseRevenue" } as const;
export type AnalyticsMetric = keyof typeof metricNames;
export type AnalyticsValues = Partial<Record<AnalyticsMetric, number | null>>;
type ReportRow = { label: string; values: AnalyticsValues };

export type PartnerAnalyticsReport = {
  metrics: AnalyticsMetric[];
  comparison: (ReportRow & { previous: AnalyticsValues })[];
  previousRange: AnalyticsRange;
  details: {
    channels: ReportRow[];
    daily: { date: string; groups: AnalyticsValues[] }[];
    landingPages: { path: string; groups: AnalyticsValues[] }[];
    events: { label: string; count: number | null }[];
  } | null;
  thresholded: boolean;
};

const channels = new Set([
  "Direct", "Organic Search", "Paid Search", "Organic Social", "Paid Social", "Referral",
  "Email", "Cross-network", "Display", "Paid Video", "Organic Video", "Paid Shopping",
  "Organic Shopping", "Affiliates", "Audio", "SMS", "Mobile Push Notifications", "Unassigned", "Paid Other",
]);

const landingPages = ["/", "/discover", "/soulmate", "/soulmate/discover", "/us/soulmate", "/us/soulmate/discover"];
const trackingEvents = {
  quiz_start: "Main funnel quiz starts",
  quiz_complete: "Main funnel quiz completions",
  soulmate_chat_start: "Soulmate chat starts",
  soulmate_chat_complete: "Soulmate chat completions",
  us_soulmate_chat_start: "US Soulmate chat starts",
  us_soulmate_chat_complete: "US Soulmate chat completions",
  begin_checkout: "Checkout starts",
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
const dimension = (row: GA.Schema$Row) => row.dimensionValues?.[0]?.value || "";
const numberValue = (value: string | null | undefined, limited: boolean) => {
  const number = value != null ? Number(value) : limited ? NaN : 0;
  return Number.isFinite(number) ? number : null;
};

function metricValues(report: GA.Schema$RunReportResponse, row: GA.Schema$Row | undefined, metrics: AnalyticsMetric[]): AnalyticsValues {
  return Object.fromEntries(metrics.map((key, index) => [
    key, numberValue(row?.metricValues?.[index]?.value, thresholded(report)),
  ]));
}

export async function readPartnerAnalytics(permissions: ViewerPermissions, range: AnalyticsRange): Promise<PartnerAnalyticsReport> {
  const metrics = (Object.keys(metricNames) as AnalyticsMetric[]).filter(key => permissions[key]);
  const previousRange = previousAnalyticsRange(range);
  if (!metrics.length) return { metrics, previousRange, comparison: [], details: null, thresholded: false };

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
  const totals = groups.map(({ filter }) => ({
    ...base,
    dateRanges: [dateRange(range, "selected"), dateRange(previousRange, "prior")],
    dimensionFilter: all(includeRealTraffic, filter),
  }));
  const channelQuery = { ...base, dimensions: [{ name: "sessionDefaultChannelGroup" }], dimensionFilter: includeRealTraffic, limit: "100" };
  const eventQuery = {
    dateRanges: base.dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }],
    dimensionFilter: all(includeRealTraffic, oneOf("eventName", Object.keys(trackingEvents), true)),
  };
  const detailQueries = permissions.channels ? [
    ...groups.map(({ filter }) => ({ ...base, dimensions: [{ name: "date" }], dimensionFilter: all(includeRealTraffic, filter), limit: "366" })),
    ...groups.slice(0, 2).map(({ filter }) => ({
      ...base, dimensions: [{ name: "landingPage" }],
      dimensionFilter: all(includeRealTraffic, filter, oneOf("landingPage", landingPages, true)),
    })),
  ] : [];
  const [overview, detail] = await Promise.all([
    batch([...totals, ...(permissions.channels ? [channelQuery, ...(permissions.traffic ? [eventQuery] : [])] : [])]),
    detailQueries.length ? batch(detailQueries) : Promise.resolve([]),
  ]);
  const comparison = groups.map(({ label }, index) => {
    const report = overview[index];
    return {
      label,
      values: metricValues(report, report.rows?.find(row => dimension(row) === "selected"), metrics),
      previous: metricValues(report, report.rows?.find(row => dimension(row) === "prior"), metrics),
    };
  });

  const result: PartnerAnalyticsReport = {
    metrics, previousRange, comparison, details: null,
    thresholded: [...overview, ...detail].some(thresholded),
  };
  if (!permissions.channels) return result;

  const channelReport = overview[groups.length];
  const breakdown = new Map<string, AnalyticsValues>();
  for (const row of channelReport.rows || []) {
    const name = dimension(row);
    const label = channels.has(name) ? name : "Other channels";
    const next = metricValues(channelReport, row, metrics);
    const previous = breakdown.get(label);
    if (previous) {
      for (const metric of metrics) {
        const a = previous[metric], b = next[metric];
        next[metric] = typeof a === "number" && typeof b === "number" ? a + b : null;
      }
    }
    breakdown.set(label, next);
  }
  const byDimension = detail.map(report => new Map((report.rows || []).map(row => [dimension(row), row])));
  const daily = [];
  for (let date = range.end; date >= range.start; date = shiftAnalyticsDate(date, -1)) {
    const key = date.replaceAll("-", "");
    daily.push({ date, groups: groups.map((_, index) => metricValues(detail[index], byDimension[index].get(key), metrics)) });
  }
  const eventReport = overview[groups.length + 1];
  result.details = {
    channels: [...breakdown].map(([label, values]) => ({ label, values })).sort((a, b) => a.label.localeCompare(b.label)),
    daily,
    landingPages: landingPages.map(path => ({
      path,
      groups: detail.slice(groups.length).map((report, index) => metricValues(report, byDimension[index + groups.length].get(path), metrics)),
    })),
    events: eventReport ? Object.entries(trackingEvents).map(([key, label]) => ({
      label,
      count: numberValue(eventReport.rows?.find(row => dimension(row) === key)?.metricValues?.[0]?.value, thresholded(eventReport)),
    })) : [],
  };
  return result;
}
