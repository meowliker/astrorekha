import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAID_STATUSES = new Set(["paid", "success", "captured"]);
const PAYU_BASE_URL = process.env.PAYU_MODE === "live"
  ? "https://info.payu.in/merchant/postservice?form=2"
  : "https://test.payu.in/merchant/postservice?form=2";

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

interface PayUTransaction {
  amount: string;
  status: string;
  addedon: string;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

function amountInInr(rawAmount: unknown): number {
  return toNumber(rawAmount) / 100;
}

function normalizeBounceRate(rawValue: number): number {
  if (!Number.isFinite(rawValue) || rawValue < 0) return 0;
  return rawValue <= 1 ? rawValue * 100 : rawValue;
}

function formatIstHourLabel(hour: number): string {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00-${end}:00 IST`;
}

function getIstDateParts(date: Date): { dayKey: string; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));

  return { dayKey, hour: Number.isFinite(hour) ? hour : 0 };
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
  if (mode === "calendar_ist") {
    const { dayKey, hour } = getIstDateParts(date);
    return { dayKey, hour, weekday: getIstWeekday(date) };
  }

  const { dayKey: calendarDay, hour, minute } = getIstDateTimeParts(date);
  const isBeforeBoundary = hour < 11 || (hour === 11 && minute < 30);
  const businessDay = isBeforeBoundary ? shiftIsoDate(calendarDay, -1) : calendarDay;
  return {
    dayKey: businessDay,
    hour,
    weekday: getWeekdayFromIsoDate(businessDay),
  };
}

function getIstWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(date);
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

function generateHash(params: string): string {
  return crypto.createHash("sha512").update(params).digest("hex");
}

async function fetchPayUTransactionsChunk(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) return [];

  const command = "get_Transaction_Details";
  const hashString = `${merchantKey}|${command}|${fromDate}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", fromDate);
  formData.append("var2", toDate);
  formData.append("hash", hash);

  const response = await fetch(PAYU_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: formData.toString(),
  });

  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    return [];
  }

  if (data.status !== 1 || !data.Transaction_details) return [];

  const rows = Array.isArray(data.Transaction_details)
    ? data.Transaction_details
    : Object.values(data.Transaction_details);

  return (rows as PayUTransaction[]).filter((txn) => txn.status === "success" || txn.status === "captured");
}

async function fetchPayUTransactions(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const all: PayUTransaction[] = [];
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  let chunkStart = new Date(start);
  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 6);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const from = chunkStart.toISOString().split("T")[0];
    const to = chunkEnd.toISOString().split("T")[0];
    const rows = await fetchPayUTransactionsChunk(from, to);
    all.push(...rows);

    chunkStart.setUTCDate(chunkStart.getUTCDate() + 7);
  }

  return all;
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

function buildHourlyTrafficSeries(map: Map<string, number>): TrafficSeriesPoint[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = formatIstHourLabel(hour);
    return {
      label,
      sessions: map.get(label) || 0,
    };
  });
}

function buildHourlySalesSeries(
  map: Map<string, { count: number; revenueInr: number }>
): SalesSeriesPoint[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = formatIstHourLabel(hour);
    const entry = map.get(label) || { count: 0, revenueInr: 0 };
    return {
      label,
      count: entry.count,
      revenueInr: Number(entry.revenueInr.toFixed(2)),
    };
  });
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

