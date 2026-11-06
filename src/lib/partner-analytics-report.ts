import { google, type analyticsdata_v1beta as GA } from "googleapis";
import type { ViewerPermissions } from "@/lib/partner-analytics-access";

const metricNames = { traffic: "sessions", purchases: "ecommercePurchases", revenue: "purchaseRevenue" } as const;
type Metric = keyof typeof metricNames;
type ReportRow = { label: string; values: Partial<Record<Metric, number | null>> };
const channels = new Set([
  "Direct", "Organic Search", "Paid Search", "Organic Social", "Paid Social", "Referral",
  "Email", "Cross-network", "Display", "Paid Video", "Organic Video", "Paid Shopping",
  "Organic Shopping", "Affiliates", "Audio", "SMS", "Mobile Push Notifications", "Unassigned", "Paid Other",
]);

const googleAds: GA.Schema$FilterExpression = {
  orGroup: { expressions: [
    { filter: { fieldName: "sessionSourcePlatform", stringFilter: { matchType: "EXACT", value: "Google Ads" } } },
    { andGroup: { expressions: [
      { filter: { fieldName: "sessionSource", inListFilter: { values: ["google", "google_ads", "googleads"] } } },
      { filter: { fieldName: "sessionMedium", inListFilter: { values: ["cpc", "ppc", "paid", "paidsearch", "paid_search", "cpm"] } } },
    ] } },
  ] },
};

const includeRealTraffic: GA.Schema$FilterExpression = {
  notExpression: { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "codex_qa" } } },
};

function values(row: GA.Schema$Row | undefined, metrics: Metric[], thresholded: boolean): ReportRow["values"] {
  return Object.fromEntries(metrics.map((key, index) => {
    const value = row?.metricValues?.[index]?.value;
    const number = value != null ? Number(value) : thresholded ? NaN : 0;
    return [key, Number.isFinite(number) ? number : null];
  }));
}

export async function readPartnerAnalytics(permissions: ViewerPermissions, days: 7 | 30 | 90) {
  const metrics = (Object.keys(metricNames) as Metric[]).filter(key => permissions[key]);
  if (!metrics.length) return { days, metrics, comparison: [], channels: [], thresholded: false };

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
  const base: GA.Schema$RunReportRequest = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }],
    metrics: metrics.map(key => ({ name: metricNames[key] })),
    ...(permissions.revenue ? { currencyCode: "INR" } : {}),
  };
  const withFilter = (filter: GA.Schema$FilterExpression): GA.Schema$RunReportRequest => ({
    ...base, dimensionFilter: { andGroup: { expressions: [includeRealTraffic, filter] } },
  });
  const requests = [withFilter(googleAds), withFilter({ notExpression: googleAds })];
  if (permissions.channels) {
    requests.push({ ...base, dimensions: [{ name: "sessionDefaultChannelGroup" }], dimensionFilter: includeRealTraffic, limit: "100" });
  }
  const { data } = await api.properties.batchRunReports({ property, requestBody: { requests } }, { timeout: 10000 });
  const reports = data.reports;
  if (reports?.length !== requests.length) throw new Error("GA4 report incomplete");
  const comparison: ReportRow[] = ["Google Ads", "All other traffic"].map((label, index) => ({
    label, values: values(reports[index].rows?.[0], metrics, reports[index].metadata?.subjectToThresholding === true),
  }));
  const breakdown = new Map<string, ReportRow["values"]>();
  for (const row of reports[2]?.rows || []) {
    const name = row.dimensionValues?.[0]?.value || "";
    const label = channels.has(name) ? name : "Other channels";
    const previous = breakdown.get(label);
    const next = values(row, metrics, reports[2].metadata?.subjectToThresholding === true);
    if (previous) {
      for (const metric of metrics) {
        const a = previous[metric], b = next[metric];
        next[metric] = typeof a === "number" && typeof b === "number" ? a + b : null;
      }
    }
    breakdown.set(label, next);
  }
  return {
    days, metrics, comparison,
    channels: [...breakdown].map(([label, values]) => ({ label, values })).sort((a, b) => a.label.localeCompare(b.label)),
    thresholded: reports.some(report => report.metadata?.subjectToThresholding === true),
  };
}
