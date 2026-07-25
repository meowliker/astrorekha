import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyPayUEvent } from "@/lib/finance-events";
import { getPayUTransactions } from "@/lib/payu-api";
import type { PayUTransaction } from "@/lib/payu-api";
import { getMetaAccountCredentialsFromEnv } from "@/lib/meta-ad-accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_LAUNCH_DATE = "2026-03-13";

// Meta API
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface ProfitSheetRow {
  date: string;
  day: string;
  revenue: number;
  grossRevenue?: number;
  refundAmount?: number;
  gst: number;
  adsCostUSD: number;
  adsCostINR: number;
  netRevenue: number;
  profitPercent: number;
  roas: number;
  bundleRevenue: number;
  transactionCount: number;
  bundlePurchases: number;
  salesCount?: number;
  refundCount?: number;
}

interface DailyMetaSpend {
  usd: number;
  inr: number;
}

interface SyncedPaymentRow {
  id: string;
  payu_txn_id: string;
  payu_payment_id: string | null;
  type: string;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  customer_email: string | null;
  amount: number;
  currency: "INR";
  payment_status: string;
  fulfilled_at: string | null;
  created_at: string;
}

function normalizePurchaseType(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "bundle";
}

function isBundlePurchaseType(value: string | null | undefined): boolean {
  const normalized = normalizePurchaseType(value);
  return normalized === "bundle" || normalized === "bundle_payment";
}

function parsePayUAddedOnToIso(addedon?: string): string | null {
  if (!addedon) return null;
  const dt = new Date(addedon.replace(" ", "T") + "+05:30");
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function resolvePayUAmountToPaise(txn: PayUTransaction): number {
  const grossAmount = Math.abs(Number.parseFloat(String(txn.amount || "0")));
  const transactionFee = Math.abs(Number.parseFloat(String(txn.transaction_fee || "0")));
  const netAmount = Math.abs(Number.parseFloat(String(txn.net_amount_debit || "0")));
  const resolved = grossAmount > 0 ? grossAmount : transactionFee > 0 ? transactionFee : netAmount;
  return Number.isFinite(resolved) && resolved > 0 ? Math.round(resolved * 100) : 0;
}

function normalizePaymentStatus(status?: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "success" || normalized === "captured" || normalized === "settled" || normalized === "paid") {
    return "paid";
  }
  return normalized || "created";
}

function stablePaymentEventId(txn: PayUTransaction): string | null {
  const txnid = String(txn.txnid || "").trim();
  if (!txnid) return null;

  const financial = classifyPayUEvent(txn as unknown as Record<string, unknown>);
  if (financial.kind !== "refund") {
    return `pay_${txnid}`;
  }

  const refundKey = [
    txnid,
    txn.mihpayid || txn.id || "",
    txn.amount || "",
    txn.addedon || "",
    txn.field9 || "",
    txn.unmappedstatus || "",
  ]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 180);

  return `pay_refund_${refundKey}`;
}

function buildSyncedPaymentRows(transactions: PayUTransaction[]): SyncedPaymentRow[] {
  const rows: SyncedPaymentRow[] = [];
  const seenIds = new Set<string>();

  for (const txn of transactions) {
    const txnid = String(txn.txnid || "").trim();
    const id = stablePaymentEventId(txn);
    const createdAt = parsePayUAddedOnToIso(txn.addedon);
    const amount = resolvePayUAmountToPaise(txn);
    if (!txnid || !id || !createdAt || amount <= 0 || seenIds.has(id)) continue;

    seenIds.add(id);
    const paymentStatus = normalizePaymentStatus(txn.status);
    rows.push({
      id,
      payu_txn_id: txnid,
      payu_payment_id: String(txn.mihpayid || txn.id || "").trim() || null,
      type: normalizePurchaseType(txn.udf2),
      bundle_id: String(txn.udf3 || "").trim() || null,
      feature: String(txn.udf4 || "").trim() || null,
      coins: (() => {
        const parsed = Number.parseInt(String(txn.udf5 || ""), 10);
        return Number.isFinite(parsed) ? parsed : null;
      })(),
      customer_email: String(txn.email || "").trim().toLowerCase() || null,
      amount,
      currency: "INR",
      payment_status: paymentStatus,
      fulfilled_at: paymentStatus === "paid" ? createdAt : null,
      created_at: createdAt,
    });
  }

  return rows;
}

