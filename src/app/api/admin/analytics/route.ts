import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PeakSalesMetric {
  label: string;
  count: number;
  revenueInr: number;
}

interface PeakTrafficMetric {
  label: string;
  sessions: number;
}

interface TrafficSeriesPoint {
  label: string;
  sessions: number;
}

interface SalesSeriesPoint {
  label: string;
  count: number;
  revenueInr: number;
}

interface HourlyProfitabilityPoint {
  date: string;
  weekday: string;
  hour: number;
  label: string;
  orderCount: number;
  revenueInr: number;
  profitInr: number;
  roas: number;
}

interface ProfitSheetRow {
  date: string;
  day: string;
  revenue: number;
  grossRevenue: number;
  refundAmount: number;
  gst: number;
  adsCostUSD: number;
  adsCostINR: number;
  netRevenue: number;
  profitPercent: number;
  roas: number;
  bundleRevenue: number;
  transactionCount: number;
  bundlePurchases: number;
  salesCount: number;
  refundCount: number;
}
type MatrixDayMode = "calendar_ist" | "business_1130_ist";
const IST_TIMEZONE = "Asia/Kolkata";
const DEFAULT_GA4_PROPERTY_TIMEZONE = "America/Costa_Rica";

interface RouteMetric {
  route: string;
  viewers: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDurationSec: number;
  checkouts: number;
  bounces: number;
  source: "ga" | "internal";
}

interface SourceStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

function normalizeBounceRate(rawValue: number): number {
  if (!Number.isFinite(rawValue) || rawValue < 0) return 0;
  return rawValue <= 1 ? rawValue * 100 : rawValue;
}

function fromProfitSheetDbRow(row: any): ProfitSheetRow {
  return {
    date: String(row.date || ""),
    day: String(row.day || ""),
    revenue: toNumber(row.revenue),
    grossRevenue: toNumber(row.gross_revenue),
    refundAmount: toNumber(row.refund_amount),
    gst: toNumber(row.gst),
    adsCostUSD: toNumber(row.ads_cost_usd),
    adsCostINR: toNumber(row.ads_cost_inr),
    netRevenue: toNumber(row.net_revenue),
    profitPercent: toNumber(row.profit_percent),
    roas: toNumber(row.roas),
    bundleRevenue: toNumber(row.bundle_revenue),
    transactionCount: toNumber(row.transaction_count),
    bundlePurchases: toNumber(row.bundle_purchases),
    salesCount: toNumber(row.sales_count || row.transaction_count),
    refundCount: toNumber(row.refund_count),
  };
}

async function readProfitSheetRows(supabase: any, startDate: string, endDate: string): Promise<ProfitSheetRow[]> {
  const { data, error } = await supabase
    .from("profit_sheet")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to read profit sheet");
  }

  return (data || []).map(fromProfitSheetDbRow);
}

function sumProfitSheetRows(rows: ProfitSheetRow[]) {
  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      refundAmount: acc.refundAmount + row.refundAmount,
      gst: acc.gst + row.gst,
      adsCostUSD: acc.adsCostUSD + row.adsCostUSD,
      adsCostINR: acc.adsCostINR + row.adsCostINR,
      netRevenue: acc.netRevenue + row.netRevenue,
      bundleRevenue: acc.bundleRevenue + row.bundleRevenue,
      transactionCount: acc.transactionCount + row.transactionCount,
      bundlePurchases: acc.bundlePurchases + row.bundlePurchases,
      salesCount: acc.salesCount + row.salesCount,
      refundCount: acc.refundCount + row.refundCount,
    }),
    {
      revenue: 0,
      grossRevenue: 0,
      refundAmount: 0,
      gst: 0,
      adsCostUSD: 0,
      adsCostINR: 0,
      netRevenue: 0,
      bundleRevenue: 0,
      transactionCount: 0,
      bundlePurchases: 0,
      salesCount: 0,
      refundCount: 0,
    }
  );

  return {
    ...totals,
    paidOrders: totals.salesCount || totals.transactionCount,
  };
}

