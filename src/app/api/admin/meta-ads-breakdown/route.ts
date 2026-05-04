import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import { classifyPayUEvent } from "@/lib/finance-events";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const PAYU_BASE_URL = "https://info.payu.in/merchant/postservice?form=2";
const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const BUSINESS_BOUNDARY_HOUR = 11;
const BUSINESS_BOUNDARY_MINUTE = 30;
const MAX_RANGE_START_ISO = "2024-01-01";

// Generate SHA-512 hash for PayU
function generateHash(input: string): string {
  return crypto.createHash("sha512").update(input).digest("hex");
}

interface PayUTransaction {
  txnid: string;
  amount: string;
  status: string;
  addedon: string;
  net_amount_debit?: string;
  field9?: string;
  error_Message?: string;
  unmappedstatus?: string;
}

// Fetch PayU transactions for a date range
async function fetchPayUTransactions(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    console.log("PayU credentials not configured");
    return [];
  }

  const command = "get_Transaction_Details";
  const hashString = `${merchantKey}|${command}|${fromDate}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", fromDate);
  formData.append("var2", toDate);
  formData.append("hash", hash);

  try {
    const response = await fetch(PAYU_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formData.toString(),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return [];
    }

    if (data.status === 1 && data.Transaction_details) {
      const allTxns = Array.isArray(data.Transaction_details) 
        ? data.Transaction_details 
        : Object.values(data.Transaction_details);
      
      const financialTxns = allTxns.filter((txn: any) => {
        const financial = classifyPayUEvent(txn as Record<string, unknown>);
        return financial.kind !== "ignore";
      });

      console.log(`PayU: ${allTxns.length} total, ${financialTxns.length} financial`);
      if (financialTxns.length > 0) {
        console.log(`First financial txn amount: ${financialTxns[0].amount}`);
      }

      return financialTxns;
    }
  } catch (err) {
    console.error("PayU fetch error:", err);
  }

  return [];
}

interface BusinessWindow {
  start: Date;
  end: Date;
  startDateIso: string;
  endDateIso: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function getIstDateTimeParts(date: Date): {
  dayKey: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
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
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    dayKey: `${year}-${pad2(month)}-${pad2(day)}`,
    year: Number.isFinite(year) ? year : 1970,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getCurrentBusinessDateIso(now: Date): string {
  const ist = getIstDateTimeParts(now);
  const isBeforeBoundary =
    ist.hour < BUSINESS_BOUNDARY_HOUR ||
    (ist.hour === BUSINESS_BOUNDARY_HOUR && ist.minute < BUSINESS_BOUNDARY_MINUTE);
  return isBeforeBoundary ? shiftIsoDate(ist.dayKey, -1) : ist.dayKey;
}

function getBoundaryUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map((v) => Number(v));
  const utcMs =
    Date.UTC(year, month - 1, day, BUSINESS_BOUNDARY_HOUR, BUSINESS_BOUNDARY_MINUTE, 0, 0) -
    IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

function getWeekStartMondayIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  return shiftIsoDate(isoDate, -mondayIndex);
}

function getFirstDayOfMonthIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  return `${year}-${pad2(month)}-01`;
}

function getPreviousMonthFirstIso(monthStartIso: string): string {
  const d = new Date(`${monthStartIso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().split("T")[0];
}

function getFirstDayOfQuarterIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${pad2(quarterStartMonth)}-01`;
}

function getPreviousQuarterFirstIso(quarterStartIso: string): string {
  const d = new Date(`${quarterStartIso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().split("T")[0];
}

function getFirstDayOfYearIso(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  return `${year}-01-01`;
}

function getPreviousYearFirstIso(yearStartIso: string): string {
  const year = Number(yearStartIso.slice(0, 4));
  return `${year - 1}-01-01`;
}