// Fetch exchange rate
async function fetchExchangeRate(): Promise<number> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await response.json();
    return data.rates?.INR || 85;
  } catch {
    return 85; // Default fallback
  }
}


function parseHourBucketStart(raw: unknown): number | null {
  const text = String(raw || "").trim();
  const match = text.match(/^(\d{1,2}):\d{2}:\d{2}/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toUtcFromAccountLocalHour(dateStart: string, hour: number, timezoneOffsetHoursUtc: number): Date | null {
  const parsed = parseIsoDateParts(dateStart);
  if (!parsed) return null;
  const utcMillis =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, 0, 0, 0) -
    timezoneOffsetHoursUtc * 60 * 60 * 1000;
  return new Date(utcMillis);
}

function isWithinRequestedRange(dayKey: string, startDate: string, endDate: string): boolean {
  return dayKey >= startDate && dayKey <= endDate;
}

function addConvertedMetaSpend(
  spendMap: Map<string, DailyMetaSpend>,
  dayKey: string,
  spend: number,
  currency: string,
  exchangeRate: number
) {
  const current = spendMap.get(dayKey) || { usd: 0, inr: 0 };
  if (currency === "INR") {
    current.inr += spend;
    current.usd += exchangeRate > 0 ? spend / exchangeRate : 0;
  } else {
    // Default to USD semantics for unknown currencies.
    current.usd += spend;
    current.inr += spend * exchangeRate;
  }
  spendMap.set(dayKey, current);
}

function addHourlySpendToBusinessWindow(
  spendMap: Map<string, DailyMetaSpend>,
  row: {
    date_start?: string;
    spend?: string;
    hourly_stats_aggregated_by_advertiser_time_zone?: string;
  },
  timezoneOffsetHoursUtc: number,
  currency: string,
  exchangeRate: number,
  startDate: string,
  endDate: string
) {
  const spend = parseFloat(String(row.spend || "0"));
  if (!Number.isFinite(spend) || spend <= 0) return;

  const hour = parseHourBucketStart(row.hourly_stats_aggregated_by_advertiser_time_zone);
  if (hour === null) return;
  const dateStart = String(row.date_start || "");
  const bucketStart = toUtcFromAccountLocalHour(dateStart, hour, timezoneOffsetHoursUtc);
  if (!bucketStart || Number.isNaN(bucketStart.getTime())) return;

  const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
  const startDay = getCostaRicaBusinessDayKeyFromDate(bucketStart);
  const endDay = getCostaRicaBusinessDayKeyFromDate(new Date(bucketEnd.getTime() - 1));

  if (startDay === endDay) {
    if (isWithinRequestedRange(startDay, startDate, endDate)) {
      addConvertedMetaSpend(spendMap, startDay, spend, currency, exchangeRate);
    }
    return;
  }

  // Only the 11:30 IST boundary can split one hourly bucket into two business days.
  const splitBoundary = new Date(`${endDay}T11:30:00+05:30`);
  const splitMillis = splitBoundary.getTime();
  const startMillis = bucketStart.getTime();
  const endMillis = bucketEnd.getTime();
  const leftMillis = Math.max(0, Math.min(endMillis, splitMillis) - startMillis);
  const rightMillis = Math.max(0, endMillis - Math.max(startMillis, splitMillis));
  const totalMillis = leftMillis + rightMillis;
  if (totalMillis <= 0) return;

  const leftSpend = spend * (leftMillis / totalMillis);
  const rightSpend = spend - leftSpend;

  if (leftSpend > 0 && isWithinRequestedRange(startDay, startDate, endDate)) {
    addConvertedMetaSpend(spendMap, startDay, leftSpend, currency, exchangeRate);
  }
  if (rightSpend > 0 && isWithinRequestedRange(endDay, startDate, endDate)) {
    addConvertedMetaSpend(spendMap, endDay, rightSpend, currency, exchangeRate);
  }
}

// Fetch Meta Ads daily spend for a date range, normalized to 11:30 AM IST business-day windows.
async function fetchMetaAdsDailySpend(
  startDate: string,
  endDate: string,
  exchangeRate: number
): Promise<Map<string, DailyMetaSpend>> {
  const credentials = getMetaAccountCredentialsFromEnv();

  if (credentials.length === 0) {
    return new Map();
  }

  try {
    // Pull a small safety buffer around requested range so hour-splits near boundaries are captured.
    const queryStartDate = addDaysToIsoDate(startDate, -2);
    const queryEndDate = addDaysToIsoDate(endDate, 2);
    const dateParams = `time_range={"since":"${queryStartDate}","until":"${queryEndDate}"}`;
    const spendMap = new Map<string, DailyMetaSpend>();

    for (const { accountId: adAccountId, accessToken } of credentials) {
      const accountUrl = `${META_BASE_URL}/act_${adAccountId}?fields=id,name,currency,timezone_name,timezone_offset_hours_utc&access_token=${accessToken}`;
      const hourlyUrl =
        `${META_BASE_URL}/act_${adAccountId}/insights` +
        `?fields=date_start,date_stop,spend` +
        `&time_increment=1&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` +
        `&${dateParams}&limit=5000&access_token=${accessToken}`;
      const dailyFallbackUrl =
        `${META_BASE_URL}/act_${adAccountId}/insights` +
        `?fields=date_start,spend&time_increment=1&${dateParams}&limit=500&access_token=${accessToken}`;

      const [accountResponse, hourlyResponse] = await Promise.all([fetch(accountUrl), fetch(hourlyUrl)]);
      const accountData = await accountResponse.json().catch(() => null);
      const hourlyData = await hourlyResponse.json().catch(() => null);

      if (!accountResponse.ok || accountData?.error) {
        console.error(`Meta account fetch failed for act_${adAccountId}:`, accountData?.error || accountResponse.status);
        continue;
      }

      const currency = String(accountData?.currency || "USD").toUpperCase();
      const timezoneOffsetHoursUtcRaw = Number(accountData?.timezone_offset_hours_utc);
      const timezoneOffsetHoursUtc = Number.isFinite(timezoneOffsetHoursUtcRaw) ? timezoneOffsetHoursUtcRaw : -6;

      const hourlyRows: Array<{
        date_start?: string;
        spend?: string;
        hourly_stats_aggregated_by_advertiser_time_zone?: string;
      }> = Array.isArray(hourlyData?.data) ? hourlyData.data : [];

      if (hourlyRows.length > 0) {
        hourlyRows.forEach((row) =>
          addHourlySpendToBusinessWindow(
            spendMap,
            row,
            timezoneOffsetHoursUtc,
            currency,
            exchangeRate,
            startDate,
            endDate
          )
        );
        continue;
      }

      // Fallback in case hourly breakdown is unavailable for an account.
      const fallbackResponse = await fetch(dailyFallbackUrl);
      const fallbackData = await fallbackResponse.json().catch(() => null);
      const dailyRows: Array<{ date_start?: string; spend?: string }> = Array.isArray(fallbackData?.data)
        ? fallbackData.data
        : [];
      dailyRows.forEach((day) => {
        const spend = parseFloat(String(day.spend || "0"));
        if (!Number.isFinite(spend) || spend <= 0) return;
        const dayKey = String(day.date_start || "");
        if (!isWithinRequestedRange(dayKey, startDate, endDate)) return;
        addConvertedMetaSpend(spendMap, dayKey, spend, currency, exchangeRate);
      });

      if (!Array.isArray(fallbackData?.data)) {
        console.error(`Meta fallback fetch returned no data for act_${adAccountId}`, fallbackData?.error || fallbackData);
      }
    }

    return spendMap;
  } catch (error) {
    console.error("Meta Ads fetch error:", error);
    return new Map();
  }
}

// Convert Costa Rica date to IST date range
// Costa Rica is UTC-6, IST is UTC+5:30
// Difference: 11.5 hours (IST is ahead)
// Costa Rica "March 13 00:00" = IST "March 13 11:30"
// Costa Rica "March 13 23:59:59" = IST "March 14 11:29:59"
function getISTRangeForCostaRicaDate(costaRicaDate: string): { start: Date; end: Date } {
  const [year, month, day] = costaRicaDate.split("-").map(Number);
  
  // Costa Rica midnight (00:00:00 UTC-6) = UTC 06:00:00
  // IST = UTC + 5:30, so UTC 06:00 = IST 11:30
  // Create start time: Costa Rica date at 00:00 = IST same date at 11:30
  const startIST = new Date(`${costaRicaDate}T11:30:00+05:30`);
  
  // Costa Rica end of day (23:59:59 UTC-6) = UTC next day 05:59:59
  // IST = UTC + 5:30, so UTC 05:59:59 = IST 11:29:59
  // Create end time: next day IST at 11:29:59
  // Use UTC date to avoid timezone issues
  const nextDayYear = day === 31 ? (month === 12 ? year + 1 : year) : year;
  const nextDayMonth = day === 31 ? (month === 12 ? 1 : month + 1) : (day >= 28 && month === 2 ? 3 : month);
  const nextDayDay = day >= 28 ? (month === 2 ? 1 : (day === 31 ? 1 : (day === 30 && [4,6,9,11].includes(month) ? 1 : day + 1))) : day + 1;
  
  // Simpler approach: add 1 day in milliseconds to start, then set to 11:29:59
  const nextDayDate = new Date(startIST.getTime() + 24 * 60 * 60 * 1000);
  const nextDayStr = `${nextDayDate.getUTCFullYear()}-${String(nextDayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDayDate.getUTCDate()).padStart(2, '0')}`;
  const endIST = new Date(`${nextDayStr}T11:29:59+05:30`);
  
  return { start: startIST, end: endIST };
}

// Get day of week
function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
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
  return { dayKey, hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

function getCostaRicaBusinessDayKeyFromDate(date: Date): string {
  const { dayKey, hour, minute } = getIstDateTimeParts(date);
  const isBeforeBoundary = hour < 11 || (hour === 11 && minute < 30);
  return isBeforeBoundary ? addDaysToIsoDate(dayKey, -1) : dayKey;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function calculateTotals(profitSheet: ProfitSheetRow[]) {
  const totals = profitSheet.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        grossRevenue: acc.grossRevenue + (row.grossRevenue || 0),
        refundAmount: acc.refundAmount + (row.refundAmount || 0),
        gst: acc.gst + row.gst,
        adsCostUSD: acc.adsCostUSD + row.adsCostUSD,
        adsCostINR: acc.adsCostINR + row.adsCostINR,
        netRevenue: acc.netRevenue + row.netRevenue,
        bundleRevenue: acc.bundleRevenue + row.bundleRevenue,
        transactionCount: acc.transactionCount + row.transactionCount,
        bundlePurchases: acc.bundlePurchases + row.bundlePurchases,
        salesCount: acc.salesCount + (row.salesCount || row.transactionCount || 0),
        refundCount: acc.refundCount + (row.refundCount || 0),
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

  const overallRoas = totals.adsCostINR > 0 ? totals.bundleRevenue / totals.adsCostINR : 0;
  const overallProfitPercent = totals.revenue > 0 ? (totals.netRevenue / totals.revenue) * 100 : 0;

  return {
    ...totals,
    roas: overallRoas,
    profitPercent: overallProfitPercent,
  };
}

async function buildProfitSheetRows(
  startDate: string,
  endDate: string,
  exchangeRate: number
): Promise<{ rows: ProfitSheetRow[]; source: string; paymentRows: SyncedPaymentRow[] }> {
  console.log(`Using exchange rate: ${exchangeRate}`);

  const metaSpendMap = await fetchMetaAdsDailySpend(startDate, endDate, exchangeRate);
  console.log(`Fetched Meta Ads spend for ${metaSpendMap.size} days`);

  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  type FinancialRow = {
    createdAt: Date;
    dayKey: string;
    kind: "sale" | "refund";
    amount: number;
    signedAmount: number;
    type: string;
  };

  const payuFetchEnd = addDaysToIsoDate(endDate, 1);
  const payuTransactions = await getPayUTransactions(startDate, payuFetchEnd);
  const paymentRows = buildSyncedPaymentRows(payuTransactions);
  const financialRows: FinancialRow[] = payuTransactions
    .map((txn) => {
      const financial = classifyPayUEvent(txn as unknown as Record<string, unknown>);
      if (financial.kind === "ignore") return null;
      const createdAt = new Date(String(txn.addedon || "").replace(" ", "T") + "+05:30");
      if (Number.isNaN(createdAt.getTime())) return null;
      const dayKey = getCostaRicaBusinessDayKeyFromDate(createdAt);
      if (dayKey < startDate || dayKey > endDate) return null;
      return {
        createdAt,
        dayKey,
        kind: financial.kind,
        amount: financial.amount,
        signedAmount: financial.signedAmount,
        type: normalizePurchaseType(txn.udf2),
      } as FinancialRow;
    })
    .filter((row): row is FinancialRow => !!row);

  const sourceUsed = "payu_live";
  console.log(`Profit sheet financial source: ${sourceUsed}, rows: ${financialRows.length}`);

  const rows: ProfitSheetRow[] = dates.map((costaRicaDate) => {
    const dayTransactions = financialRows.filter((txn) => txn.dayKey === costaRicaDate);
    const grossRevenue = dayTransactions
      .filter((event) => event.kind === "sale")
      .reduce((sum, event) => sum + event.amount, 0);
    const refundAmount = dayTransactions
      .filter((event) => event.kind === "refund")
      .reduce((sum, event) => sum + event.amount, 0);
    const revenue = grossRevenue - refundAmount;
    const gst = revenue * 0.05;
    const dailyMetaSpend = metaSpendMap.get(costaRicaDate) || { usd: 0, inr: 0 };
    const adsCostUSD = dailyMetaSpend.usd;
    const adsCostINR = dailyMetaSpend.inr;
    const netRevenue = revenue - gst - adsCostINR;
    const profitPercent = revenue > 0 ? (netRevenue / revenue) * 100 : 0;
    const salesCount = dayTransactions.filter((event) => event.kind === "sale").length;
    const refundCount = dayTransactions.filter((event) => event.kind === "refund").length;
    const bundleSaleEvents = dayTransactions.filter(
      (event) => event.kind === "sale" && isBundlePurchaseType(event.type)
    );
    const bundleRefundAmount = dayTransactions
      .filter((event) => event.kind === "refund" && isBundlePurchaseType(event.type))
      .reduce((sum, event) => sum + event.amount, 0);
    const bundleRevenue = bundleSaleEvents.reduce((sum, event) => sum + event.amount, 0) - bundleRefundAmount;
    const bundlePurchases = bundleSaleEvents.length;
    const bundleRoas = adsCostINR > 0 ? bundleRevenue / adsCostINR : 0;

    return {
      date: costaRicaDate,
      day: getDayOfWeek(costaRicaDate),
      revenue,
      grossRevenue,
      refundAmount,
      gst,
      adsCostUSD,
      adsCostINR,
      netRevenue,
      profitPercent,
      roas: bundleRoas,
      bundleRevenue,
      transactionCount: salesCount,
      bundlePurchases,
      salesCount,
      refundCount,
    };
  });

  return { rows, source: sourceUsed, paymentRows };
}

function toDbRow(row: ProfitSheetRow, exchangeRate: number, source: string) {
  const nowIso = new Date().toISOString();
  return {
    date: row.date,
    day: row.day,
    revenue: row.revenue,
    gross_revenue: row.grossRevenue || 0,
    refund_amount: row.refundAmount || 0,
    gst: row.gst,
    ads_cost_usd: row.adsCostUSD,
    ads_cost_inr: row.adsCostINR,
    net_revenue: row.netRevenue,
    profit_percent: row.profitPercent,
    roas: row.roas,
    bundle_revenue: row.bundleRevenue,
    transaction_count: row.transactionCount,
    bundle_purchases: row.bundlePurchases,
    sales_count: row.salesCount || row.transactionCount || 0,
    refund_count: row.refundCount || 0,
    exchange_rate: exchangeRate,
    source,
    synced_at: nowIso,
    updated_at: nowIso,
  };
}

function fromDbRow(row: any): ProfitSheetRow {
  return {
    date: row.date,
    day: row.day,
    revenue: Number(row.revenue || 0),
    grossRevenue: Number(row.gross_revenue || 0),
    refundAmount: Number(row.refund_amount || 0),
    gst: Number(row.gst || 0),
    adsCostUSD: Number(row.ads_cost_usd || 0),
    adsCostINR: Number(row.ads_cost_inr || 0),
    netRevenue: Number(row.net_revenue || 0),
    profitPercent: Number(row.profit_percent || 0),
    roas: Number(row.roas || 0),
    bundleRevenue: Number(row.bundle_revenue || 0),
    transactionCount: Number(row.transaction_count || 0),
    bundlePurchases: Number(row.bundle_purchases || 0),
    salesCount: Number(row.sales_count || 0),
    refundCount: Number(row.refund_count || 0),
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

  return (data || []).map(fromDbRow);
}

async function syncProfitSheetRows(
  supabase: any,
  startDate: string,
  endDate: string,
  exchangeRate: number
): Promise<{ rows: ProfitSheetRow[]; source: string }> {
  const result = await buildProfitSheetRows(startDate, endDate, exchangeRate);
  if (result.paymentRows.length > 0) {
    for (let i = 0; i < result.paymentRows.length; i += 500) {
      const batch = result.paymentRows.slice(i, i + 500);
      const { error } = await supabase
        .from("payments")
        .upsert(batch, { onConflict: "id" });

      if (error) {
        throw new Error(error.message || "Failed to sync PayU payment rows");
      }
    }
  }

  if (result.rows.length > 0) {
    const { error } = await supabase
      .from("profit_sheet")
      .upsert(result.rows.map((row) => toDbRow(row, exchangeRate, result.source)), { onConflict: "date" });

    if (error) {
      throw new Error(error.message || "Failed to sync profit sheet");
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const startDate = searchParams.get("startDate") || APP_LAUNCH_DATE;
    const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("id", token)
      .single();

    if (!sessionData) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const customExchangeRate = searchParams.get("exchangeRate");
    const exchangeRate = customExchangeRate ? parseFloat(customExchangeRate) : await fetchExchangeRate();
    const syncMode = searchParams.get("sync");
    let syncedRange: { start: string; end: string } | null = null;

    if (syncMode === "range") {
      const syncStartDate = searchParams.get("syncStartDate") || startDate;
      const syncEndDate = searchParams.get("syncEndDate") || endDate;
      await syncProfitSheetRows(supabase, syncStartDate, syncEndDate, exchangeRate);
      syncedRange = { start: syncStartDate, end: syncEndDate };
    } else if (syncMode === "last2") {
      const today = new Date().toISOString().split("T")[0];
      const syncStartDate = addDaysToIsoDate(today, -1);
      await syncProfitSheetRows(supabase, syncStartDate, today, exchangeRate);
      syncedRange = { start: syncStartDate, end: today };
    }

    const rows = await readProfitSheetRows(supabase, startDate, endDate);
    const totals = calculateTotals(rows);

    return NextResponse.json({
      rows,
      totals,
      exchangeRate,
      source: "supabase_profit_sheet",
      dateRange: { start: startDate, end: endDate },
      syncedRange,
    });
  } catch (error: any) {
    console.error("Profit sheet error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate profit sheet" },
      { status: 500 }
    );
  }
}
