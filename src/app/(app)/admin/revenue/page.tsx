"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  DollarSign,
  Users,
  CreditCard,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  ShieldAlert,
  Calendar,
  PieChart,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  ArrowUpDown,
  Package,
  X,
  HelpCircle,
} from "lucide-react";

interface RevenueData {
  currency: string;
  totalRevenue: string;
  revenueToday: string;
  revenueThisWeek: string;
  revenueThisMonth: string;
  revenueThisYear: string;
  revenueLastMonth: string;
  momGrowth: string;
  revenueByType: { bundle: number; upsell: number; coins: number; report: number };
  bundleBreakdown: {
    "palm-reading": { count: number; revenue: number };
    "palm-birth": { count: number; revenue: number };
    "palm-birth-compat": { count: number; revenue: number };
  };
  arpu: string;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  revenueOverTime: { date: string; revenue: number }[];
  recentTransactions: {
    id: string;
    date: string;
    userId: string;
    userEmail: string;
    userName: string;
    amount: number;
    bundleId: string;
    type: string;
    status: string;
  }[];
  totalUsers: number;
  uniquePayingUsers: number;
  customDateRevenue?: string;
  customDatePaymentCount?: number;
  customDateTransactions?: {
    id: string;
    date: string;
    userId: string;
    userEmail: string;
    userName: string;
    amount: number;
    bundleId: string;
    type: string;
    status: string;
  }[];
  customDateRange?: { start: string; end: string };
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBundle, setFilterBundle] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");

  // Date picker
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [dateLoading, setDateLoading] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setDateLoading(true);

      const token = localStorage.getItem("admin_session_token");
      const expiry = localStorage.getItem("admin_session_expiry");

      if (!token || !expiry || new Date(expiry) < new Date()) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      let url = `/api/admin/revenue?token=${token}`;
      if (selectedDate) {
        url += `&startDate=${selectedDate}&endDate=${selectedDate}`;
      }
      const response = await fetch(url);

      if (response.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch revenue data");
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setDateLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [router, selectedDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading revenue data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">Error</h1>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={() => router.push("/admin/login")}
            className="px-6 py-2 bg-primary text-white rounded-lg"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSelectedDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  };

  // Filter transactions
  const getFilteredTransactions = () => {
    let filtered = [...(data.recentTransactions || [])];

    if (filterType !== "all") {
      filtered = filtered.filter((tx) => tx.type === filterType);
    }
    if (filterBundle !== "all") {
      filtered = filtered.filter((tx) => tx.bundleId === filterBundle);
    }
    if (filterStatus !== "all") {
      filtered = filtered.filter((tx) => tx.status === filterStatus);
    }
    if (filterDateRange !== "all") {
      const now = new Date();
      let startDate: Date;
      switch (filterDateRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "month":
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        default:
          startDate = new Date(0);
      }
      filtered = filtered.filter((tx) => new Date(tx.date) >= startDate);
    }

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "date":
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case "amount":
          aVal = a.amount;
          bVal = b.amount;
          break;
        case "user":
          aVal = a.userName || a.userEmail;
          bVal = b.userName || b.userEmail;
          break;
        case "type":
          aVal = a.type || "";
          bVal = b.type || "";
          break;
        default:
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
      }
      return sortDirection === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    return filtered;
  };

  const clearFilters = () => {
    setFilterType("all");
    setFilterBundle("all");
    setFilterStatus("all");
    setFilterDateRange("all");
  };

  const hasActiveFilters = filterType !== "all" || filterBundle !== "all" || filterStatus !== "all" || filterDateRange !== "all";
  const filteredTransactions = getFilteredTransactions();

  const selectedDateRevenue = data.customDateRevenue ? parseFloat(data.customDateRevenue) : 0;
  const selectedDateTransactions = data.customDateTransactions || [];
  const selectedDatePaymentCount = data.customDatePaymentCount || 0;

  const maxRevenue = Math.max(...(data.revenueOverTime || []).map((d) => d.revenue), 1);

  // Bundle breakdown
  const bb = data.bundleBreakdown || { "palm-reading": { count: 0, revenue: 0 }, "palm-birth": { count: 0, revenue: 0 }, "palm-birth-compat": { count: 0, revenue: 0 } };
  const totalBundleRevenue = bb["palm-reading"].revenue + bb["palm-birth"].revenue + bb["palm-birth-compat"].revenue;
  const totalBundleCount = bb["palm-reading"].count + bb["palm-birth"].count + bb["palm-birth-compat"].count;

  // Revenue by type
  const rbt = data.revenueByType || { bundle: 0, upsell: 0, coins: 0, report: 0 };
  const totalTypeRevenue = rbt.bundle + rbt.upsell + rbt.coins + rbt.report;

  return (
    <div className="min-h-screen bg-[#0A0E1A] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#1A1F2E] to-transparent px-4 pt-12 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/admin")}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/70 text-sm"
              >
                ← Admin
              </button>
              <button
                onClick={fetchData}
                disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <p className="text-white/50 text-sm">Razorpay one-time purchase analytics</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              showFilters || hasActiveFilters ? "bg-primary/20 text-primary" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-primary" />}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
            >
              <X className="w-4 h-4" />
              Clear Filters
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#1A2235] rounded-xl p-4 border border-white/10"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-white/50 text-xs mb-2 block">Date Range</label>
                <select
                  value={filterDateRange}
                  onChange={(e) => setFilterDateRange(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs mb-2 block">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Types</option>
                  <option value="bundle">Bundle</option>
                  <option value="upsell">Upsell</option>
                  <option value="coins">Coins</option>
                  <option value="report">Report</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs mb-2 block">Bundle</label>
                <select
                  value={filterBundle}
                  onChange={(e) => setFilterBundle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Bundles</option>
                  <option value="palm-reading">Palm Reading</option>
                  <option value="palm-birth">Palm + Birth Chart</option>
                  <option value="palm-birth-compat">Palm + Birth + Compat</option>
                </select>
              </div>
              <div>
                <label className="text-white/50 text-xs mb-2 block">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="created">Pending</option>
                </select>
              </div>
            </div>

            {/* Sort Options */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <label className="text-white/50 text-xs mb-2 block">Sort Transactions By</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { field: "date", label: "Date" },
                  { field: "amount", label: "Amount" },
                  { field: "user", label: "User" },
                  { field: "type", label: "Type" },
                ].map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => {
                      if (sortField === field) {
                        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                      } else {
                        setSortField(field);
                        setSortDirection("desc");
                      }
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      sortField === field ? "bg-primary/20 text-primary" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {label}
                    {sortField === field && (
                      <ArrowUpDown className={`w-3 h-3 ${sortDirection === "asc" ? "rotate-180" : ""}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Primary KPIs */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Primary KPIs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="Total Revenue"
              value={formatCurrency(data.totalRevenue)}
              subtitle="All time"
              icon={<DollarSign className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Total revenue from all paid Razorpay payments."
            />
            <KPICard
              title="ARPU"
              value={formatCurrency(data.arpu)}
              subtitle="Avg Revenue Per User"
              icon={<Users className="w-4 h-4" />}
              color="text-purple-400"
              tooltip="Average Revenue Per User: Total revenue divided by unique paying users."
            />
            <KPICard
              title="MoM Growth"
              value={data.momGrowth === "N/A" ? "N/A" : `${data.momGrowth}%`}
              subtitle="vs last month"
              icon={parseFloat(data.momGrowth) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              color={data.momGrowth === "N/A" ? "text-white/50" : parseFloat(data.momGrowth) >= 0 ? "text-green-400" : "text-red-400"}
              tooltip="Month-over-Month Growth: Percentage change in revenue compared to the previous month."
            />
            <KPICard
              title="Paying Users"
              value={data.uniquePayingUsers.toString()}
              subtitle={`of ${data.totalUsers} total`}
              icon={<Users className="w-4 h-4" />}
              color="text-blue-400"
              tooltip="Number of unique users who have made at least one payment."
            />
          </div>
        </section>

        {/* Revenue by Period */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white/70 text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Revenue by Period
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
              />
              {selectedDate !== new Date().toISOString().split("T")[0] && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  className="px-3 py-1.5 rounded-lg text-xs text-white/60 bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 relative">
              {dateLoading && (
                <div className="absolute inset-0 bg-[#1A2235]/80 rounded-xl flex items-center justify-center z-10">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-white/50 text-xs">
                    {selectedDate === new Date().toISOString().split("T")[0] ? "Today" : formatSelectedDate(selectedDate)}
                  </span>
                  <Tooltip content="Revenue for the selected date." />
                </div>
                <span className="text-green-400"><DollarSign className="w-4 h-4" /></span>
              </div>
              <p className="text-xl font-bold text-green-400">{formatCurrency(selectedDateRevenue)}</p>
              <p className="text-white/40 text-xs mt-1">{selectedDatePaymentCount} payments</p>
            </div>
            <MetricCard title="This Week" value={formatCurrency(data.revenueThisWeek)} tooltip="Revenue generated this week (Sunday to today)." />
            <MetricCard title="This Month" value={formatCurrency(data.revenueThisMonth)} tooltip="Revenue generated this month (1st to today)." />
            <MetricCard title="This Year" value={formatCurrency(data.revenueThisYear)} tooltip="Revenue generated this year (Jan 1st to today)." />
          </div>

          {/* Transactions for selected date */}
          {dateLoading && (
            <div className="mt-4 bg-[#1A2235] rounded-xl p-6 border border-white/10 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <p className="text-white/40 text-sm">Loading transactions...</p>
            </div>
          )}
          {!dateLoading && selectedDateTransactions.length > 0 && (
            <div className="mt-4 bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-white/60 text-xs">
                  {selectedDatePaymentCount} transaction{selectedDatePaymentCount !== 1 ? "s" : ""} on {formatSelectedDate(selectedDate)}
                </p>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#1A2235]">
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white/50 text-xs font-medium px-4 py-2">Time</th>
                      <th className="text-left text-white/50 text-xs font-medium px-4 py-2">User</th>
                      <th className="text-left text-white/50 text-xs font-medium px-4 py-2">Type</th>
                      <th className="text-left text-white/50 text-xs font-medium px-4 py-2">Bundle</th>
                      <th className="text-right text-white/50 text-xs font-medium px-4 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="text-white/70 text-sm px-4 py-2">{formatDate(tx.date)}</td>
                        <td className="px-4 py-2">
                          <p className="text-white/80 text-sm">{tx.userName !== "Unknown" ? tx.userName : tx.userEmail?.split("@")[0] || "Unknown"}</p>
                          <p className="text-white/40 text-xs">{tx.userEmail}</p>
                        </td>
                        <td className="text-white/70 text-sm px-4 py-2 capitalize">{tx.type || "bundle"}</td>
                        <td className="text-white/70 text-sm px-4 py-2 capitalize">{(tx.bundleId || "-").replace(/-/g, " ")}</td>
                        <td className="text-white text-sm px-4 py-2 text-right font-medium">{formatCurrency(tx.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!dateLoading && selectedDateTransactions.length === 0 && selectedDate && (
            <div className="mt-4 bg-[#1A2235] rounded-xl p-4 border border-white/10 text-center">
              <p className="text-white/40 text-sm">No transactions on {formatSelectedDate(selectedDate)}</p>
            </div>
          )}
        </section>

        {/* Bundle Breakdown */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" /> Bundle Breakdown
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Revenue by Bundle */}
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Revenue by Bundle</h3>
              <div className="space-y-3">
                <PlanBar label="Palm Reading" value={bb["palm-reading"].revenue} total={totalBundleRevenue} color="bg-amber-500" count={bb["palm-reading"].count} />
                <PlanBar label="Palm + Birth Chart" value={bb["palm-birth"].revenue} total={totalBundleRevenue} color="bg-purple-500" count={bb["palm-birth"].count} />
                <PlanBar label="Palm + Birth + Compat" value={bb["palm-birth-compat"].revenue} total={totalBundleRevenue} color="bg-green-500" count={bb["palm-birth-compat"].count} />
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 flex justify-between">
                <span className="text-white/50 text-xs">Total</span>
                <span className="text-white text-xs font-semibold">{totalBundleCount} sales • {formatCurrency(totalBundleRevenue)}</span>
              </div>
            </div>

            {/* Revenue by Type */}
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Revenue by Type</h3>
              <div className="space-y-3">
                <PlanBar label="Bundles" value={rbt.bundle} total={totalTypeRevenue} color="bg-indigo-500" />
                <PlanBar label="Upsells" value={rbt.upsell} total={totalTypeRevenue} color="bg-cyan-500" />
                <PlanBar label="Coins" value={rbt.coins} total={totalTypeRevenue} color="bg-amber-500" />
                <PlanBar label="Reports" value={rbt.report} total={totalTypeRevenue} color="bg-pink-500" />
              </div>
            </div>
          </div>

          {/* Bundle Distribution Donut */}
          <div className="mt-4 bg-[#1A2235] rounded-xl p-4 border border-white/10">
            <h3 className="text-white/60 text-xs mb-3">Bundle Distribution</h3>
            <div className="flex items-center justify-center gap-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {(() => {
                    if (totalBundleCount === 0) return <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3" />;
                    const segments = [
                      { value: bb["palm-reading"].count, color: "#F59E0B" },
                      { value: bb["palm-birth"].count, color: "#8B5CF6" },
                      { value: bb["palm-birth-compat"].count, color: "#22C55E" },
                    ].filter((s) => s.value > 0);
                    let offset = 0;
                    return segments.map((seg, i) => {
                      const pct = (seg.value / totalBundleCount) * 100;
                      const circle = (
                        <circle
                          key={i}
                          cx="18" cy="18" r="15.9"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="3"
                          strokeDasharray={`${pct} ${100 - pct}`}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += pct;
                      return circle;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-lg font-semibold">{totalBundleCount}</span>
                </div>
              </div>
              <div className="space-y-2">
                {bb["palm-reading"].count > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-white/70 text-sm">Palm Reading: {bb["palm-reading"].count}</span>
                  </div>
                )}
                {bb["palm-birth"].count > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-white/70 text-sm">Palm + Birth: {bb["palm-birth"].count}</span>
                  </div>
                )}
                {bb["palm-birth-compat"].count > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-white/70 text-sm">Palm + Birth + Compat: {bb["palm-birth-compat"].count}</span>
                  </div>
                )}
                {totalBundleCount === 0 && (
                  <span className="text-white/40 text-sm">No sales yet</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Transaction Activity */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Transaction Activity
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="Successful"
              value={(data.successfulPayments || 0).toString()}
              icon={<CheckCircle className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Total number of successful (paid) payment transactions."
            />
            <KPICard
              title="Failed"
              value={(data.failedPayments || 0).toString()}
              icon={<XCircle className="w-4 h-4" />}
              color="text-red-400"
              tooltip="Number of failed payment attempts."
            />
            <KPICard
              title="Pending"
              value={(data.pendingPayments || 0).toString()}
              icon={<Clock className="w-4 h-4" />}
              color="text-amber-400"
              tooltip="Payments that were created but not yet completed."
            />
            <KPICard
              title="Total"
              value={(data.totalPayments || 0).toString()}
              icon={<CreditCard className="w-4 h-4" />}
              color="text-white"
              tooltip="Total number of payment records across all statuses."
            />
          </div>
        </section>

        {/* Revenue Over Time Chart */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Revenue Over Time (Last 30 Days)
          </h2>
          <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
            <div className="flex items-end gap-1 h-40">
              {(data.revenueOverTime || []).map((day) => (
                <div
                  key={day.date}
                  className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t relative group"
                  style={{ height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%` }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {day.date}: {formatCurrency(day.revenue)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/40">
              <span>{data.revenueOverTime?.[0]?.date}</span>
              <span>{data.revenueOverTime?.[data.revenueOverTime.length - 1]?.date}</span>
            </div>
          </div>
        </section>

        {/* Users Summary */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Users
          </h2>
          <div className="bg-[#1A2235] rounded-xl border border-white/10 p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-white/40 text-xs">Total Users</p>
                <p className="text-white text-lg font-semibold">{data.totalUsers}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Paying Users</p>
                <p className="text-green-400 text-lg font-semibold">{data.uniquePayingUsers}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Conversion Rate</p>
                <p className="text-blue-400 text-lg font-semibold">
                  {data.totalUsers > 0 ? ((data.uniquePayingUsers / data.totalUsers) * 100).toFixed(1) : "0"}%
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Transactions */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Recent Transactions
            {hasActiveFilters && (
              <span className="text-xs text-primary ml-2">
                ({filteredTransactions.length} of {(data.recentTransactions || []).length} shown)
              </span>
            )}
          </h2>
          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Date</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">User</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Type</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Bundle</th>
                    <th className="text-right text-white/50 text-xs font-medium px-4 py-3">Amount</th>
                    <th className="text-center text-white/50 text-xs font-medium px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-white/40 py-8">
                        {hasActiveFilters ? "No transactions match your filters" : "No transactions yet"}
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="text-white/70 text-sm px-4 py-3">{formatDate(tx.date)}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-white/80 text-sm">{tx.userName !== "Unknown" ? tx.userName : tx.userEmail?.split("@")[0] || "Unknown"}</p>
                            <p className="text-white/40 text-xs">{tx.userEmail}</p>
                          </div>
                        </td>
                        <td className="text-white/70 text-sm px-4 py-3 capitalize">{tx.type || "bundle"}</td>
                        <td className="text-white/70 text-sm px-4 py-3 capitalize">{(tx.bundleId || "-").replace(/-/g, " ")}</td>
                        <td className="text-white text-sm px-4 py-3 text-right font-medium">{formatCurrency(tx.amount || 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                              tx.status === "paid"
                                ? "bg-green-500/20 text-green-400"
                                : tx.status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {tx.status === "paid" && <CheckCircle className="w-3 h-3" />}
                            {tx.status === "failed" && <XCircle className="w-3 h-3" />}
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Summary Stats */}
        <section className="pb-8">
          <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-white/40 text-xs">Total Payments</p>
                <p className="text-white text-lg font-semibold">{data.totalPayments}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Total Users</p>
                <p className="text-white text-lg font-semibold">{data.totalUsers}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Paying Users</p>
                <p className="text-white text-lg font-semibold">{data.uniquePayingUsers}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Tooltip({ content }: { content: string }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <HelpCircle
        className="w-3.5 h-3.5 text-white/30 hover:text-white/60 cursor-help transition-colors"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      />
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-[#0A0E1A] border border-white/20 rounded-lg shadow-xl">
          <p className="text-white/80 text-xs leading-relaxed">{content}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#0A0E1A] border-r border-b border-white/20 rotate-45" />
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, color, tooltip }: { title: string; value: string; subtitle?: string; icon?: React.ReactNode; color?: string; tooltip?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#1A2235] rounded-xl p-4 border border-white/10"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-white/50 text-xs">{title}</span>
          {tooltip && <Tooltip content={tooltip} />}
        </div>
        {icon && <span className={color || "text-white/50"}>{icon}</span>}
      </div>
      <p className={`text-xl font-bold ${color || "text-white"}`}>{value}</p>
      {subtitle && <p className="text-white/40 text-xs mt-1">{subtitle}</p>}
    </motion.div>
  );
}

function MetricCard({ title, value, subtitle, color, tooltip }: { title: string; value: string; subtitle?: string; color?: string; tooltip?: string }) {
  return (
    <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-white/50 text-xs">{title}</p>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <p className={`text-lg font-semibold ${color || "text-white"}`}>{value}</p>
      {subtitle && <p className="text-white/40 text-xs">{subtitle}</p>}
    </div>
  );
}

function PlanBar({ label, value, total, color, count }: { label: string; value: number; total: number; color: string; count?: number }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/70">{label}</span>
        <span className="text-white/50">
          {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value)}
          {count !== undefined ? ` (${count} sales)` : ` (${percentage.toFixed(0)}%)`}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