async function fetchGoogleAnalyticsData(startDate: string, endDate: string): Promise<{
  routeMetrics: RouteMetric[];
  peakTrafficHour: PeakTrafficMetric;
  peakTrafficDay: PeakTrafficMetric;
  hourlySeries: TrafficSeriesPoint[];
  dailySeries: TrafficSeriesPoint[];
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

    const commonRange = [{ startDate, endDate }];

    const [hourResp, dayResp, routeResp] = await Promise.all([
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: commonRange,
          dimensions: [{ name: "hour" }],
          metrics: [{ name: "sessions" }],
          limit: "24",
        },
      }),
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: commonRange,
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }],
          limit: "400",
        },
      }),
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: commonRange,
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
      const hourRaw = row.dimensionValues?.[0]?.value || "0";
      const hour = Number(hourRaw);
      const label = formatIstHourLabel(Number.isFinite(hour) ? hour : 0);
      hourlyMap.set(label, toNumber(row.metricValues?.[0]?.value));
    }

    const dailyMap = new Map<string, number>();
    const weekdayMap = new Map<string, number>();
    for (const row of dayResp.data.rows || []) {
      const dateRaw = row.dimensionValues?.[0]?.value || "";
      const dayLabel = dateRaw.length === 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dateRaw;
      const sessions = toNumber(row.metricValues?.[0]?.value);
      dailyMap.set(dayLabel, sessions);
      const weekday = getWeekdayFromIsoDate(dayLabel);
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

    const totalSessions = routeMetrics.reduce((sum, row) => sum + row.viewers, 0);
    const totalPageViews = routeMetrics.reduce((sum, row) => sum + row.pageViews, 0);
    const totalWeightedBounce = routeMetrics.reduce((sum, row) => sum + row.bounceRate * row.viewers, 0);
    const totalWeightedDuration = routeMetrics.reduce((sum, row) => sum + row.avgSessionDurationSec * row.viewers, 0);

    return {
      routeMetrics,
      peakTrafficHour: pickTopTrafficMetric(hourlyMap, "N/A"),
      peakTrafficDay: pickTopTrafficMetric(weekdayMap, "N/A"),
      hourlySeries: buildHourlyTrafficSeries(hourlyMap),
      dailySeries: buildDailyTrafficSeries(dailyMap, startDate, endDate),
      totalSessions,
      totalPageViews,
      overallBounceRate: totalSessions > 0 ? totalWeightedBounce / totalSessions : 0,
      avgSessionDurationSec: totalSessions > 0 ? totalWeightedDuration / totalSessions : 0,
      sourceStatus: {
        configured: true,
        connected: true,
        message: "Connected to GA4 Data API.",
      },
    };
  } catch (error: any) {
    return {
      routeMetrics: [],
      peakTrafficHour: { label: "N/A", sessions: 0 },
      peakTrafficDay: { label: "N/A", sessions: 0 },
      hourlySeries: [],
      dailySeries: [],
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
        const hourLabel = formatIstHourLabel(hour);
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
    hourlySeries: buildHourlyTrafficSeries(hourlyMap),
    dailySeries: buildDailyTrafficSeries(dailyMap, startDate, endDate),
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

    const paidRows = (paymentRows || []).filter((row) => PAID_STATUSES.has(normalizeStatus(row.payment_status)));
    const pendingRows = (paymentRows || []).filter((row) => {
      const status = normalizeStatus(row.payment_status);
      return status === "created" || status === "pending";
    });
    const failedRows = (paymentRows || []).filter((row) => normalizeStatus(row.payment_status) === "failed");

    const payuFetchEndDate = dayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
    const payuTransactions = await fetchPayUTransactions(startDate, payuFetchEndDate);
    const hasPayUSalesData = payuTransactions.length > 0;
    const salesHourlyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesDailyMap = new Map<string, { count: number; revenueInr: number }>();
    const salesWeekdayMap = new Map<string, { count: number; revenueInr: number }>();
    const salesDayHourMap = new Map<string, { count: number; revenueInr: number }>();
    let totalRevenueInr = 0;
    let paidOrders = 0;

    if (hasPayUSalesData) {
      for (const txn of payuTransactions) {
        if (!txn.addedon) continue;
        const created = new Date(txn.addedon.replace(" ", "T") + "+05:30");
        if (Number.isNaN(created.getTime())) continue;

        const grouped = getMatrixDateGroup(created, dayMode);
        const { dayKey, hour, weekday } = grouped;
        if (dayKey < startDate || dayKey > endDate) continue;
        const hourLabel = formatIstHourLabel(hour);
        const amount = toNumber(txn.amount);
        totalRevenueInr += amount;
        paidOrders += 1;

        const hourEntry = salesHourlyMap.get(hourLabel) || { count: 0, revenueInr: 0 };
        hourEntry.count += 1;
        hourEntry.revenueInr += amount;
        salesHourlyMap.set(hourLabel, hourEntry);

        const dayEntry = salesDailyMap.get(dayKey) || { count: 0, revenueInr: 0 };
        dayEntry.count += 1;
        dayEntry.revenueInr += amount;
        salesDailyMap.set(dayKey, dayEntry);

        const dayHourKey = `${dayKey}|${hour}`;
        const dayHourEntry = salesDayHourMap.get(dayHourKey) || { count: 0, revenueInr: 0 };
        dayHourEntry.count += 1;
        dayHourEntry.revenueInr += amount;
        salesDayHourMap.set(dayHourKey, dayHourEntry);

        const weekdayEntry = salesWeekdayMap.get(weekday) || { count: 0, revenueInr: 0 };
        weekdayEntry.count += 1;
        weekdayEntry.revenueInr += amount;
        salesWeekdayMap.set(weekday, weekdayEntry);
      }
    } else {
      for (const row of paidRows) {
        if (!row.created_at) continue;
        const created = new Date(row.created_at);
        const grouped = getMatrixDateGroup(created, dayMode);
        const { dayKey, hour, weekday } = grouped;
        if (dayKey < startDate || dayKey > endDate) continue;
        const hourLabel = formatIstHourLabel(hour);
        const amount = amountInInr(row.amount);
        totalRevenueInr += amount;
        paidOrders += 1;

        const hourEntry = salesHourlyMap.get(hourLabel) || { count: 0, revenueInr: 0 };
        hourEntry.count += 1;
        hourEntry.revenueInr += amount;
        salesHourlyMap.set(hourLabel, hourEntry);

        const dayEntry = salesDailyMap.get(dayKey) || { count: 0, revenueInr: 0 };
        dayEntry.count += 1;
        dayEntry.revenueInr += amount;
        salesDailyMap.set(dayKey, dayEntry);

        const dayHourKey = `${dayKey}|${hour}`;
        const dayHourEntry = salesDayHourMap.get(dayHourKey) || { count: 0, revenueInr: 0 };
        dayHourEntry.count += 1;
        dayHourEntry.revenueInr += amount;
        salesDayHourMap.set(dayHourKey, dayHourEntry);

        const weekdayEntry = salesWeekdayMap.get(weekday) || { count: 0, revenueInr: 0 };
        weekdayEntry.count += 1;
        weekdayEntry.revenueInr += amount;
        salesWeekdayMap.set(weekday, weekdayEntry);
      }
    }

    const peakSalesHour = pickTopSalesMetric(salesHourlyMap, "N/A");
    const peakSalesDay = pickTopSalesMetric(salesWeekdayMap, "N/A");
    const salesHourlySeries = buildHourlySalesSeries(salesHourlyMap);
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

    if (hasPayUSalesData) {
      const matrixToDate = matrixDayMode === "business_1130_ist" ? shiftIsoDate(endDate, 1) : endDate;
      const matrixTxns = matrixDayMode === "business_1130_ist"
        ? await fetchPayUTransactions(startDate, matrixToDate)
        : payuTransactions;

      for (const txn of matrixTxns) {
        if (!txn.addedon) continue;
        const created = new Date(txn.addedon.replace(" ", "T") + "+05:30");
        if (Number.isNaN(created.getTime())) continue;
        const amount = toNumber(txn.amount);
        const grouped = getMatrixDateGroup(created, matrixDayMode);
        if (grouped.dayKey < startDate || grouped.dayKey > endDate) continue;

        matrixDailyRevenueMap.set(grouped.dayKey, (matrixDailyRevenueMap.get(grouped.dayKey) || 0) + amount);
        const key = `${grouped.dayKey}|${grouped.hour}`;
        const prev = matrixDayHourMap.get(key) || { count: 0, revenueInr: 0 };
        prev.count += 1;
        prev.revenueInr += amount;
        matrixDayHourMap.set(key, prev);
      }
    } else {
      type MatrixPaymentRow = { amount: unknown; payment_status: unknown; created_at: string | null };
      let matrixPaidRows: MatrixPaymentRow[] = paidRows.map((row) => ({
        amount: row.amount,
        payment_status: row.payment_status,
        created_at: row.created_at,
      }));
      if (matrixDayMode === "business_1130_ist") {
        const matrixEndIso = `${shiftIsoDate(endDate, 1)}T23:59:59.999Z`;
        const { data: extraRows } = await supabase
          .from("payments")
          .select("amount, payment_status, created_at")
          .gte("created_at", startIso)
          .lte("created_at", matrixEndIso)
          .order("created_at", { ascending: false })
          .limit(10000);

        matrixPaidRows = (extraRows || []).filter((row) => PAID_STATUSES.has(normalizeStatus(row.payment_status)));
      }

      for (const row of matrixPaidRows) {
        if (!row.created_at) continue;
        const created = new Date(row.created_at);
        if (Number.isNaN(created.getTime())) continue;
        const amount = amountInInr(row.amount);
        const grouped = getMatrixDateGroup(created, matrixDayMode);
        if (grouped.dayKey < startDate || grouped.dayKey > endDate) continue;

        matrixDailyRevenueMap.set(grouped.dayKey, (matrixDailyRevenueMap.get(grouped.dayKey) || 0) + amount);
        const key = `${grouped.dayKey}|${grouped.hour}`;
        const prev = matrixDayHourMap.get(key) || { count: 0, revenueInr: 0 };
        prev.count += 1;
        prev.revenueInr += amount;
        matrixDayHourMap.set(key, prev);
      }
    }

    for (const dayKey of dateKeys) {
      const dailyRevenue = matrixDailyRevenueMap.get(dayKey) || 0;
      const adsCostInr = (metaSpendUsdMap.get(dayKey) || 0) * exchangeRate;
      const weekday = getWeekdayFromIsoDate(dayKey);

      for (let hour = 0; hour < 24; hour++) {
        const hourLabel = formatIstHourLabel(hour);
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

    const gaData = await fetchGoogleAnalyticsData(startDate, endDate);
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
          connected: hasPayUSalesData,
          message: hasPayUSalesData
            ? "Sales data source: PayU Transactions API."
            : "PayU API unavailable for this range. Using payments table fallback.",
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
        hasPayUSalesData
          ? "Sales metrics are sourced from PayU transaction API to match Profit Sheet totals."
          : "Sales metrics are sourced from payments table (paid/success/captured).",
        hasMetaSpend
          ? "Profitability matrix uses Meta Ads daily spend (USD→INR) with proportional hourly cost allocation."
          : "Profitability matrix has no ads spend for this range, so it reflects revenue after GST only.",
        matrixDayMode === "business_1130_ist"
          ? "Matrix day boundary mode: 11:30 AM IST to next day 11:29 AM IST."
          : "Matrix day boundary mode: calendar day (00:00 to 23:59 IST).",
        dayMode === "business_1130_ist"
          ? "Global day mode: 11:30 AM IST to next day 11:29 AM IST."
          : "Global day mode: calendar day (00:00 to 23:59 IST).",
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
