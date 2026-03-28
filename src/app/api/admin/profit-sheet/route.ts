import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_LAUNCH_DATE = "2026-03-13";

// PayU API URL
const PAYU_BASE_URL = process.env.PAYU_MODE === "live" 
  ? "https://info.payu.in/merchant/postservice?form=2"
  : "https://test.payu.in/merchant/postservice?form=2";

// Meta API
const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface PayUTransaction {
  mihpayid: string;
  txnid: string;
  amount: string;
  status: string;
  addedon: string;
  email: string;
}

interface ProfitSheetRow {
  date: string;
  day: string;
  revenue: number;
  gst: number;
  adsCostUSD: number;
  adsCostINR: number;
  netRevenue: number;
  profitPercent: number;
  roas: number;
  transactionCount: number;
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

function generateHash(params: string): string {
  return crypto.createHash("sha512").update(params).digest("hex");
}

// Fetch PayU transactions for a single chunk (max 7 days)
async function fetchPayUTransactionsChunk(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    throw new Error("PayU credentials not configured");
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
    console.error("PayU response parse error for chunk", fromDate, "-", toDate);
    return [];
  }

  if (data.status === 1 && data.Transaction_details) {
    const allTxns = Array.isArray(data.Transaction_details) 
      ? data.Transaction_details 
      : Object.values(data.Transaction_details);
    return allTxns.filter(
      (txn: PayUTransaction) => txn.status === "success" || txn.status === "captured"
    );
  }

  if (data.msg) {
    console.log("PayU chunk response:", fromDate, "-", toDate, "msg:", data.msg);
  }

  return [];
}

// Fetch PayU transactions for a date range (handles >7 day ranges by chunking)
async function fetchPayUTransactions(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);
  const allTransactions: PayUTransaction[] = [];
  
  // PayU API has a 7-day limit, so we fetch in chunks
  const MAX_DAYS = 7;
  let currentStart = new Date(startDate);
  
  while (currentStart <= endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + MAX_DAYS - 1);
    
    // Don't go past the end date
    if (currentEnd > endDate) {
      currentEnd.setTime(endDate.getTime());
    }
    
    const chunkFromDate = currentStart.toISOString().split("T")[0];
    const chunkToDate = currentEnd.toISOString().split("T")[0];
    
    console.log(`Fetching PayU chunk: ${chunkFromDate} to ${chunkToDate}`);
    
    const chunkTransactions = await fetchPayUTransactionsChunk(chunkFromDate, chunkToDate);
    allTransactions.push(...chunkTransactions);
    
    // Move to next chunk
    currentStart.setDate(currentEnd.getDate() + 1);
  }
  
  console.log(`Total PayU transactions fetched: ${allTransactions.length}`);
  return allTransactions;
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

    // Fetch PayU transactions for the entire range
    const transactions = await fetchPayUTransactions(startDate, endDate);
    console.log(`Fetched ${transactions.length} PayU transactions for profit sheet`);

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

    // Build profit sheet rows
    const profitSheet: ProfitSheetRow[] = dates.map(costaRicaDate => {
      const { start: istStart, end: istEnd } = getISTRangeForCostaRicaDate(costaRicaDate);
      
      // Debug log for first date
      if (costaRicaDate === dates[0]) {
        console.log(`Profit Sheet Debug - Date: ${costaRicaDate}`);
        console.log(`IST Start: ${istStart.toISOString()} (${istStart.toString()})`);
        console.log(`IST End: ${istEnd.toISOString()} (${istEnd.toString()})`);
        if (transactions.length > 0) {
          const sampleTxn = transactions[0];
          const sampleDate = new Date(sampleTxn.addedon.replace(" ", "T") + "+05:30");
          console.log(`Sample txn: ${sampleTxn.addedon} -> ${sampleDate.toISOString()}`);
        }
      }
      
      // Filter transactions for this Costa Rica day (IST 11:30 AM to next day 11:29 AM)
      const dayTransactions = transactions.filter(txn => {
        // PayU addedon is in IST format: "2026-03-15 14:03:53"
        const txnDate = new Date(txn.addedon.replace(" ", "T") + "+05:30");
        return txnDate >= istStart && txnDate <= istEnd;
      });

      const revenue = dayTransactions.reduce((sum, txn) => sum + parseFloat(txn.amount || "0"), 0);
      const gst = revenue * 0.05; // 5% GST
      const adsCostUSD = metaSpendMap.get(costaRicaDate) || 0;
      const adsCostINR = adsCostUSD * exchangeRate; // Convert USD to INR
      const netRevenue = revenue - gst - adsCostINR;
      const profitPercent = revenue > 0 ? (netRevenue / revenue) * 100 : 0;
      const roas = adsCostINR > 0 ? revenue / adsCostINR : 0;

      return {
        date: costaRicaDate,
        day: getDayOfWeek(costaRicaDate),
        revenue,
        gst,
        adsCostUSD,
        adsCostINR,
        netRevenue,
        profitPercent,
        roas,
        transactionCount: dayTransactions.length,
      };
    });

    // Calculate totals
    const totals = profitSheet.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        gst: acc.gst + row.gst,
        adsCostUSD: acc.adsCostUSD + row.adsCostUSD,
        adsCostINR: acc.adsCostINR + row.adsCostINR,
        netRevenue: acc.netRevenue + row.netRevenue,
        transactionCount: acc.transactionCount + row.transactionCount,
      }),
      { revenue: 0, gst: 0, adsCostUSD: 0, adsCostINR: 0, netRevenue: 0, transactionCount: 0 }
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
