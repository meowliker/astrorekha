import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

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

    // Fetch all paid payments (Razorpay)
    const { data: allPaymentsRaw } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });

    const payments: any[] = (allPaymentsRaw || []).map((p: any) => ({
      id: p.id,
      ...p,
      createdAt: p.created_at,
      customerEmail: p.customer_email,
      paymentStatus: p.payment_status,
      userId: p.user_id,
    }));

    // Helper: amount is stored in paise, convert to INR
    const getAmountINR = (p: any) => (p.amount || 0) / 100;

    // Only count paid payments for revenue
    const paidPayments = payments.filter(p => p.payment_status === "paid");

    // Revenue metrics
    const totalRevenue = paidPayments.reduce((sum, p) => sum + getAmountINR(p), 0);

    const revenueToday = paidPayments
      .filter(p => new Date(p.createdAt) >= startOfToday)
      .reduce((sum, p) => sum + getAmountINR(p), 0);

    const revenueThisWeek = paidPayments
      .filter(p => new Date(p.createdAt) >= startOfWeek)
      .reduce((sum, p) => sum + getAmountINR(p), 0);

    const revenueThisMonth = paidPayments
      .filter(p => new Date(p.createdAt) >= startOfMonth)
      .reduce((sum, p) => sum + getAmountINR(p), 0);

    const revenueThisYear = paidPayments
      .filter(p => new Date(p.createdAt) >= startOfYear)
      .reduce((sum, p) => sum + getAmountINR(p), 0);

    const revenueLastMonth = paidPayments
      .filter(p => {
        const date = new Date(p.createdAt);
        return date >= startOfLastMonth && date <= endOfLastMonth;
      })
      .reduce((sum, p) => sum + getAmountINR(p), 0);

    const momGrowth = revenueLastMonth > 0
      ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1)
      : "N/A";

    // Revenue by type
    const revenueByType = {
      bundle: paidPayments.filter(p => p.type === "bundle").reduce((sum, p) => sum + getAmountINR(p), 0),
      upsell: paidPayments.filter(p => p.type === "upsell").reduce((sum, p) => sum + getAmountINR(p), 0),
      coins: paidPayments.filter(p => p.type === "coins").reduce((sum, p) => sum + getAmountINR(p), 0),
      report: paidPayments.filter(p => p.type === "report").reduce((sum, p) => sum + getAmountINR(p), 0),
    };

    // Bundle breakdown
    const bundleBreakdown = {
      "palm-reading": {
        count: paidPayments.filter(p => p.bundle_id === "palm-reading").length,
        revenue: paidPayments.filter(p => p.bundle_id === "palm-reading").reduce((sum, p) => sum + getAmountINR(p), 0),
      },
      "palm-birth": {
        count: paidPayments.filter(p => p.bundle_id === "palm-birth").length,
        revenue: paidPayments.filter(p => p.bundle_id === "palm-birth").reduce((sum, p) => sum + getAmountINR(p), 0),
      },
      "palm-birth-compat": {
        count: paidPayments.filter(p => p.bundle_id === "palm-birth-compat").length,
        revenue: paidPayments.filter(p => p.bundle_id === "palm-birth-compat").reduce((sum, p) => sum + getAmountINR(p), 0),
      },
    };

    // Fetch all users
    const { data: allUsersRaw } = await supabase.from("users").select("*");
    const users = (allUsersRaw || []).filter(u => !u.id.startsWith("anon_"));

    const uniquePayingUsers = new Set(paidPayments.map(p => p.userId).filter(Boolean)).size;
    const arpu = uniquePayingUsers > 0 ? (totalRevenue / uniquePayingUsers).toFixed(2) : "0";

    // Payment status breakdown
    const successfulPayments = paidPayments.length;
    const failedPayments = payments.filter(p => p.payment_status === "failed").length;
    const pendingPayments = payments.filter(p => p.payment_status === "created").length;

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
      const dayRevenue = paidPayments
        .filter(p => {
          if (!p.createdAt) return false;
          const pd = new Date(p.createdAt);
          return pd >= dayStart && pd <= dayEnd;
        })
        .reduce((sum, p) => sum + getAmountINR(p), 0);
      revenueOverTime.push({ date: dateStr, revenue: dayRevenue });
    }

    // User map for transactions
    const userMap = new Map<string, { email?: string; name?: string }>();
    users.forEach(u => userMap.set(u.id, { email: u.email, name: u.name }));

    // Recent transactions
    const recentTransactions = paidPayments.slice(0, 100).map(p => {
      const ud = userMap.get(p.userId) || {};
      return {
        id: p.id,
        date: p.createdAt,
        userId: p.userId,
        userEmail: ud.email || p.customerEmail || "Unknown",
        userName: ud.name || "Unknown",
        amount: getAmountINR(p),
        bundleId: p.bundle_id,
        type: p.type,
        status: p.payment_status,
      };
    });

    // Custom date range
    let customDateRevenue: number | null = null;
    let customDatePaymentCount: number | null = null;
    let customDateTransactions: any[] = [];

    if (startDateParam) {
      const customStart = new Date(startDateParam + "T00:00:00");
      const customEnd = endDateParam
        ? new Date(endDateParam + "T23:59:59.999")
        : new Date(startDateParam + "T23:59:59.999");

      const customPayments = paidPayments.filter(p => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d >= customStart && d <= customEnd;
      });

      customDateRevenue = customPayments.reduce((sum, p) => sum + getAmountINR(p), 0);
      customDatePaymentCount = customPayments.length;
      customDateTransactions = customPayments.map(p => {
        const ud = userMap.get(p.userId) || {};
        return {
          id: p.id,
          date: p.createdAt,
          userId: p.userId,
          userEmail: (ud as any).email || p.customerEmail || "Unknown",
          userName: (ud as any).name || "Unknown",
          amount: getAmountINR(p),
          bundleId: p.bundle_id,
          type: p.type,
          status: p.payment_status,
        };
      });
    }

    return NextResponse.json({
      // Revenue KPIs (INR)
      currency: "INR",
      totalRevenue: totalRevenue.toFixed(2),
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
      failedPayments,
      pendingPayments,

      // Charts
      revenueOverTime,

      // Transactions
      recentTransactions,

      // Users
      totalUsers: users.length,
      uniquePayingUsers,

      // Custom date range
      ...(customDateRevenue !== null && {
        customDateRevenue: customDateRevenue.toFixed(2),
        customDatePaymentCount,
        customDateTransactions,
        customDateRange: { start: startDateParam, end: endDateParam || startDateParam },
      }),
    });
  } catch (error: any) {
    console.error("Admin revenue API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
