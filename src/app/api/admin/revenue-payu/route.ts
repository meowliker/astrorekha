import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { classifyPayUEvent } from "@/lib/finance-events";
import { getPayUEventFingerprint, getPayUPaymentId, getPayUTransactions } from "@/lib/payu-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// App launch date - March 13, 2026 (IST)
const APP_LAUNCH_DATE = "2026-03-13";

// PayU API URL - use postservice with form=2 for JSON response
const PAYU_BASE_URL = process.env.PAYU_MODE === "live" 
  ? "https://info.payu.in/merchant/postservice?form=2"
  : "https://test.payu.in/merchant/postservice?form=2";
const PAYU_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
let payuRateLimitedUntil = 0;

interface PayUTransaction {
  mihpayid: string;
  txnid: string;
  amount: string;
  status: string;
  mode: string;
  email: string;
  phone: string;
  firstname: string;
  productinfo: string;
  addedon: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  bank_ref_num: string;
  bank_ref_no?: string;
  bankcode: string;
  error_code: string;
  error_Message: string;
  net_amount_debit: string;
  discount: string;
  field9: string;
  unmappedstatus?: string;
}

function generateHash(params: string): string {
  return crypto.createHash("sha512").update(params).digest("hex");
}

// Fetch PayU transactions for a single chunk (max 7 days)
async function fetchPayUTransactionsChunk(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  if (Date.now() < payuRateLimitedUntil) {
    return [];
  }

  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    console.error("PayU credentials missing - key:", !!merchantKey, "salt:", !!merchantSalt);
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
    } catch (parseError) {
      console.error("PayU response parse error for chunk", fromDate, "-", toDate);
      return [];
    }

    if (data.status === 1 && data.Transaction_details) {
      const allTxns = Array.isArray(data.Transaction_details) ? data.Transaction_details : Object.values(data.Transaction_details);
      return allTxns as PayUTransaction[];
    }

    if (data.msg) {
      const msg = String(data.msg);
      console.log("PayU chunk response:", fromDate, "-", toDate, "msg:", msg);
      if (msg.toLowerCase().includes("request") && msg.toLowerCase().includes("limit")) {
        payuRateLimitedUntil = Date.now() + PAYU_RATE_LIMIT_COOLDOWN_MS;
        console.warn(`PayU rate limited (revenue-payu). Cooling down for ${PAYU_RATE_LIMIT_COOLDOWN_MS / 1000}s`);
      }
    }

    return [];
  } catch (fetchError: any) {
    console.error("PayU fetch error for chunk:", fromDate, "-", toDate, fetchError.message);
    return [];
  }
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
    if (Date.now() < payuRateLimitedUntil) {
      console.warn("Skipping remaining PayU revenue chunks due to active rate-limit cooldown");
      break;
    }

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

// Convert Costa Rica time (UTC-6) to IST (UTC+5:30)
function convertCostaRicaToIST(crDateStr: string, crTimeStr: string): Date {
  // Parse Costa Rica date and time
  const [year, month, day] = crDateStr.split("-").map(Number);
  const [hours, minutes] = crTimeStr.split(":").map(Number);
  
  // Create date in Costa Rica timezone (UTC-6)
  const crDate = new Date(Date.UTC(year, month - 1, day, hours + 6, minutes, 0));
  
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(crDate.getTime() + istOffset);
  
  return istDate;
}

