import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  classifyStoredPaymentEvent,
  normalizeFinanceStatus,
} from "@/lib/finance-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_LAUNCH_DATE = "2026-03-13";

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

const UPSELL_LABELS: Record<string, string> = {
  "2026-predictions": "2026 Future Predictions",
  prediction2026: "2026 Future Predictions",
  compatibility: "Compatibility Report",
  compatibilityTest: "Compatibility Report",
  "birth-chart": "Birth Chart Report",
  birthChart: "Birth Chart Report",
  "soulmate-sketch": "Soulmate Sketch",
  soulmateSketch: "Soulmate Sketch",
  "vastu-shastra-guide": "Complete Vastu Shastra Guide Ebook",
  "report-vastu-shastra-guide": "Complete Vastu Shastra Guide Ebook",
  vastuShastraGuide: "Complete Vastu Shastra Guide Ebook",
};

function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function fromProfitSheetDbRow(row: any): ProfitSheetRow {
  return {
    date: String(row.date || ""),
    day: String(row.day || ""),
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
    salesCount: Number(row.sales_count || row.transaction_count || 0),
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

  return (data || []).map(fromProfitSheetDbRow);
}

function sumProfitRows(rows: ProfitSheetRow[]) {
  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      grossRevenue: acc.grossRevenue + row.grossRevenue,
      refundAmount: acc.refundAmount + row.refundAmount,
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

function filterProfitRows(rows: ProfitSheetRow[], startDate: string, endDate: string) {
  return rows.filter((row) => row.date >= startDate && row.date <= endDate);
}

function getPaymentUserKey(payment: any): string {
  return String(payment?.userId || payment?.user_id || payment?.customerEmail || payment?.customer_email || "")
    .trim()
    .toLowerCase();
}

function parseUpsellItems(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => UPSELL_LABELS[item] || item.replace(/-/g, " "));
}

function buildUpsellAttachmentSummary(sales: any[]) {
  const bundleBuyerKeys = new Set<string>();
  const upsellsByBuyer = new Map<string, { items: Set<string>; revenue: number; itemRevenue: Map<string, number> }>();

  for (const payment of sales) {
    const userKey = getPaymentUserKey(payment);
    if (!userKey) continue;

    const type = String(payment?.type || "").trim().toLowerCase();
    if (type === "bundle" || type === "bundle_payment") {
      bundleBuyerKeys.add(userKey);
      continue;
    }

    if (type !== "upsell") continue;

    const itemNames = parseUpsellItems(payment?.bundle_id).length > 0
      ? parseUpsellItems(payment?.bundle_id)
      : parseUpsellItems(payment?.feature);
    if (itemNames.length === 0) continue;

    const current = upsellsByBuyer.get(userKey) || { items: new Set<string>(), revenue: 0, itemRevenue: new Map<string, number>() };
    const amount = Number(payment?.amountInrAbs ?? payment?.amount ?? 0) || 0;
    const allocatedAmount = itemNames.length > 0 ? amount / itemNames.length : 0;
    itemNames.forEach((item) => current.items.add(item));
    itemNames.forEach((item) => current.itemRevenue.set(item, (current.itemRevenue.get(item) || 0) + allocatedAmount));
    current.revenue += amount;
    upsellsByBuyer.set(userKey, current);
  }

  const bundleBuyerCount = bundleBuyerKeys.size;
  const combinationMap = new Map<string, { items: string[]; buyers: number; revenue: number }>();
  const itemMap = new Map<string, { item: string; buyers: number; revenue: number }>();
  let noUpsellBuyers = 0;

  for (const userKey of bundleBuyerKeys) {
    const userUpsells = upsellsByBuyer.get(userKey);
    if (!userUpsells || userUpsells.items.size === 0) {
      noUpsellBuyers += 1;
      continue;
    }

    const items = Array.from(userUpsells.items).sort();
    const combinationKey = items.join(" + ");
    const currentCombo = combinationMap.get(combinationKey) || { items, buyers: 0, revenue: 0 };
    currentCombo.buyers += 1;
    currentCombo.revenue += userUpsells.revenue;
    combinationMap.set(combinationKey, currentCombo);

    for (const item of items) {
      const currentItem = itemMap.get(item) || { item, buyers: 0, revenue: 0 };
      currentItem.buyers += 1;
      currentItem.revenue += userUpsells.itemRevenue.get(item) || 0;
      itemMap.set(item, currentItem);
    }
  }

  const toPercent = (buyers: number) => (bundleBuyerCount > 0 ? Number(((buyers / bundleBuyerCount) * 100).toFixed(2)) : 0);
  const combinationBreakdown = Array.from(combinationMap.values())
    .map((row) => ({
      label: row.items.join(" + "),
      items: row.items,
      itemCount: row.items.length,
      buyers: row.buyers,
      percentOfBundleBuyers: toPercent(row.buyers),
      revenue: Number(row.revenue.toFixed(2)),
    }))
    .sort((a, b) => b.buyers - a.buyers || b.revenue - a.revenue);

  const itemBreakdown = Array.from(itemMap.values())
    .map((row) => ({
      item: row.item,
      buyers: row.buyers,
      percentOfBundleBuyers: toPercent(row.buyers),
      revenue: Number(row.revenue.toFixed(2)),
    }))
    .sort((a, b) => b.buyers - a.buyers || b.revenue - a.revenue);

  const upsellBuyerCount = bundleBuyerCount - noUpsellBuyers;
  const upsellRevenue = combinationBreakdown.reduce((sum, row) => sum + row.revenue, 0);

  return {
    bundleBuyerCount,
    upsellBuyerCount,
    noUpsellBuyers,
    upsellAttachRate: toPercent(upsellBuyerCount),
    noUpsellRate: toPercent(noUpsellBuyers),
    upsellRevenue: Number(upsellRevenue.toFixed(2)),
    combinationBreakdown,
    itemBreakdown,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Create fresh Supabase client directly - no caching
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const startTimeParam = searchParams.get("startTime") || "00:00";
    const endTimeParam = searchParams.get("endTime") || "23:59";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }

    // Verify admin session token
    const { data: sessionData } = await supabase.from("admin_sessions").select("*").eq("id", token).single();
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized - Invalid session" }, { status: 401 });
    }
    
    if (new Date(sessionData.expires_at) < new Date()) {
      await supabase.from("admin_sessions").delete().eq("id", token);
      return NextResponse.json({ error: "Session expired - Please login again" }, { status: 401 });
    }

    const now = new Date();
    const todayIso = now.toISOString().split("T")[0];
    const startOfTodayIso = todayIso;
    const startOfWeekDate = new Date(`${todayIso}T00:00:00.000Z`);
    startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
    const startOfWeekIso = startOfWeekDate.toISOString().split("T")[0];
    const startOfMonthIso = `${todayIso.slice(0, 8)}01`;
    const startOfYearIso = `${todayIso.slice(0, 4)}-01-01`;
    const startOfLastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const endOfLastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const startOfLastMonthIso = startOfLastMonthDate.toISOString().split("T")[0];
    const endOfLastMonthIso = endOfLastMonthDate.toISOString().split("T")[0];

    const profitSheetRows = await readProfitSheetRows(supabase, APP_LAUNCH_DATE, todayIso);
    const allTimeLedger = sumProfitRows(profitSheetRows);
    const todayLedger = sumProfitRows(filterProfitRows(profitSheetRows, startOfTodayIso, todayIso));
    const weekLedger = sumProfitRows(filterProfitRows(profitSheetRows, startOfWeekIso, todayIso));
    const monthLedger = sumProfitRows(filterProfitRows(profitSheetRows, startOfMonthIso, todayIso));
    const yearLedger = sumProfitRows(filterProfitRows(profitSheetRows, startOfYearIso, todayIso));
    const lastMonthLedger = sumProfitRows(filterProfitRows(profitSheetRows, startOfLastMonthIso, endOfLastMonthIso));

    // Fetch payment rows for transaction/breakdown context. Revenue totals come from profit_sheet.
    const { data: allPaymentsRaw, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10000);

    if (paymentsError) {
      console.error("Payments fetch error:", paymentsError);
    }

    const payments: any[] = (allPaymentsRaw || []).map((p: any) => ({
      id: p.id,
      ...p,
      createdAt: p.created_at,
      customerEmail: p.customer_email,
      paymentStatus: p.payment_status,
      userId: p.user_id,
    }));

    // Log payment statuses for debugging
    const statusCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    payments.forEach(p => {
      const status = p.payment_status || "unknown";
      const type = p.type || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    console.log("Payment status breakdown:", statusCounts);
    console.log("Payment type breakdown:", typeCounts);
    console.log("Total payments in DB:", payments.length);
    
    // Log first few payments for debugging
    if (payments.length > 0) {
      console.log("Sample payment:", JSON.stringify(payments[0]).slice(0, 500));
    }

    const ledgerEntries = payments.map((p) => {
      const financial = classifyStoredPaymentEvent(p.payment_status, p.amount);
      return {
        ...p,
        normalizedStatus: normalizeFinanceStatus(p.payment_status),
        financialKind: financial.kind,
        amountInrAbs: financial.amount,
        signedAmountInr: financial.signedAmount,
      };
    });

    const sales = ledgerEntries.filter((p) => p.financialKind === "sale");
    const refunds = ledgerEntries.filter((p) => p.financialKind === "refund");
    const financialEvents = ledgerEntries.filter((p) => p.financialKind !== "ignore");

    console.log("Sales count:", sales.length, "Refund count:", refunds.length);

    const grossRevenue = allTimeLedger.grossRevenue;
    const refundAmount = allTimeLedger.refundAmount;
    const totalRevenue = allTimeLedger.revenue;
    const revenueToday = todayLedger.revenue;
    const revenueThisWeek = weekLedger.revenue;
    const revenueThisMonth = monthLedger.revenue;
    const revenueThisYear = yearLedger.revenue;
    const revenueLastMonth = lastMonthLedger.revenue;

    const momGrowth = revenueLastMonth > 0
      ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1)
      : "N/A";

    // Revenue by type (handle both "bundle" and "bundle_payment" types)
    const revenueByType = {
      bundle: financialEvents
        .filter((p) => p.type === "bundle" || p.type === "bundle_payment")
        .reduce((sum, p) => sum + p.signedAmountInr, 0),
      upsell: financialEvents
        .filter((p) => p.type === "upsell")
        .reduce((sum, p) => sum + p.signedAmountInr, 0),
      coins: financialEvents
        .filter((p) => p.type === "coins")
        .reduce((sum, p) => sum + p.signedAmountInr, 0),
      report: financialEvents
        .filter((p) => p.type === "report")
        .reduce((sum, p) => sum + p.signedAmountInr, 0),
    };

    // Bundle breakdown
    const bundleBreakdown = {
      "palm-reading": {
        count: financialEvents
          .filter((p) => p.bundle_id === "palm-reading")
          .reduce((sum, p) => sum + (p.financialKind === "refund" ? -1 : 1), 0),
        revenue: financialEvents
          .filter((p) => p.bundle_id === "palm-reading")
          .reduce((sum, p) => sum + p.signedAmountInr, 0),
      },
      "palm-birth": {
        count: financialEvents
          .filter((p) => p.bundle_id === "palm-birth")
          .reduce((sum, p) => sum + (p.financialKind === "refund" ? -1 : 1), 0),
        revenue: financialEvents
          .filter((p) => p.bundle_id === "palm-birth")
          .reduce((sum, p) => sum + p.signedAmountInr, 0),
      },
      "palm-birth-compat": {
        count: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-compat")
          .reduce((sum, p) => sum + (p.financialKind === "refund" ? -1 : 1), 0),
        revenue: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-compat")
          .reduce((sum, p) => sum + p.signedAmountInr, 0),
      },
      "palm-birth-sketch": {
        count: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-sketch")
          .reduce((sum, p) => sum + (p.financialKind === "refund" ? -1 : 1), 0),
        revenue: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-sketch")
          .reduce((sum, p) => sum + p.signedAmountInr, 0),
      },
      "palm-birth-sketch-aura-astro": {
        count: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-sketch-aura-astro")
          .reduce((sum, p) => sum + (p.financialKind === "refund" ? -1 : 1), 0),
        revenue: financialEvents
          .filter((p) => p.bundle_id === "palm-birth-sketch-aura-astro")
          .reduce((sum, p) => sum + p.signedAmountInr, 0),
      },
    };

    // Fetch all users (include anon users who made payments)
    const { data: allUsersRaw } = await supabase.from("users").select("*");
    const users = allUsersRaw || [];
    // Count registered users (non-anon) separately for display
    const registeredUsers = users.filter(u => !u.id.startsWith("anon_"));
    // Count all users with payment_status = paid as paying users
    const paidUsers = users.filter(u => u.payment_status === "paid");

    const uniquePayingUsers = new Set(sales.map(p => p.userId).filter(Boolean)).size;
    const arpu = uniquePayingUsers > 0 ? (totalRevenue / uniquePayingUsers).toFixed(2) : "0";
    const upsellAttachment = buildUpsellAttachmentSummary(sales);

    // Payment status breakdown
    const successfulPayments = allTimeLedger.paidOrders || sales.length;
    const refundedPayments = allTimeLedger.refundCount || refunds.length;
    const failedPayments = ledgerEntries.filter((p) => p.normalizedStatus === "failed").length;
    const pendingPayments = ledgerEntries.filter(
      (p) => p.normalizedStatus === "created" || p.normalizedStatus === "pending"
    ).length;

    // Revenue over time (last 30 days)
    const revenueOverTime: { date: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dateStr = addDaysToIsoDate(todayIso, -i);
      const dayLedger = sumProfitRows(filterProfitRows(profitSheetRows, dateStr, dateStr));
      revenueOverTime.push({ date: dateStr, revenue: dayLedger.revenue });
    }

    // User map for transactions
    const userMap = new Map<string, { email?: string; name?: string }>();
    users.forEach(u => userMap.set(u.id, { email: u.email, name: u.name }));

    // Recent transactions
    const recentTransactions = financialEvents
      .slice(0, 100)
      .map((p) => {
      const ud = userMap.get(p.userId) || {};
      return {
        id: p.id,
        date: p.createdAt,
        userId: p.userId,
        userEmail: ud.email || p.customerEmail || "Unknown",
        userName: ud.name || "Unknown",
        amount: p.signedAmountInr,
        bundleId: p.bundle_id,
        type: p.type,
        status: p.financialKind === "refund" ? "refunded" : p.payment_status,
      };
    });

    // Custom date range
    let customDateRevenue: number | null = null;
    let customDatePaymentCount: number | null = null;
    let customDateTransactions: any[] = [];

    if (startDateParam) {
      const customEndDate = endDateParam || startDateParam;
      const customLedger = sumProfitRows(filterProfitRows(profitSheetRows, startDateParam, customEndDate));
      customDateRevenue = customLedger.revenue;
      customDatePaymentCount = customLedger.paidOrders;

      // Transaction list still comes from Supabase payments so admins can inspect rows.
      const customStart = new Date(`${startDateParam}T${startTimeParam}:00`);
      const customEnd = customEndDate
        ? new Date(`${customEndDate}T${endTimeParam}:59.999`)
        : new Date(`${startDateParam}T${endTimeParam}:59.999`);

      const customPayments = financialEvents.filter((p) => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d >= customStart && d <= customEnd;
      });

      customDateTransactions = customPayments.map((p) => {
        const ud = userMap.get(p.userId) || {};
        return {
          id: p.id,
          date: p.createdAt,
          userId: p.userId,
          userEmail: (ud as any).email || p.customerEmail || "Unknown",
          userName: (ud as any).name || "Unknown",
          amount: p.signedAmountInr,
          bundleId: p.bundle_id,
          type: p.type,
          status: p.financialKind === "refund" ? "refunded" : p.payment_status,
        };
      });
    }

    return NextResponse.json({
      // Revenue KPIs (INR)
      currency: "INR",
      totalRevenue: totalRevenue.toFixed(2),
      grossRevenue: grossRevenue.toFixed(2),
      refundAmount: refundAmount.toFixed(2),
      revenueToday: revenueToday.toFixed(2),
      revenueThisWeek: revenueThisWeek.toFixed(2),
      revenueThisMonth: revenueThisMonth.toFixed(2),
      revenueThisYear: revenueThisYear.toFixed(2),
      revenueLastMonth: revenueLastMonth.toFixed(2),
      momGrowth,

      // Revenue breakdown
      revenueByType,
      bundleBreakdown,
      upsellAttachment,
      arpu,

      // Transaction activity
      totalPayments: payments.length,
      successfulPayments,
      refundedPayments,
      failedPayments,
      pendingPayments,

      // Charts
      revenueOverTime,

      // Transactions
      recentTransactions,

      // Users
      totalUsers: users.length,
      registeredUsers: registeredUsers.length,
      paidUsersFromDB: paidUsers.length,
      uniquePayingUsers: uniquePayingUsers || paidUsers.length,

      // Custom date range
      ...(customDateRevenue !== null && {
        customDateRevenue: customDateRevenue.toFixed(2),
        customDatePaymentCount,
        customDateTransactions,
        customDateRange: { start: startDateParam, end: endDateParam || startDateParam },
      }),
      source: "supabase_profit_sheet",
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("Admin revenue API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
// Force redeploy Mon Mar  9 17:24:14 IST 2026