function resolvePresetBusinessWindow(preset: string, now: Date): BusinessWindow {
  const businessTodayIso = getCurrentBusinessDateIso(now);
  let startDateIso = businessTodayIso;
  let endDateIso = businessTodayIso;
  let end = now;

  switch (preset) {
    case "today":
      startDateIso = businessTodayIso;
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "yesterday":
      startDateIso = shiftIsoDate(businessTodayIso, -1);
      endDateIso = startDateIso;
      end = getBoundaryUtcDate(shiftIsoDate(startDateIso, 1));
      break;
    case "last_3d":
      startDateIso = shiftIsoDate(businessTodayIso, -3);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_7d":
      startDateIso = shiftIsoDate(businessTodayIso, -7);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_14d":
      startDateIso = shiftIsoDate(businessTodayIso, -14);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_30d":
      startDateIso = shiftIsoDate(businessTodayIso, -30);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_60d":
      startDateIso = shiftIsoDate(businessTodayIso, -60);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_90d":
      startDateIso = shiftIsoDate(businessTodayIso, -90);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "this_week":
      startDateIso = getWeekStartMondayIso(businessTodayIso);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_week": {
      const thisWeekStartIso = getWeekStartMondayIso(businessTodayIso);
      startDateIso = shiftIsoDate(thisWeekStartIso, -7);
      endDateIso = shiftIsoDate(thisWeekStartIso, -1);
      end = getBoundaryUtcDate(thisWeekStartIso);
      break;
    }
    case "this_month":
      startDateIso = getFirstDayOfMonthIso(businessTodayIso);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_month": {
      const thisMonthStartIso = getFirstDayOfMonthIso(businessTodayIso);
      startDateIso = getPreviousMonthFirstIso(thisMonthStartIso);
      endDateIso = shiftIsoDate(thisMonthStartIso, -1);
      end = getBoundaryUtcDate(thisMonthStartIso);
      break;
    }
    case "this_quarter":
      startDateIso = getFirstDayOfQuarterIso(businessTodayIso);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_quarter": {
      const thisQuarterStartIso = getFirstDayOfQuarterIso(businessTodayIso);
      startDateIso = getPreviousQuarterFirstIso(thisQuarterStartIso);
      endDateIso = shiftIsoDate(thisQuarterStartIso, -1);
      end = getBoundaryUtcDate(thisQuarterStartIso);
      break;
    }
    case "this_year":
      startDateIso = getFirstDayOfYearIso(businessTodayIso);
      endDateIso = businessTodayIso;
      end = now;
      break;
    case "last_year": {
      const thisYearStartIso = getFirstDayOfYearIso(businessTodayIso);
      startDateIso = getPreviousYearFirstIso(thisYearStartIso);
      endDateIso = shiftIsoDate(thisYearStartIso, -1);
      end = getBoundaryUtcDate(thisYearStartIso);
      break;
    }
    case "maximum":
      startDateIso = MAX_RANGE_START_ISO;
      endDateIso = businessTodayIso;
      end = now;
      break;
    default:
      startDateIso = shiftIsoDate(businessTodayIso, -7);
      endDateIso = businessTodayIso;
      end = now;
      break;
  }

  const start = getBoundaryUtcDate(startDateIso);
  if (end < start) {
    end = start;
  }
  return { start, end, startDateIso, endDateIso };
}

function resolveCustomBusinessWindow(
  customStartDate: string,
  customEndDate: string | null,
  now: Date
): BusinessWindow {
  let startDateIso = customStartDate.trim();
  let endDateIso = (customEndDate || customStartDate).trim();

  if (endDateIso < startDateIso) {
    [startDateIso, endDateIso] = [endDateIso, startDateIso];
  }

  const businessTodayIso = getCurrentBusinessDateIso(now);
  if (startDateIso > businessTodayIso) {
    startDateIso = businessTodayIso;
  }
  if (endDateIso > businessTodayIso) {
    endDateIso = businessTodayIso;
  }

  const start = getBoundaryUtcDate(startDateIso);
  const end =
    endDateIso === businessTodayIso
      ? now
      : getBoundaryUtcDate(shiftIsoDate(endDateIso, 1));

  return {
    start,
    end: end < start ? start : end,
    startDateIso,
    endDateIso,
  };
}

function parsePayUTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}+05:30`);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function formatIstDateTime(date: Date): string {
  const value = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${value} IST`;
}

interface AdMetrics {
  id: string;
  name: string;
  status: string;
  spend: number;
  budget: number | null;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  purchases: number;
  firstPartySales?: number;
  firstPartyRevenue?: number;
  costPerPurchase: number;
  reach: number;
  roas: number;
}

interface AdSetData extends AdMetrics {
  ads: AdMetrics[];
}

interface CampaignData extends AdMetrics {
  adsets: AdSetData[];
}

const PURCHASE_ACTION_PRIORITY = [
  "website_purchase",
  "onsite_web_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];

function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function parseMetricNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMetaEntityId(value: string | null | undefined): string {
  return String(value || "").replace(/^act_/i, "").trim();
}

function normalizeAdAccountId(value: string): string {
  return value.replace(/^act_/i, "").trim();
}

async function fetchMetaJson(url: string): Promise<any> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Meta API HTTP ${response.status}`;
    throw new Error(`Meta API Error: ${message}`);
  }
  return payload;
}

async function fetchAllMetaPages(initialUrl: string, maxPages: number = 20): Promise<any[]> {
  const rows: any[] = [];
  let nextUrl: string | null = initialUrl;
  let pageCount = 0;

  while (nextUrl && pageCount < maxPages) {
    const payload = await fetchMetaJson(nextUrl);
    if (Array.isArray(payload?.data)) {
      rows.push(...payload.data);
    }
    nextUrl = typeof payload?.paging?.next === "string" ? payload.paging.next : null;
    pageCount += 1;
  }

  return rows;
}

function getActionMetricValue(collection: any[], actionTypes: string[]): number {
  for (const actionType of actionTypes) {
    const hit = collection.find((row: any) => row?.action_type === actionType);
    if (hit) return parseMetricNumber(hit.value);
  }
  return 0;
}

function getRoasValue(insight: any): number {
  const roasSources = [insight?.website_purchase_roas, insight?.purchase_roas];
  for (const source of roasSources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      const prioritized = getActionMetricValue(source, PURCHASE_ACTION_PRIORITY);
      if (prioritized > 0) return prioritized;
      if (source.length > 0) {
        const fallback = parseMetricNumber(source[0]?.value);
        if (fallback > 0) return fallback;
      }
    } else if (typeof source === "number" || typeof source === "string") {
      const parsed = parseMetricNumber(source);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

// Fetch exchange rate
async function fetchExchangeRate(): Promise<number> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await response.json();
    return data.rates?.INR || 85;
  } catch {
    return 85;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const datePreset = searchParams.get("datePreset") || "last_7d";
    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");
    const customExchangeRate = searchParams.get("exchangeRate");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin session
    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("id", token)
      .single();

    if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const metaAccessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!metaAccessToken || !adAccountId) {
      return NextResponse.json({
        configured: false,
        error: "Meta Ads not configured",
      });
    }
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    if (!normalizedAdAccountId) {
      return NextResponse.json({
        configured: false,
        error: "Meta Ads account ID is invalid",
      });
    }

    // Get exchange rate
    const exchangeRate = customExchangeRate ? parseFloat(customExchangeRate) : await fetchExchangeRate();

    const now = new Date();
    const customStartDateValue = isIsoDate(customStartDate) ? customStartDate : null;
    const hasCustomRange = !!customStartDateValue;
    if (customStartDate && !customStartDateValue) {
      return NextResponse.json({ error: "Invalid startDate format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (customEndDate && !isIsoDate(customEndDate)) {
      return NextResponse.json({ error: "Invalid endDate format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const businessWindow = hasCustomRange
      ? resolveCustomBusinessWindow(customStartDateValue, customEndDate, now)
      : resolvePresetBusinessWindow(datePreset, now);

    const payuFetchStartDate = getIstDateTimeParts(businessWindow.start).dayKey;
    const payuFetchEndDate = getIstDateTimeParts(businessWindow.end).dayKey;

    // Fetch PayU transactions for the date range to get actual revenue
    console.log(
      `Fetching PayU transactions from ${payuFetchStartDate} to ${payuFetchEndDate} for business window ${formatIstDateTime(
        businessWindow.start
      )} -> ${formatIstDateTime(businessWindow.end)}`
    );
    const payuTransactions = await fetchPayUTransactions(payuFetchStartDate, payuFetchEndDate);
    
    // Debug: log first transaction to see field names
    if (payuTransactions.length > 0) {
      console.log("Sample PayU transaction:", JSON.stringify(payuTransactions[0]));
    }
    
    const classifiedPayu = payuTransactions
      .map((txn: any) => ({
        txn,
        financial: classifyPayUEvent(txn as Record<string, unknown>),
        timestamp: parsePayUTimestamp(txn?.addedon),
      }))
      .filter(
        (row) =>
          row.financial.kind !== "ignore" &&
          !!row.timestamp &&
          row.timestamp >= businessWindow.start &&
          row.timestamp <= businessWindow.end
      );

    const grossRevenue = classifiedPayu
      .filter((row) => row.financial.kind === "sale")
      .reduce((sum, row) => sum + row.financial.amount, 0);
    const refundAmount = classifiedPayu
      .filter((row) => row.financial.kind === "refund")
      .reduce((sum, row) => sum + row.financial.amount, 0);
    const totalRevenue = grossRevenue - refundAmount;
    const totalSales = classifiedPayu.filter((row) => row.financial.kind === "sale").length;
    const totalRefunds = classifiedPayu.filter((row) => row.financial.kind === "refund").length;
    console.log(`PayU: ${totalSales} sales, ₹${totalRevenue.toFixed(2)} revenue`);

    type PaymentAttributionRow = {
      id: string;
      amount: number | null;
      created_at: string | null;
      fulfilled_at: string | null;
      meta_campaign_id: string | null;
      utm_campaign: string | null;
    };

    const paidStatuses = ["paid", "success", "captured"];
    const attributionFetchStart = new Date(
      businessWindow.start.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    const attributionFetchEnd = new Date(
      businessWindow.end.getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    let firstPartyCampaignAttributionAvailable = true;
    const liveAttributionEvents: Array<{
      amountInr: number;
      campaignId: string;
      utmCampaign: string;
    }> = [];

    const { data: attributedPayments, error: attributedPaymentsError } = await supabase
      .from("payments")
      .select("id, amount, created_at, fulfilled_at, meta_campaign_id, utm_campaign")
      .in("payment_status", paidStatuses)
      .gte("created_at", attributionFetchStart)
      .lte("created_at", attributionFetchEnd);

    if (attributedPaymentsError) {
      firstPartyCampaignAttributionAvailable = false;
      console.warn("First-party campaign attribution unavailable:", attributedPaymentsError.message);
    } else {
      for (const payment of (attributedPayments || []) as PaymentAttributionRow[]) {
        const eventTime = parsePayUTimestamp(payment.fulfilled_at || payment.created_at);
        if (!eventTime) continue;
        if (eventTime < businessWindow.start || eventTime > businessWindow.end) continue;

        const campaignId = normalizeMetaEntityId(payment.meta_campaign_id);
        const amountInr = parseMetricNumber(payment.amount) / 100;
        const utmCampaign = String(payment.utm_campaign || "").trim().toLowerCase();

        liveAttributionEvents.push({
          amountInr,
          campaignId,
          utmCampaign,
        });
      }
    }

    // Build date range params for Meta (date-granular, mapped from IST business window)
    const metaSinceDate = businessWindow.startDateIso;
    const metaUntilDate = businessWindow.endDateIso;
    const dateParams = `time_range={"since":"${metaSinceDate}","until":"${metaUntilDate}"}`;

    // Fields to fetch for insights
    const insightFields = "spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type,purchase_roas,website_purchase_roas";

    // 0. Fetch account-level insights for exact top-line parity with Ads Manager
    const accountInsightsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/insights?fields=${insightFields}&${dateParams}&limit=1&access_token=${metaAccessToken}`;
    const accountInsightsData = await fetchMetaJson(accountInsightsUrl);

    // 1. Fetch account metadata
    const accountUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}?fields=id,name,currency,timezone_name&access_token=${metaAccessToken}`;
    const accountData = await fetchMetaJson(accountUrl);

    // 2. Fetch all campaigns with pagination
    const campaignsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget&limit=200&access_token=${metaAccessToken}`;
    const campaignsData = await fetchAllMetaPages(campaignsUrl);

    // 3. Fetch campaign-level insights (paginated)
    const campaignInsightsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/insights?fields=campaign_id,campaign_name,${insightFields}&level=campaign&${dateParams}&limit=500&access_token=${metaAccessToken}`;
    const campaignInsightsData = await fetchAllMetaPages(campaignInsightsUrl);

    // 4. Fetch adset-level insights (paginated)
    const adsetInsightsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/insights?fields=adset_id,adset_name,campaign_id,${insightFields}&level=adset&${dateParams}&limit=500&access_token=${metaAccessToken}`;
    const adsetInsightsData = await fetchAllMetaPages(adsetInsightsUrl);

    // 5. Fetch ad-level insights (paginated)
    const adInsightsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/insights?fields=ad_id,ad_name,adset_id,campaign_id,${insightFields}&level=ad&${dateParams}&limit=500&access_token=${metaAccessToken}`;
    const adInsightsData = await fetchAllMetaPages(adInsightsUrl);

    // 6. Fetch adsets with budget info (paginated)
    const adsetsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget&limit=500&access_token=${metaAccessToken}`;
    const adsetsData = await fetchAllMetaPages(adsetsUrl);

    // 7. Fetch ads with status (paginated)
    const adsUrl = `${META_BASE_URL}/act_${normalizedAdAccountId}/ads?fields=id,name,status,adset_id&limit=500&access_token=${metaAccessToken}`;
    const adsData = await fetchAllMetaPages(adsUrl);

    // Helper to extract metrics from insights
    const extractMetrics = (insight: any) => {
      const actions = insight?.actions || [];
      const costPerAction = insight?.cost_per_action_type || [];
      const purchases = getActionMetricValue(actions, PURCHASE_ACTION_PRIORITY);
      const costPerPurchase = getActionMetricValue(costPerAction, PURCHASE_ACTION_PRIORITY);
      const roas = getRoasValue(insight);

      return {
        spend: parseMetricNumber(insight?.spend),
        impressions: parseMetricNumber(insight?.impressions),
        clicks: parseMetricNumber(insight?.clicks),
        cpc: parseMetricNumber(insight?.cpc),
        cpm: parseMetricNumber(insight?.cpm),
        ctr: parseMetricNumber(insight?.ctr),
        reach: parseMetricNumber(insight?.reach),
        purchases,
        costPerPurchase,
        roas,
      };
    };

    // Create lookup maps
    const campaignInsightsMap = new Map();
    campaignInsightsData.forEach((c: any) => {
      campaignInsightsMap.set(c.campaign_id, c);
    });

    const adsetInsightsMap = new Map();
    adsetInsightsData.forEach((a: any) => {
      adsetInsightsMap.set(a.adset_id, a);
    });

    const adInsightsMap = new Map();
    adInsightsData.forEach((a: any) => {
      adInsightsMap.set(a.ad_id, a);
    });

    const adsetInfoMap = new Map();
    adsetsData.forEach((a: any) => {
      adsetInfoMap.set(a.id, a);
    });

    const adInfoMap = new Map();
    adsData.forEach((a: any) => {
      adInfoMap.set(a.id, a);
    });

    // Group adsets by campaign
    const adsetsByCampaign = new Map<string, any[]>();
    adsetsData.forEach((adset: any) => {
      const campaignId = adset.campaign_id;
      if (!adsetsByCampaign.has(campaignId)) {
        adsetsByCampaign.set(campaignId, []);
      }
      adsetsByCampaign.get(campaignId)!.push(adset);
    });

    // Group ads by adset
    const adsByAdset = new Map<string, any[]>();
    adsData.forEach((ad: any) => {
      const adsetId = ad.adset_id;
      if (!adsByAdset.has(adsetId)) {
        adsByAdset.set(adsetId, []);
      }
      adsByAdset.get(adsetId)!.push(ad);
    });

    const campaignIds = new Set(campaignsData.map((campaign: any) => String(campaign.id)));
    const campaignNameToId = new Map<string, string>();
    campaignsData.forEach((campaign: any) => {
      const key = String(campaign.name || "").trim().toLowerCase();
      if (key) campaignNameToId.set(key, String(campaign.id));
    });

    let firstPartyAttributedSales = 0;
    let firstPartyAttributedRevenue = 0;
    const firstPartyCampaignAttribution = new Map<string, { sales: number; revenue: number }>();
    if (firstPartyCampaignAttributionAvailable) {
      for (const event of liveAttributionEvents) {
        let resolvedCampaignId = "";
        if (event.campaignId && campaignIds.has(event.campaignId)) {
          resolvedCampaignId = event.campaignId;
        } else if (event.utmCampaign) {
          const normalizedUtm = event.utmCampaign.toLowerCase();
          resolvedCampaignId =
            campaignNameToId.get(normalizedUtm) ||
            (campaignIds.has(normalizedUtm) ? normalizedUtm : "");
        }

        if (!resolvedCampaignId) continue;

        firstPartyAttributedSales += 1;
        firstPartyAttributedRevenue += event.amountInr;
        const current = firstPartyCampaignAttribution.get(resolvedCampaignId) || { sales: 0, revenue: 0 };
        current.sales += 1;
        current.revenue += event.amountInr;
        firstPartyCampaignAttribution.set(resolvedCampaignId, current);
      }
    }

    // Build hierarchical structure
    const campaigns: CampaignData[] = campaignsData.map((campaign: any) => {
      const campaignInsight = campaignInsightsMap.get(campaign.id);
      const metrics = extractMetrics(campaignInsight);
      const campaignAttribution = firstPartyCampaignAttribution.get(String(campaign.id)) || {
        sales: 0,
        revenue: 0,
      };
      
      const budget = campaign.daily_budget 
        ? parseFloat(campaign.daily_budget) / 100 
        : (campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null);

      // Get adsets for this campaign
      const campaignAdsets = adsetsByCampaign.get(campaign.id) || [];
      
      const adsets: AdSetData[] = campaignAdsets.map((adset: any) => {
        const adsetInsight = adsetInsightsMap.get(adset.id);
        const adsetMetrics = extractMetrics(adsetInsight);
        
        const adsetBudget = adset.daily_budget 
          ? parseFloat(adset.daily_budget) / 100 
          : (adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 : null);

        // Get ads for this adset
        const adsetAds = adsByAdset.get(adset.id) || [];
        
        const ads: AdMetrics[] = adsetAds.map((ad: any) => {
          const adInsight = adInsightsMap.get(ad.id);
          const adMetrics = extractMetrics(adInsight);
          
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            budget: null,
            ...adMetrics,
          };
        });

        return {
          id: adset.id,
          name: adset.name,
          status: adset.status,
          budget: adsetBudget,
          ...adsetMetrics,
          ads,
        };
      });

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        budget,
        firstPartySales: campaignAttribution.sales,
        firstPartyRevenue: campaignAttribution.revenue,
        ...metrics,
        adsets,
      };
    });

    // Sort campaigns by spend (highest first)
    campaigns.sort((a, b) => b.spend - a.spend);

    const accountInsight = accountInsightsData?.data?.[0] || null;
    const accountMetrics = extractMetrics(accountInsight);

    // Calculate totals: prefer account-level for parity with Ads Manager UI.
    const aggregatedCampaignTotals = campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        purchases: acc.purchases + c.purchases,
        reach: acc.reach + c.reach,
      }),
      { spend: 0, impressions: 0, clicks: 0, purchases: 0, reach: 0 }
    );

    const totals = {
      spend: accountMetrics.spend || aggregatedCampaignTotals.spend,
      impressions: accountMetrics.impressions || aggregatedCampaignTotals.impressions,
      clicks: accountMetrics.clicks || aggregatedCampaignTotals.clicks,
      purchases: accountMetrics.purchases || aggregatedCampaignTotals.purchases,
      reach: accountMetrics.reach || aggregatedCampaignTotals.reach,
    };

    const firstPartySales = totalSales;
    const metaPurchases = totals.purchases;
    const attributionBaseline = firstPartyCampaignAttributionAvailable
      ? firstPartyAttributedSales
      : metaPurchases;
    const organicOrUnattributedSales = clampNonNegative(firstPartySales - attributionBaseline);

    // Calculate spend in INR and profit
    const totalSpendINR = totals.spend * exchangeRate;
    const gst = totalRevenue * 0.05; // 5% GST
    const netRevenue = totalRevenue - gst;
    const profit = netRevenue - totalSpendINR;
    const roas = totalSpendINR > 0 ? totalRevenue / totalSpendINR : 0;

    return NextResponse.json({
      configured: true,
      account: {
        id: accountData?.id || `act_${normalizedAdAccountId}`,
        name: accountData?.name || "Unknown",
        currency: accountData?.currency || "USD",
        timezone: accountData?.timezone_name || "Unknown",
      },
      exchangeRate,
      datePreset,
      dateRange: {
        start: formatIstDateTime(businessWindow.start),
        end: formatIstDateTime(businessWindow.end),
      },
      businessDateRange: {
        start: businessWindow.startDateIso,
        end: businessWindow.endDateIso,
      },
      customDateRange: hasCustomRange
        ? { start: businessWindow.startDateIso, end: businessWindow.endDateIso }
        : null,
      businessRule: "11:30 AM IST business-day boundary",
      campaigns,
      // Revenue data from PayU
      revenue: {
        totalRevenue,
        grossRevenue,
        refundAmount,
        totalSales,
        totalRefunds,
        gst,
        netRevenue,
        totalSpendINR,
        profit,
        roas,
      },
      sourceBreakdown: {
        firstPartySales,
        firstPartyAttributedSales,
        firstPartyAttributedRevenue,
        metaPurchases,
        organicOrUnattributedSales,
      },
      attribution: {
        campaignAttributionSource: firstPartyCampaignAttributionAvailable
          ? "first_party_payment_tracking"
          : "meta_reports",
        firstPartyCampaignAttributionAvailable,
        note:
          firstPartyCampaignAttributionAvailable
            ? "Campaign rows include Meta-reported website purchases plus live first-party sales attribution from captured click IDs/UTMs on payments. Organic or unattributed reflects first-party sales not mapped to a campaign ID."
            : "Campaign rows use Meta-reported website purchases/ROAS. First-party campaign attribution columns become available after payment attribution migration is applied.",
      },
      totals: {
        ...totals,
        spendINR: totalSpendINR,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        costPerPurchase: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
        roas: accountMetrics.roas || 0,
      },
    });
  } catch (error: any) {
    console.error("Meta Ads Breakdown API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Meta Ads breakdown" },
      { status: 500 }
    );
  }
}