// Format date for PayU API (YYYY-MM-DD)
function formatDateForPayU(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIstDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
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
    
    // Date range parameters (in Costa Rica timezone by default)
    const startDateParam = searchParams.get("startDate"); // YYYY-MM-DD
    const endDateParam = searchParams.get("endDate");     // YYYY-MM-DD
    const startTimeParam = searchParams.get("startTime") || "00:00"; // HH:MM
    const endTimeParam = searchParams.get("endTime") || "23:59";     // HH:MM
    const timezone = searchParams.get("timezone") || "costa_rica"; // costa_rica or ist

    if (!token) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }

    // Verify admin session
    const { data: sessionData } = await supabase.from("admin_sessions").select("*").eq("id", token).single();
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized - Invalid session" }, { status: 401 });
    }
    
    if (new Date(sessionData.expires_at) < new Date()) {
      await supabase.from("admin_sessions").delete().eq("id", token);
      return NextResponse.json({ error: "Session expired - Please login again" }, { status: 401 });
    }

    // Calculate date range for PayU API
    let payuStartDate: string;
    let payuEndDate: string;
    let filterStartTime: Date | null = null;
    let filterEndTime: Date | null = null;

    if (startDateParam && endDateParam) {
      if (timezone === "costa_rica") {
        // Convert Costa Rica time to IST for PayU API
        const istStart = convertCostaRicaToIST(startDateParam, startTimeParam);
        const istEnd = convertCostaRicaToIST(endDateParam, endTimeParam);
        
        payuStartDate = formatDateForPayU(istStart);
        payuEndDate = formatDateForPayU(istEnd);
        filterStartTime = istStart;
        filterEndTime = istEnd;
      } else {
        // Already in IST - create dates in IST timezone
        payuStartDate = startDateParam;
        payuEndDate = endDateParam;
        
        // Parse as IST (UTC+5:30)
        // Use exact times specified by user
        filterStartTime = new Date(`${startDateParam}T${startTimeParam}:00+05:30`);
        filterEndTime = new Date(`${endDateParam}T${endTimeParam}:59+05:30`);
      }
    } else {
      // Default: from app launch to today
      payuStartDate = APP_LAUNCH_DATE;
      payuEndDate = formatDateForPayU(new Date());
    }

    // Ensure we don't fetch before app launch
    if (payuStartDate < APP_LAUNCH_DATE) {
      payuStartDate = APP_LAUNCH_DATE;
    }

    const toPayUDate = (value: string) => new Date(value.replace(" ", "T") + "+05:30");
    if (!filterStartTime) {
      filterStartTime = new Date(`${payuStartDate}T00:00:00+05:30`);
    }
    if (!filterEndTime) {
      filterEndTime = new Date(`${payuEndDate}T23:59:59+05:30`);
    }

    let transactions: PayUTransaction[] = [];
    try {
      transactions = (await getPayUTransactions(payuStartDate, payuEndDate)) as unknown as PayUTransaction[];
    } catch (payuError: any) {
      console.error("PayU fetch error:", payuError);
      return NextResponse.json(
        { error: "Failed to fetch PayU transactions", details: payuError?.message || "unknown error" },
        { status: 500 }
      );
    }

    if (filterStartTime && filterEndTime) {
      transactions = transactions.filter((txn) => {
        const txnDate = toPayUDate(txn.addedon);
        return txnDate >= filterStartTime! && txnDate <= filterEndTime!;
      });
    }

    // Deduplicate exact repeated rows while preserving status transitions
    // (e.g., failed -> captured updates for the same txnid).
    const seenEventKeys = new Set<string>();
    transactions = transactions.filter((txn) => {
      const eventKey = getPayUEventFingerprint(txn as any);
      if (seenEventKeys.has(eventKey)) return false;
      seenEventKeys.add(eventKey);
      return true;
    });

    const processedTransactions = transactions
      .map((txn) => {
        const financial = classifyPayUEvent(txn as unknown as Record<string, unknown>);
        if (financial.kind === "ignore") return null;
        const txnDate = toPayUDate(txn.addedon);
        if (Number.isNaN(txnDate.getTime())) return null;
        return {
          id: getPayUPaymentId(txn as any) || txn.txnid,
          payuId: getPayUPaymentId(txn as any),
          txnId: txn.txnid,
          amountAbs: financial.amount,
          signedAmount: financial.signedAmount,
          financialKind: financial.kind,
          status: txn.status,
          email: txn.email,
          phone: txn.phone,
          name: txn.firstname || "Customer",
          productInfo: txn.productinfo,
          date: txn.addedon,
          dateIST: txnDate,
          userId: txn.udf1 || "",
          type: txn.udf2 || "bundle",
          bundleId: txn.udf3 || "",
          feature: txn.udf4 || "",
          coins: parseInt(txn.udf5) || 0,
          bankRef: txn.bank_ref_num || txn.bank_ref_no || "",
          paymentMode: txn.mode,
          netAmount: parseFloat(txn.net_amount_debit) || parseFloat(txn.amount) || 0,
        };
      })
      .filter((txn): txn is NonNullable<typeof txn> => !!txn);

    const sourceUsed = "payu_live";

    const saleTransactions = processedTransactions.filter((txn) => txn.financialKind === "sale");
    const refundTransactions = processedTransactions.filter((txn) => txn.financialKind === "refund");

    // Net revenue (sales - refunds)
    const grossRevenue = saleTransactions.reduce((sum, txn) => sum + txn.amountAbs, 0);
    const refundAmount = refundTransactions.reduce((sum, txn) => sum + txn.amountAbs, 0);
    const totalRevenue = processedTransactions.reduce((sum, txn) => sum + txn.signedAmount, 0);
    const totalNetRevenue = totalRevenue;
    const uniqueUsers = new Set(saleTransactions.map((txn) => txn.email).filter(Boolean)).size;

    // Revenue by bundle
    const bundleBreakdown = {
      "palm-reading": { count: 0, revenue: 0 },
      "palm-birth": { count: 0, revenue: 0 },
      "palm-birth-compat": { count: 0, revenue: 0 },
      "palm-birth-sketch": { count: 0, revenue: 0 },
    };

    processedTransactions.forEach((txn) => {
      const bundleId = txn.bundleId as keyof typeof bundleBreakdown;
      if (bundleBreakdown[bundleId]) {
        bundleBreakdown[bundleId].count += txn.financialKind === "refund" ? -1 : 1;
        bundleBreakdown[bundleId].revenue += txn.signedAmount;
      }
    });

    // Revenue by type
    const revenueByType = {
      bundle: 0,
      upsell: 0,
      coins: 0,
      report: 0,
    };

    processedTransactions.forEach((txn) => {
      const type = txn.type as keyof typeof revenueByType;
      if (revenueByType[type] !== undefined) {
        revenueByType[type] += txn.signedAmount;
      } else {
        revenueByType.bundle += txn.signedAmount;
      }
    });

    // Revenue by day (for chart)
    const revenueByDay: Record<string, number> = {};
    processedTransactions.forEach((txn) => {
      const dateStr = getIstDateKey(txn.dateIST);
      revenueByDay[dateStr] = (revenueByDay[dateStr] || 0) + txn.signedAmount;
    });

    const revenueOverTime = Object.entries(revenueByDay)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate period metrics (IST boundaries)
    const todayIstKey = getIstDateKey(new Date());
    const startOfToday = new Date(`${todayIstKey}T00:00:00+05:30`);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(`${todayIstKey.slice(0, 7)}-01T00:00:00+05:30`);

    const revenueToday = processedTransactions
      .filter((txn) => txn.dateIST >= startOfToday)
      .reduce((sum, txn) => sum + txn.signedAmount, 0);

    const revenueThisWeek = processedTransactions
      .filter((txn) => txn.dateIST >= startOfWeek)
      .reduce((sum, txn) => sum + txn.signedAmount, 0);

    const revenueThisMonth = processedTransactions
      .filter((txn) => txn.dateIST >= startOfMonth)
      .reduce((sum, txn) => sum + txn.signedAmount, 0);

    // ARPU
    const arpu = uniqueUsers > 0 ? (totalRevenue / uniqueUsers).toFixed(2) : "0";

    // Recent transactions (sorted by date desc)
    const recentTransactions = [...processedTransactions]
      .sort((a, b) => b.dateIST.getTime() - a.dateIST.getTime())
      .slice(0, 100)
      .map((txn) => ({
        id: txn.id,
        date: txn.date,
        userId: txn.userId,
        userEmail: txn.email,
        userName: txn.name,
        amount: txn.signedAmount,
        bundleId: txn.bundleId,
        type: txn.type,
        status: txn.financialKind === "refund" ? "refunded" : "paid",
        paymentMode: txn.paymentMode,
        bankRef: txn.bankRef,
      }));

    return NextResponse.json({
      source: sourceUsed,
      currency: "INR",
      dateRange: {
        start: payuStartDate,
        end: payuEndDate,
        startTime: startTimeParam,
        endTime: endTimeParam,
        timezone,
        filterStartIST: filterStartTime?.toISOString(),
        filterEndIST: filterEndTime?.toISOString(),
      },
      
      // Revenue KPIs
      totalRevenue: totalRevenue.toFixed(2),
      grossRevenue: grossRevenue.toFixed(2),
      refundAmount: refundAmount.toFixed(2),
      totalNetRevenue: totalNetRevenue.toFixed(2),
      revenueToday: revenueToday.toFixed(2),
      revenueThisWeek: revenueThisWeek.toFixed(2),
      revenueThisMonth: revenueThisMonth.toFixed(2),
      
      // Breakdown
      revenueByType,
      bundleBreakdown,
      
      // Users
      uniquePayingUsers: uniqueUsers,
      arpu,
      
      // Transactions
      totalTransactions: processedTransactions.length,
      successfulPayments: saleTransactions.length,
      refundedPayments: refundTransactions.length,
      failedPayments: 0,
      pendingPayments: 0,
      
      // Charts
      revenueOverTime,
      
      // Recent transactions
      recentTransactions,
      
      // Custom date range (for compatibility)
      customDateRevenue: totalRevenue.toFixed(2),
      customDatePaymentCount: saleTransactions.length,
      customDateTransactions: recentTransactions,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("Admin revenue-payu API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