function getModeShortLabel(mode: MatrixDayMode): "IST" | "CST" {
  return mode === "business_1130_ist" ? "CST" : "IST";
}

function formatHourLabel(hour: number, mode: MatrixDayMode): string {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00-${end}:00 ${getModeShortLabel(mode)}`;
}

function getIstDateTimeParts(date: Date): { dayKey: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    dayKey,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((zonedAsUtc - date.getTime()) / 60000);
}

function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = getTimeZoneOffsetMinutes(timeZone, utcGuess);
  const firstUtc = new Date(utcGuess.getTime() - firstOffset * 60 * 1000);
  const secondOffset = getTimeZoneOffsetMinutes(timeZone, firstUtc);
  return new Date(utcGuess.getTime() - secondOffset * 60 * 1000);
}

function parseGa4DateHour(dateHourRaw: string, propertyTimeZone: string): Date | null {
  if (!/^\d{10}$/.test(dateHourRaw)) return null;
  const year = Number(dateHourRaw.slice(0, 4));
  const month = Number(dateHourRaw.slice(4, 6));
  const day = Number(dateHourRaw.slice(6, 8));
  const hour = Number(dateHourRaw.slice(8, 10));
  if (![year, month, day, hour].every(Number.isFinite)) return null;
  const parsed = zonedDateTimeToUtc(propertyTimeZone, year, month, day, hour);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getMatrixDateGroup(date: Date, mode: MatrixDayMode): { dayKey: string; hour: number; weekday: string } {
  const { dayKey: calendarDay, hour, minute } = getIstDateTimeParts(date);

  if (mode === "calendar_ist") {
    return { dayKey: calendarDay, hour, weekday: getWeekdayFromIsoDate(calendarDay) };
  }

  const isBeforeBoundary = hour < 11 || (hour === 11 && minute < 30);
  const businessDay = isBeforeBoundary ? shiftIsoDate(calendarDay, -1) : calendarDay;
  // CST mode starts at 11:30 IST, so 11:30 IST maps to 00:00 CST.
  const totalMinutes = hour * 60 + minute;
  const shiftedMinutes = (totalMinutes - (11 * 60 + 30) + 24 * 60) % (24 * 60);
  const cstHour = Math.floor(shiftedMinutes / 60);
  return {
    dayKey: businessDay,
    hour: Number.isFinite(cstHour) ? cstHour : 0,
    weekday: getWeekdayFromIsoDate(businessDay),
  };
}

function getWeekdayFromIsoDate(isoDate: string): string {
  if (!isoDate) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    weekday: "long",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function buildWeekdaySalesSeries(
  map: Map<string, { count: number; revenueInr: number }>
): SalesSeriesPoint[] {
  const weekOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return weekOrder.map((day) => {
    const entry = map.get(day) || { count: 0, revenueInr: 0 };
    return {
      label: day,
      count: entry.count,
      revenueInr: Number(entry.revenueInr.toFixed(2)),
    };
  });
}

async function fetchExchangeRate(): Promise<number> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await response.json();
    const inr = Number(data?.rates?.INR);
    return Number.isFinite(inr) && inr > 0 ? inr : 85;
  } catch {
    return 85;
  }
}

function getRouteFromMetadata(metadata: unknown, fallback: string): string {
  if (!metadata || typeof metadata !== "object") return fallback;
  const obj = metadata as Record<string, unknown>;
  const candidate =
    obj.route || obj.pathname || obj.path || obj.page || obj.urlPath || obj.screen || obj.step;

  if (typeof candidate !== "string") return fallback;
  const normalized = candidate.trim();
  if (!normalized) return fallback;
  return normalized.startsWith("/") ? normalized.split("?")[0] : `/${normalized.split("?")[0]}`;
}

function inferPaywallVisitors(routeMetrics: RouteMetric[]): { visitors: number; matchedRoute: string | null } {
  if (!routeMetrics?.length) return { visitors: 0, matchedRoute: null };

  const normalizedRows = routeMetrics.map((row) => ({
    ...row,
    normalized: row.route.trim().toLowerCase(),
  }));

  const preferredPaywallRoutes = ["/onboarding/bundle-pricing", "/paywall"];
  const exactMatches = normalizedRows.filter((row) =>
    preferredPaywallRoutes.some((target) => row.normalized === target || row.normalized.startsWith(`${target}/`))
  );

  if (exactMatches.length > 0) {
    const best = exactMatches.reduce((max, row) => (row.viewers > max.viewers ? row : max), exactMatches[0]);
    return { visitors: best.viewers, matchedRoute: best.route };
  }

  const fuzzyMatches = normalizedRows.filter(
    (row) =>
      row.normalized.includes("paywall") ||
      row.normalized.includes("bundle-pricing") ||
      row.normalized.includes("onboarding/step-20")
  );

  if (fuzzyMatches.length > 0) {
    const best = fuzzyMatches.reduce((max, row) => (row.viewers > max.viewers ? row : max), fuzzyMatches[0]);
    return { visitors: best.viewers, matchedRoute: best.route };
  }

  return { visitors: 0, matchedRoute: null };
}

function pickTopSalesMetric(map: Map<string, { count: number; revenueInr: number }>, fallbackLabel: string): PeakSalesMetric {
  let bestLabel = fallbackLabel;
  let bestCount = 0;
  let bestRevenue = 0;

  for (const [label, value] of map.entries()) {
    if (value.count > bestCount || (value.count === bestCount && value.revenueInr > bestRevenue)) {
      bestLabel = label;
      bestCount = value.count;
      bestRevenue = value.revenueInr;
    }
  }

  return {
    label: bestLabel,
    count: bestCount,
    revenueInr: Number(bestRevenue.toFixed(2)),
  };
}

function pickTopTrafficMetric(map: Map<string, number>, fallbackLabel: string): PeakTrafficMetric {
  let bestLabel = fallbackLabel;
  let bestSessions = 0;

  for (const [label, sessions] of map.entries()) {
    if (sessions > bestSessions) {
      bestLabel = label;
      bestSessions = sessions;
    }
  }

  return {
    label: bestLabel,
    sessions: bestSessions,
  };
}

function buildHourlyTrafficSeriesByMode(map: Map<string, number>, mode: MatrixDayMode): TrafficSeriesPoint[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = formatHourLabel(hour, mode);
    return {
      label,
      sessions: map.get(label) || 0,
    };
  });
}

function buildHourlySalesSeriesByMode(
  map: Map<string, { count: number; revenueInr: number }>,
  mode: MatrixDayMode
): SalesSeriesPoint[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = formatHourLabel(hour, mode);
    const entry = map.get(label) || { count: 0, revenueInr: 0 };
    return {
      label,
      count: entry.count,
      revenueInr: Number(entry.revenueInr.toFixed(2)),
    };
  });
}

function buildWeekdayTrafficSeries(map: Map<string, number>): TrafficSeriesPoint[] {
  const weekOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return weekOrder.map((day) => ({
    label: day,
    sessions: map.get(day) || 0,
  }));
}

function buildDailyTrafficSeries(
  map: Map<string, number>,
  startDate: string,
  endDate: string
): TrafficSeriesPoint[] {
  const rows: TrafficSeriesPoint[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const key = cursor.toISOString().split("T")[0];
    rows.push({
      label: key,
      sessions: map.get(key) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

function buildDailySalesSeries(
  map: Map<string, { count: number; revenueInr: number }>,
  startDate: string,
  endDate: string
): SalesSeriesPoint[] {
  const rows: SalesSeriesPoint[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const key = cursor.toISOString().split("T")[0];
    const entry = map.get(key) || { count: 0, revenueInr: 0 };
    rows.push({
      label: key,
      count: entry.count,
      revenueInr: Number(entry.revenueInr.toFixed(2)),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rows;
}

async function fetchGoogleAnalyticsData(
  startDate: string,
  endDate: string,
  dayMode: MatrixDayMode
): Promise<{
  routeMetrics: RouteMetric[];
  peakTrafficHour: PeakTrafficMetric;
  peakTrafficDay: PeakTrafficMetric;
  hourlySeries: TrafficSeriesPoint[];
  dailySeries: TrafficSeriesPoint[];
  weekdaySeries: TrafficSeriesPoint[];
  totalSessions: number;
  totalPageViews: number;
  overallBounceRate: number;
  avgSessionDurationSec: number;
  sourceStatus: SourceStatus;
}> {
  const propertyId = process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const gaPropertyTimeZone =
    process.env.GA4_PROPERTY_TIMEZONE ||
    process.env.GOOGLE_ANALYTICS_PROPERTY_TIMEZONE ||
    DEFAULT_GA4_PROPERTY_TIMEZONE;

  if (!propertyId || !clientEmail || !privateKey) {
    return {
      routeMetrics: [],
      peakTrafficHour: { label: "N/A", sessions: 0 },
      peakTrafficDay: { label: "N/A", sessions: 0 },
      hourlySeries: [],
      dailySeries: [],
      weekdaySeries: [],
      totalSessions: 0,
      totalPageViews: 0,
      overallBounceRate: 0,
      avgSessionDurationSec: 0,
      sourceStatus: {
        configured: false,
        connected: false,
        message: "GA server API not configured. Add GA4_PROPERTY_ID + service account creds.",
      },
    };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });

    const analyticsData = google.analyticsdata({ version: "v1beta", auth });

    const trafficStartDate = dayMode === "calendar_ist" ? shiftIsoDate(startDate, -1) : startDate;
    const trafficEndDate = shiftIsoDate(endDate, 1);
    const trafficRange = [{ startDate: trafficStartDate, endDate: trafficEndDate }];
    const routeRange = [{ startDate, endDate }];

    const [hourResp, routeResp] = await Promise.all([
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: trafficRange,
          dimensions: [{ name: "dateHour" }],
          metrics: [{ name: "sessions" }],
          limit: "10000",
        },
      }),
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: routeRange,
          dimensions: [{ name: "pagePath" }],
          metrics: [
            { name: "sessions" },
            { name: "screenPageViews" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
          ],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: "100",
        },
      }),
    ]);

    const hourlyMap = new Map<string, number>();
    for (const row of hourResp.data.rows || []) {
      const dateHourRaw = row.dimensionValues?.[0]?.value || "";
      // GA dateHour format is YYYYMMDDHH in the GA4 property timezone.
      const parsed = parseGa4DateHour(dateHourRaw, gaPropertyTimeZone);
      if (!parsed) continue;
      const grouped = getMatrixDateGroup(parsed, dayMode);
      if (grouped.dayKey < startDate || grouped.dayKey > endDate) continue;
      const sessions = toNumber(row.metricValues?.[0]?.value);
      const label = formatHourLabel(grouped.hour, dayMode);
      hourlyMap.set(label, (hourlyMap.get(label) || 0) + sessions);
    }

    const dailyMap = new Map<string, number>();
    const weekdayMap = new Map<string, number>();
    for (const row of hourResp.data.rows || []) {
      const dateHourRaw = row.dimensionValues?.[0]?.value || "";
      const parsed = parseGa4DateHour(dateHourRaw, gaPropertyTimeZone);
      if (!parsed) continue;
      const grouped = getMatrixDateGroup(parsed, dayMode);
      if (grouped.dayKey < startDate || grouped.dayKey > endDate) continue;
      const sessions = toNumber(row.metricValues?.[0]?.value);
      dailyMap.set(grouped.dayKey, (dailyMap.get(grouped.dayKey) || 0) + sessions);
      const weekday = grouped.weekday;
      weekdayMap.set(weekday, (weekdayMap.get(weekday) || 0) + sessions);
    }

    const routeMetrics: RouteMetric[] = (routeResp.data.rows || [])
      .map((row) => {
        const route = row.dimensionValues?.[0]?.value || "/";
        const sessions = toNumber(row.metricValues?.[0]?.value);
        const pageViews = toNumber(row.metricValues?.[1]?.value);
        const bounceRate = normalizeBounceRate(toNumber(row.metricValues?.[2]?.value));
        const avgSessionDurationSec = toNumber(row.metricValues?.[3]?.value);
        const bounces = Math.round((sessions * bounceRate) / 100);

        return {
          route,
          viewers: sessions,
          pageViews,
          bounceRate,
          avgSessionDurationSec,
          checkouts: 0,
          bounces,
          source: "ga" as const,
        };
      })
      .filter((row) => row.viewers > 0)
      .sort((a, b) => b.viewers - a.viewers)
      .slice(0, 50);

    const totalSessions = Array.from(dailyMap.values()).reduce((sum, val) => sum + val, 0);
    const totalPageViews = routeMetrics.reduce((sum, row) => sum + row.pageViews, 0);
    const totalWeightedBounce = routeMetrics.reduce((sum, row) => sum + row.bounceRate * row.viewers, 0);
    const totalWeightedDuration = routeMetrics.reduce((sum, row) => sum + row.avgSessionDurationSec * row.viewers, 0);

    return {
      routeMetrics,
      peakTrafficHour: pickTopTrafficMetric(hourlyMap, "N/A"),
      peakTrafficDay: pickTopTrafficMetric(weekdayMap, "N/A"),
      hourlySeries: buildHourlyTrafficSeriesByMode(hourlyMap, dayMode),
      dailySeries: buildDailyTrafficSeries(dailyMap, startDate, endDate),
      weekdaySeries: buildWeekdayTrafficSeries(weekdayMap),
      totalSessions,
      totalPageViews,
      overallBounceRate: totalSessions > 0 ? totalWeightedBounce / totalSessions : 0,
      avgSessionDurationSec: totalSessions > 0 ? totalWeightedDuration / totalSessions : 0,
      sourceStatus: {
        configured: true,
        connected: true,
        message: dayMode === "business_1130_ist"
          ? `Connected to GA4 Data API (${gaPropertyTimeZone}; CST mode uses shifted hour/day aggregation).`
          : `Connected to GA4 Data API (${gaPropertyTimeZone}; hourly data converted to IST).`,
      },
    };
  } catch (error: any) {
    return {
      routeMetrics: [],
      peakTrafficHour: { label: "N/A", sessions: 0 },
      peakTrafficDay: { label: "N/A", sessions: 0 },
      hourlySeries: [],
      dailySeries: [],
      weekdaySeries: [],
      totalSessions: 0,
      totalPageViews: 0,
      overallBounceRate: 0,
      avgSessionDurationSec: 0,
      sourceStatus: {
        configured: true,
        connected: false,
        message: `GA connection failed: ${error?.message || "unknown error"}`,
      },
    };
  }
}

async function fetchInternalRouteAnalytics(
  startIso: string,
  endIso: string,
  dayMode: MatrixDayMode,
  startDate: string,
  endDate: string
): Promise<{
  routeMetrics: RouteMetric[];
  peakTrafficHour: PeakTrafficMetric;
  peakTrafficDay: PeakTrafficMetric;
  hourlySeries: TrafficSeriesPoint[];
  dailySeries: TrafficSeriesPoint[];
  weekdaySeries: TrafficSeriesPoint[];
  totalSessions: number;
  totalPageViews: number;
  overallBounceRate: number;
  avgSessionDurationSec: number;
}> {
  const supabase = getSupabaseAdmin();

  const { data: events } = await supabase
    .from("ab_test_events")
    .select("event_type, created_at, metadata, test_id, variant")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(10000);

  const routeMap = new Map<string, RouteMetric>();
  const hourlyMap = new Map<string, number>();
  const dailyMap = new Map<string, number>();
  const weekdayMap = new Map<string, number>();

  for (const evt of events || []) {
    const fallbackRoute = evt?.test_id
      ? `/ab/${evt.test_id}/${evt.variant || "unknown"}`
      : "/unknown";
    const route = getRouteFromMetadata(evt?.metadata, fallbackRoute);

    if (!routeMap.has(route)) {
      routeMap.set(route, {
        route,
        viewers: 0,
        pageViews: 0,
        bounceRate: 0,
        avgSessionDurationSec: 0,
        checkouts: 0,
        bounces: 0,
        source: "internal",
      });
    }

    const item = routeMap.get(route)!;
    const eventType = String(evt?.event_type || "");

    if (eventType === "impression") {
      item.viewers += 1;
      item.pageViews += 1;

      if (evt?.created_at) {
        const grouped = getMatrixDateGroup(new Date(evt.created_at), dayMode);
        const { dayKey, hour, weekday } = grouped;
        if (dayKey < startDate || dayKey > endDate) continue;
        const hourLabel = formatHourLabel(hour, dayMode);
        hourlyMap.set(hourLabel, (hourlyMap.get(hourLabel) || 0) + 1);
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
        weekdayMap.set(weekday, (weekdayMap.get(weekday) || 0) + 1);
      }
    } else if (eventType === "bounce") {
      item.bounces += 1;
    } else if (eventType === "checkout_started") {
      item.checkouts += 1;
    }
  }

  const routeMetrics = Array.from(routeMap.values())
    .map((row) => ({
      ...row,
      bounceRate: row.viewers > 0 ? (row.bounces / row.viewers) * 100 : 0,
    }))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 50);

  const totalSessions = routeMetrics.reduce((sum, row) => sum + row.viewers, 0);
  const totalBounces = routeMetrics.reduce((sum, row) => sum + row.bounces, 0);

  return {
    routeMetrics,
    peakTrafficHour: pickTopTrafficMetric(hourlyMap, "N/A"),
    peakTrafficDay: pickTopTrafficMetric(weekdayMap, "N/A"),
    hourlySeries: buildHourlyTrafficSeriesByMode(hourlyMap, dayMode),
    dailySeries: buildDailyTrafficSeries(dailyMap, startDate, endDate),
    weekdaySeries: buildWeekdayTrafficSeries(weekdayMap),
    totalSessions,
    totalPageViews: totalSessions,
    overallBounceRate: totalSessions > 0 ? (totalBounces / totalSessions) * 100 : 0,
    avgSessionDurationSec: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 30);

    const startDate = searchParams.get("startDate") || defaultStart.toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || today.toISOString().split("T")[0];
    const dayModeParam = searchParams.get("dayMode");
    const matrixDayModeParam = searchParams.get("matrixDayMode");
    const dayMode: MatrixDayMode = dayModeParam === "business_1130_ist" ? "business_1130_ist" : "calendar_ist";
    const matrixDayMode: MatrixDayMode = matrixDayModeParam === "business_1130_ist"
      ? "business_1130_ist"
      : dayMode;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }

    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("id, expires_at")
      .eq("id", token)
      .single();

    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized - Invalid session" }, { status: 401 });
    }

    if (new Date(sessionData.expires_at) < new Date()) {
      await supabase.from("admin_sessions").delete().eq("id", token);
      return NextResponse.json({ error: "Session expired - Please login again" }, { status: 401 });
    }

    const startIso = `${startDate}T00:00:00.000Z`;
    const endDateForMode = dayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
    const endIso = `${endDateForMode}T23:59:59.999Z`;
    const profitSheetRows = await readProfitSheetRows(supabase, startDate, endDate);
    const profitTotals = sumProfitSheetRows(profitSheetRows);

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("id, amount, payment_status, created_at, type, bundle_id, currency, user_id, customer_email, payu_txn_id")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(10000);

    const pendingRows = (paymentRows || []).filter((row) => {
      const status = normalizeStatus(row.payment_status);
      return status === "created" || status === "pending";
    });
    const failedRows = (paymentRows || []).filter((row) => normalizeStatus(row.payment_status) === "failed");

    const inRange = (dayKey: string) => dayKey >= startDate && dayKey <= endDate;

    const salesHourlyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesDailyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesWeekdayMap = new Map<string, { count: number; revenueInr: number }>();

    for (const row of profitSheetRows) {
      if (!inRange(row.date)) continue;
      const weekday = getWeekdayFromIsoDate(row.date);
      const count = row.salesCount || row.transactionCount || 0;

      const dayEntry = salesDailyMap.get(row.date) || { count: 0, revenueInr: 0 };
      dayEntry.count += count;
      dayEntry.revenueInr += row.revenue;
      salesDailyMap.set(row.date, dayEntry);

      const weekdayEntry = salesWeekdayMap.get(weekday) || { count: 0, revenueInr: 0 };
      weekdayEntry.count += count;
      weekdayEntry.revenueInr += row.revenue;
      salesWeekdayMap.set(weekday, weekdayEntry);
    }

    const peakSalesHour = pickTopSalesMetric(salesHourlyMap, "N/A");
    const peakSalesDay = pickTopSalesMetric(salesWeekdayMap, "N/A");
    const salesHourlySeries: SalesSeriesPoint[] = [];
    const salesDailySeries = buildDailySalesSeries(salesDailyMap, startDate, endDate);
    const salesWeekdaySeries = buildWeekdaySalesSeries(salesWeekdayMap);

    const exchangeSourceRow = profitSheetRows.find((row) => row.adsCostUSD > 0 && row.adsCostINR > 0);
    const exchangeRate = exchangeSourceRow
      ? Number((exchangeSourceRow.adsCostINR / exchangeSourceRow.adsCostUSD).toFixed(2))
      : await fetchExchangeRate();
    const hasMetaSpend = profitTotals.adsCostINR > 0;
    // The profit_sheet ledger is daily, so Analytics must not invent hour-level revenue/profit.
    const hourlyProfitabilityRows: HourlyProfitabilityPoint[] = [];

    const gaData = await fetchGoogleAnalyticsData(startDate, endDate, dayMode);
    const internalRouteData = await fetchInternalRouteAnalytics(startIso, endIso, dayMode, startDate, endDate);

    const useGaRouteData = gaData.sourceStatus.connected && gaData.routeMetrics.length > 0;

    const selectedRouteData = useGaRouteData ? gaData : {
      ...internalRouteData,
      sourceStatus: {
        configured: true,
        connected: true,
        message: "Using internal event stream (ab_test_events) as fallback.",
      } as SourceStatus,
    };

    const paymentStarts = paymentRows?.length || 0;
    const paidOrders = profitTotals.paidOrders;
    const refundedOrders = profitTotals.refundCount;
    const totalRevenueInr = profitTotals.revenue;
    const ledgerBundlePurchaseCount = profitTotals.bundlePurchases || paidOrders;
    const paywallSignal = inferPaywallVisitors(selectedRouteData.routeMetrics);
    const totalVisitors = selectedRouteData.totalSessions > 0 ? selectedRouteData.totalSessions : paymentStarts;
    const paywallVisitors = paywallSignal.visitors > 0 ? paywallSignal.visitors : paymentStarts;
    const exitedWithoutPaying = Math.max(totalVisitors - ledgerBundlePurchaseCount, 0);
    const conversionRateRaw = totalVisitors > 0 ? (ledgerBundlePurchaseCount / totalVisitors) * 100 : 0;
    const conversionRate = Math.min(conversionRateRaw, 100);
    const dropOffRate = totalVisitors > 0 ? (exitedWithoutPaying / totalVisitors) * 100 : 0;

    return NextResponse.json({
      range: {
        startDate,
        endDate,
        timezone: "Asia/Kolkata",
        dayMode,
      },
      kpis: {
        paidOrders,
        refundedOrders,
        paidRevenueInr: Number(totalRevenueInr.toFixed(2)),
        pendingPayments: pendingRows.length,
        failedPayments: failedRows.length,
        checkoutStarts: totalVisitors,
        checkoutToPaidRate: Number(conversionRate.toFixed(2)),
      },
      funnel: {
        totalVisitors,
        paywallVisitors,
        paidOrders: ledgerBundlePurchaseCount,
        exitedWithoutPaying,
        conversionRate: Number(conversionRate.toFixed(2)),
        dropOffRate: Number(dropOffRate.toFixed(2)),
        paywallRoute: paywallSignal.matchedRoute,
      },
      peaks: {
        sales: {
          hour: peakSalesHour,
          day: peakSalesDay,
        },
        traffic: {
          hour: selectedRouteData.peakTrafficHour,
          day: selectedRouteData.peakTrafficDay,
        },
      },
      trends: {
        sales: {
          hourly: salesHourlySeries,
          daily: salesDailySeries,
          weekday: salesWeekdaySeries,
        },
        traffic: {
          hourly: selectedRouteData.hourlySeries,
          daily: selectedRouteData.dailySeries,
          weekday: selectedRouteData.weekdaySeries,
        },
      },
      hourlyProfitability: {
        rows: hourlyProfitabilityRows,
        exchangeRate: Number(exchangeRate.toFixed(2)),
        adsSource: hasMetaSpend ? "meta" : "none",
        dayMode: matrixDayMode,
      },
      traffic: {
        totalSessions: selectedRouteData.totalSessions,
        totalPageViews: selectedRouteData.totalPageViews,
        overallBounceRate: Number(selectedRouteData.overallBounceRate.toFixed(2)),
        avgSessionDurationSec: Number(selectedRouteData.avgSessionDurationSec.toFixed(2)),
      },
      routes: selectedRouteData.routeMetrics,
      sources: {
        sales: {
          configured: true,
          connected: profitSheetRows.length > 0,
          message: profitSheetRows.length > 0
            ? "Sales are sourced from the synced Supabase profit_sheet ledger."
            : "No synced profit_sheet rows were found for the selected date range.",
        },
        googleAnalytics: gaData.sourceStatus,
        clarity: {
          configured: Boolean(process.env.NEXT_PUBLIC_CLARITY_ID),
          connected: false,
          message: process.env.NEXT_PUBLIC_CLARITY_ID
            ? "Clarity script is installed. Add server API token/project envs to pull route metrics here."
            : "Clarity not configured.",
        },
        vercelAnalytics: {
          configured: true,
          connected: false,
          message: "Vercel Analytics script is installed. Add Analytics API token/project envs to query server-side reports here.",
        },
        internal: {
          configured: true,
          connected: true,
          message: "Internal fallback route metrics are active when GA4 is unavailable.",
        },
      },
      notes: [
        useGaRouteData
          ? "Traffic, route viewers, and bounce rates are sourced from GA4."
          : "Traffic and route stats are currently sourced from internal fallback events. GA4 data unavailable.",
        paywallSignal.matchedRoute
          ? `Paywall audience inferred from route: ${paywallSignal.matchedRoute}.`
          : "Paywall audience inferred from payment starts because paywall route traffic was unavailable.",
        "Checkout funnel conversion uses route viewers and bundle purchases from the synced profit_sheet ledger.",
        "Sales, revenue, refunds, and paid-order KPIs are sourced from Supabase profit_sheet, not the live PayU API.",
        refundedOrders > 0
          ? "Refund and chargeback events are subtracted from revenue metrics."
          : "No refund events were detected in this range.",
        hasMetaSpend
          ? "Profitability totals use synced Meta Ads cost from profit_sheet."
          : "No synced Meta ad spend exists in profit_sheet for this range.",
        matrixDayMode === "business_1130_ist"
          ? "Matrix day mode: CST (11:30 AM IST to next day 11:29 AM IST, where 11:30 AM IST is treated as 12:00 AM CST)."
          : "Matrix day mode: IST calendar day (00:00 to 23:59 IST).",
        dayMode === "business_1130_ist"
          ? "Global day mode: CST (11:30 AM IST to next day 11:29 AM IST, where 11:30 AM IST is treated as 12:00 AM CST)."
          : "Global day mode: IST calendar day (00:00 to 23:59 IST).",
      ],
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error: any) {
    console.error("Admin analytics API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch analytics data" },
      { status: 500 }
    );
  }
}
