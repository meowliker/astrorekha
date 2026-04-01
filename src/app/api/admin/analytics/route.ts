import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { classifyPayUEvent } from "@/lib/finance-events";
import { getPayUTransactions } from "@/lib/payu-api";

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
type MatrixDayMode = "calendar_ist" | "business_1130_ist";

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
    timeZone: "Asia/Kolkata",
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
    timeZone: "Asia/Kolkata",
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

async function fetchMetaAdsDailySpend(startDate: string, endDate: string): Promise<Map<string, number>> {
  const metaAccessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!metaAccessToken || !adAccountId) {
    return new Map();
  }

  try {
    const dateParams = `time_range={"since":"${startDate}","until":"${endDate}"}`;
    const dailyUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?fields=spend&time_increment=1&${dateParams}&limit=90&access_token=${metaAccessToken}`;
    const response = await fetch(dailyUrl);
    const data = await response.json();

    const spendMap = new Map<string, number>();
    if (Array.isArray(data?.data)) {
      for (const day of data.data) {
        const date = String(day?.date_start || "");
        const spend = Number(day?.spend || 0);
        if (date) {
          spendMap.set(date, Number.isFinite(spend) ? spend : 0);
        }
      }
    }
    return spendMap;
  } catch {
    return new Map();
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

    const trafficEndDate = dayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
    const trafficRange = [{ startDate, endDate: trafficEndDate }];
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
      // GA dateHour format: YYYYMMDDHH
      if (!/^\d{10}$/.test(dateHourRaw)) continue;
      const parsed = new Date(
        `${dateHourRaw.slice(0, 4)}-${dateHourRaw.slice(4, 6)}-${dateHourRaw.slice(6, 8)}T${dateHourRaw.slice(8, 10)}:00:00+05:30`
      );
      if (Number.isNaN(parsed.getTime())) continue;
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
      if (!/^\d{10}$/.test(dateHourRaw)) continue;
      const parsed = new Date(
        `${dateHourRaw.slice(0, 4)}-${dateHourRaw.slice(4, 6)}-${dateHourRaw.slice(6, 8)}T${dateHourRaw.slice(8, 10)}:00:00+05:30`
      );
      if (Number.isNaN(parsed.getTime())) continue;
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
          ? "Connected to GA4 Data API (CST mode uses shifted hour/day aggregation)."
          : "Connected to GA4 Data API.",
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

    const { data: paymentRows } = await supabase
      .from("payments")
      .select("id, amount, payment_status, created_at, type, bundle_id, currency, user_id")
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

    type AggregatedSalesRow = {
      dayKey: string;
      hour: number;
      weekday: string;
      kind: "sale" | "refund";
      signedAmount: number;
    };

    const payuFetchEndForDayMode = dayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
    const payuFetchEndForMatrixMode = matrixDayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
    const payuFetchEnd = payuFetchEndForDayMode > payuFetchEndForMatrixMode
      ? payuFetchEndForDayMode
      : payuFetchEndForMatrixMode;
    const payuTxns = await getPayUTransactions(startDate, payuFetchEnd);

    type PayUFinancialRow = {
      created: Date;
      kind: "sale" | "refund";
      signedAmount: number;
    };

    const payuFinancialRows: PayUFinancialRow[] = payuTxns
      .map((txn) => {
        const financial = classifyPayUEvent(txn as unknown as Record<string, unknown>);
        if (financial.kind === "ignore" || !txn.addedon) return null;
        const created = new Date(String(txn.addedon).replace(" ", "T") + "+05:30");
        if (Number.isNaN(created.getTime())) return null;
        return {
          created,
          kind: financial.kind,
          signedAmount: financial.signedAmount,
        } as PayUFinancialRow;
      })
      .filter((row): row is PayUFinancialRow => !!row);

    const salesRows: AggregatedSalesRow[] = payuFinancialRows
      .map((row) => {
        const grouped = getMatrixDateGroup(row.created, dayMode);
        if (!inRange(grouped.dayKey)) return null;
        return {
          dayKey: grouped.dayKey,
          hour: grouped.hour,
          weekday: grouped.weekday,
          kind: row.kind,
          signedAmount: row.signedAmount,
        } as AggregatedSalesRow;
      })
      .filter((row): row is AggregatedSalesRow => !!row);

    const hasLivePayUSalesData = payuFinancialRows.length > 0;
    const refundRows = salesRows.filter((row) => row.kind === "refund");

    const salesHourlyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesDailyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesWeekdayMap = new Map<string, { count: number; revenueInr: number }>();
    const salesDayHourMap = new Map<string, { count: number; revenueInr: number }>();
    let totalRevenueInr = 0;
    let paidOrders = 0;
    let refundedOrders = 0;

    for (const row of salesRows) {
      const hourLabel = formatHourLabel(row.hour, dayMode);
      const amount = row.signedAmount;
      const countDelta = row.kind === "refund" ? -1 : 1;
      totalRevenueInr += amount;
      if (row.kind === "sale") paidOrders += 1;
      if (row.kind === "refund") refundedOrders += 1;

      const hourEntry = salesHourlyMap.get(hourLabel) || { count: 0, revenueInr: 0 };
      hourEntry.count += countDelta;
      hourEntry.revenueInr += amount;
      salesHourlyMap.set(hourLabel, hourEntry);

      const dayEntry = salesDailyMap.get(row.dayKey) || { count: 0, revenueInr: 0 };
      dayEntry.count += countDelta;
      dayEntry.revenueInr += amount;
      salesDailyMap.set(row.dayKey, dayEntry);

      const dayHourKey = `${row.dayKey}|${row.hour}`;
      const dayHourEntry = salesDayHourMap.get(dayHourKey) || { count: 0, revenueInr: 0 };
      dayHourEntry.count += countDelta;
      dayHourEntry.revenueInr += amount;
      salesDayHourMap.set(dayHourKey, dayHourEntry);

      const weekdayEntry = salesWeekdayMap.get(row.weekday) || { count: 0, revenueInr: 0 };
      weekdayEntry.count += countDelta;
      weekdayEntry.revenueInr += amount;
      salesWeekdayMap.set(row.weekday, weekdayEntry);
    }

    const peakSalesHour = pickTopSalesMetric(salesHourlyMap, "N/A");
    const peakSalesDay = pickTopSalesMetric(salesWeekdayMap, "N/A");
    const salesHourlySeries = buildHourlySalesSeriesByMode(salesHourlyMap, dayMode);
    const salesDailySeries = buildDailySalesSeries(salesDailyMap, startDate, endDate);
    const salesWeekdaySeries = buildWeekdaySalesSeries(salesWeekdayMap);

    const exchangeRate = await fetchExchangeRate();
    const metaSpendUsdMap = await fetchMetaAdsDailySpend(startDate, endDate);
    const hasMetaSpend = metaSpendUsdMap.size > 0;
    const hourlyProfitabilityRows: HourlyProfitabilityPoint[] = [];

    const dateKeys: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`);
    const rangeEnd = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= rangeEnd) {
      dateKeys.push(cursor.toISOString().split("T")[0]);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const matrixDailyRevenueMap = new Map<string, number>();
    const matrixDayHourMap = new Map<string, { count: number; revenueInr: number }>();
    type AggregatedMatrixRow = {
      dayKey: string;
      hour: number;
      kind: "sale" | "refund";
      signedAmount: number;
    };

    const matrixRows: AggregatedMatrixRow[] = payuFinancialRows
      .map((row) => {
        const grouped = getMatrixDateGroup(row.created, matrixDayMode);
        if (!inRange(grouped.dayKey)) return null;
        return {
          dayKey: grouped.dayKey,
          hour: grouped.hour,
          kind: row.kind,
          signedAmount: row.signedAmount,
        } as AggregatedMatrixRow;
      })
      .filter((row): row is AggregatedMatrixRow => !!row);

    for (const row of matrixRows) {
      const countDelta = row.kind === "refund" ? -1 : 1;
      matrixDailyRevenueMap.set(row.dayKey, (matrixDailyRevenueMap.get(row.dayKey) || 0) + row.signedAmount);
      const key = `${row.dayKey}|${row.hour}`;
      const prev = matrixDayHourMap.get(key) || { count: 0, revenueInr: 0 };
      prev.count += countDelta;
      prev.revenueInr += row.signedAmount;
      matrixDayHourMap.set(key, prev);
    }

    for (const dayKey of dateKeys) {
      const dailyRevenue = matrixDailyRevenueMap.get(dayKey) || 0;
      const adsCostInr = (metaSpendUsdMap.get(dayKey) || 0) * exchangeRate;
      const weekday = getWeekdayFromIsoDate(dayKey);

      for (let hour = 0; hour < 24; hour++) {
        const hourLabel = formatHourLabel(hour, matrixDayMode);
        const dayHour = matrixDayHourMap.get(`${dayKey}|${hour}`) || { count: 0, revenueInr: 0 };
        const hourRevenue = dayHour.revenueInr;
        const hourCount = dayHour.count;

        const allocatedAdsCostInr = dailyRevenue > 0
          ? adsCostInr * (hourRevenue / dailyRevenue)
          : adsCostInr > 0
          ? adsCostInr / 24
          : 0;

        const hourProfitInr = (hourRevenue * 0.95) - allocatedAdsCostInr;
        const hourRoas = allocatedAdsCostInr > 0 ? hourRevenue / allocatedAdsCostInr : 0;

        hourlyProfitabilityRows.push({
          date: dayKey,
          weekday,
          hour,
          label: hourLabel,
          orderCount: hourCount,
          revenueInr: Number(hourRevenue.toFixed(2)),
          profitInr: Number(hourProfitInr.toFixed(2)),
          roas: Number(hourRoas.toFixed(4)),
        });
      }
    }

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
    const paywallSignal = inferPaywallVisitors(selectedRouteData.routeMetrics);
    const totalVisitors = selectedRouteData.totalSessions > 0 ? selectedRouteData.totalSessions : paymentStarts;
    const paywallVisitors = paywallSignal.visitors > 0 ? paywallSignal.visitors : paymentStarts;
    const exitedWithoutPaying = Math.max(totalVisitors - paidOrders, 0);
    const conversionRateRaw = totalVisitors > 0 ? (paidOrders / totalVisitors) * 100 : 0;
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
        paidOrders,
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
          connected: hasLivePayUSalesData,
          message: hasLivePayUSalesData
            ? "Sales are sourced from PayU live API for the full selected date range."
            : "PayU live returned no sales data for the selected date range.",
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
          message: "Sales + internal fallback metrics are active.",
        },
      },
      notes: [
        useGaRouteData
          ? "Traffic, route viewers, and bounce rates are sourced from GA4."
          : "Traffic and route stats are currently sourced from internal fallback events. GA4 data unavailable.",
        paywallSignal.matchedRoute
          ? `Paywall audience inferred from route: ${paywallSignal.matchedRoute}.`
          : "Paywall audience inferred from payment starts because paywall route traffic was unavailable.",
        "Checkout funnel conversion is calculated using total visitors (not only paywall visitors).",
        hasLivePayUSalesData
          ? "Sales metrics are sourced from PayU live with refund/chargeback events subtracted."
          : "PayU live did not return sales rows for this range.",
        refundRows.length > 0 || refundedOrders > 0
          ? "Refund and chargeback events are subtracted from revenue metrics."
          : "No refund events were detected in this range.",
        hasMetaSpend
          ? "Profitability matrix uses Meta Ads daily spend (USD→INR) with proportional hourly cost allocation."
          : "Profitability matrix has no ads spend for this range, so it reflects revenue after GST only.",
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
