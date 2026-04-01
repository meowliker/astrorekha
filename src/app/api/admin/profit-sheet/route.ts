import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyPayUEvent } from "@/lib/finance-events";
import { getPayUTransactions } from "@/lib/payu-api";

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
  transactionCount: number;
  salesCount?: number;
  refundCount?: number;
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


// Fetch Meta Ads daily spend for a date range
async function fetchMetaAdsDailySpend(startDate: string, endDate: string): Promise<Map<string, number>> {
  const metaAccessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!metaAccessToken || !adAccountId) {
    return new Map();
  }

  try {
    const dateParams = `time_range={"since":"${startDate}","until":"${endDate}"}`;
    const dailyUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=spend&time_increment=1&${dateParams}&limit=90&access_token=${metaAccessToken}`;

    const response = await fetch(dailyUrl);
    const data = await response.json();

    const spendMap = new Map<string, number>();
    if (data.data) {
      data.data.forEach((day: { date_start: string; spend: string }) => {
        spendMap.set(day.date_start, parseFloat(day.spend || "0"));
      });
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

    // Verify admin session
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

    // Get exchange rate (use custom if provided, otherwise fetch)
    const customExchangeRate = searchParams.get("exchangeRate");
    const exchangeRate = customExchangeRate ? parseFloat(customExchangeRate) : await fetchExchangeRate();
    console.log(`Using exchange rate: ${exchangeRate}`);

    // Fetch Meta Ads daily spend (in USD)
    const metaSpendMap = await fetchMetaAdsDailySpend(startDate, endDate);
    console.log(`Fetched Meta Ads spend for ${metaSpendMap.size} days`);

    // Generate date range
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
    };

    const payuFetchEnd = addDaysToIsoDate(endDate, 1);
    const payuTransactions = await getPayUTransactions(startDate, payuFetchEnd);
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
        } as FinancialRow;
      })
      .filter((row): row is FinancialRow => !!row);

    const sourceUsed = "payu_live";

    console.log(`Profit sheet financial source: ${sourceUsed}, rows: ${financialRows.length}`);

    // Build profit sheet rows
    const profitSheet: ProfitSheetRow[] = dates.map(costaRicaDate => {
      const { start: istStart, end: istEnd } = getISTRangeForCostaRicaDate(costaRicaDate);
      
      // Debug log for first date
      if (costaRicaDate === dates[0]) {
        console.log(`Profit Sheet Debug - Date: ${costaRicaDate}`);
        console.log(`IST Start: ${istStart.toISOString()} (${istStart.toString()})`);
        console.log(`IST End: ${istEnd.toISOString()} (${istEnd.toString()})`);
        if (financialRows.length > 0) {
          const sample = financialRows[0];
          console.log(`Sample financial row: kind=${sample.kind}, amount=${sample.signedAmount}, at=${sample.createdAt.toISOString()}`);
        }
      }
      
      // Filter transactions for this Costa Rica day (historical from Supabase, current day optionally overlaid from PayU live)
      const dayTransactions = financialRows.filter((txn) => txn.dayKey === costaRicaDate);

      const grossRevenue = dayTransactions
        .filter((event) => event.kind === "sale")
        .reduce((sum, event) => sum + event.amount, 0);
      const refundAmount = dayTransactions
        .filter((event) => event.kind === "refund")
        .reduce((sum, event) => sum + event.amount, 0);
      const revenue = grossRevenue - refundAmount;

      const gst = revenue * 0.05; // 5% GST on net revenue
      const adsCostUSD = metaSpendMap.get(costaRicaDate) || 0;
      const adsCostINR = adsCostUSD * exchangeRate; // Convert USD to INR
      const netRevenue = revenue - gst - adsCostINR;
      const profitPercent = revenue > 0 ? (netRevenue / revenue) * 100 : 0;
      const roas = adsCostINR > 0 ? revenue / adsCostINR : 0;
      const salesCount = dayTransactions.filter((event) => event.kind === "sale").length;
      const refundCount = dayTransactions.filter((event) => event.kind === "refund").length;

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
        roas,
        transactionCount: salesCount,
        salesCount,
        refundCount,
      };
    });

    // Calculate totals
    const totals = profitSheet.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        grossRevenue: acc.grossRevenue + (row.grossRevenue || 0),
        refundAmount: acc.refundAmount + (row.refundAmount || 0),
        gst: acc.gst + row.gst,
        adsCostUSD: acc.adsCostUSD + row.adsCostUSD,
        adsCostINR: acc.adsCostINR + row.adsCostINR,
        netRevenue: acc.netRevenue + row.netRevenue,
        transactionCount: acc.transactionCount + row.transactionCount,
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
        transactionCount: 0,
        salesCount: 0,
        refundCount: 0,
      }
    );

    const overallRoas = totals.adsCostINR > 0 ? totals.revenue / totals.adsCostINR : 0;
    const overallProfitPercent = totals.revenue > 0 ? (totals.netRevenue / totals.revenue) * 100 : 0;

    return NextResponse.json({
      rows: profitSheet,
      totals: {
        ...totals,
        roas: overallRoas,
        profitPercent: overallProfitPercent,
      },
      exchangeRate,
      source: sourceUsed,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error: any) {
    console.error("Profit sheet error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate profit sheet" },
      { status: 500 }
    );
  }
}
