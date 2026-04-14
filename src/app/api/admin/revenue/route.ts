import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  classifyStoredPaymentEvent,
  normalizeFinanceStatus,
} from "@/lib/finance-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch all payments (explicitly set high limit to get all records)
    const { data: allPaymentsRaw, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

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

    const grossRevenue = sales.reduce((sum, p) => sum + p.amountInrAbs, 0);
    const refundAmount = refunds.reduce((sum, p) => sum + p.amountInrAbs, 0);

    console.log("Sales count:", sales.length, "Refund count:", refunds.length);

    // Net revenue = sales - refunds
    const totalRevenue = financialEvents.reduce((sum, p) => sum + p.signedAmountInr, 0);

    const revenueToday = financialEvents
      .filter((p) => new Date(p.createdAt) >= startOfToday)
      .reduce((sum, p) => sum + p.signedAmountInr, 0);

    const revenueThisWeek = financialEvents
      .filter((p) => new Date(p.createdAt) >= startOfWeek)
      .reduce((sum, p) => sum + p.signedAmountInr, 0);

    const revenueThisMonth = financialEvents
      .filter((p) => new Date(p.createdAt) >= startOfMonth)
      .reduce((sum, p) => sum + p.signedAmountInr, 0);

    const revenueThisYear = financialEvents
      .filter((p) => new Date(p.createdAt) >= startOfYear)
      .reduce((sum, p) => sum + p.signedAmountInr, 0);

    const revenueLastMonth = financialEvents
      .filter((p) => {
        const date = new Date(p.createdAt);
        return date >= startOfLastMonth && date <= endOfLastMonth;
      })
      .reduce((sum, p) => sum + p.signedAmountInr, 0);

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

    // Payment status breakdown
    const successfulPayments = sales.length;
    const refundedPayments = refunds.length;
    const failedPayments = ledgerEntries.filter((p) => p.normalizedStatus === "failed").length;
    const pendingPayments = ledgerEntries.filter(
      (p) => p.normalizedStatus === "created" || p.normalizedStatus === "pending"
    ).length;

    // Revenue over time (last 30 days)
    const revenueOverTime: { date: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const dateStr = dayStart.toISOString().split("T")[0];
      const dayRevenue = financialEvents
        .filter((p) => {
          if (!p.createdAt) return false;
          const pd = new Date(p.createdAt);
          return pd >= dayStart && pd <= dayEnd;
        })
        .reduce((sum, p) => sum + p.signedAmountInr, 0);
      revenueOverTime.push({ date: dateStr, revenue: dayRevenue });
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
      // Use time parameters for precise filtering
      const customStart = new Date(`${startDateParam}T${startTimeParam}:00`);
      const customEnd = endDateParam
        ? new Date(`${endDateParam}T${endTimeParam}:59.999`)
        : new Date(`${startDateParam}T${endTimeParam}:59.999`);

      const customPayments = financialEvents.filter((p) => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d >= customStart && d <= customEnd;
      });

      customDateRevenue = customPayments.reduce((sum, p) => sum + p.signedAmountInr, 0);
      customDatePaymentCount = customPayments.filter((p) => p.financialKind === "sale").length;
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
