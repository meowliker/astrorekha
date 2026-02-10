"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
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
  UserMinus,
  UserPlus,
  Repeat,
  XCircle,
  CheckCircle,
  Clock,
  Filter,
  ArrowUpDown,
  GripVertical,
  ChevronDown,
  Package,
  X,
  HelpCircle,
} from "lucide-react";

interface SubscriberInfo {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: string;
  startedAt: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  cancelledAt?: string | null;
}

interface RevenueData {
  mrr: string;
  arr: string;
  projectedMrr?: string;
  projectedArr?: string;
  activePayingSubscribers?: number;
  trialingSubscribers?: number;
  totalRevenue: string;
  revenueToday: string;
  revenueThisWeek: string;
  revenueThisMonth: string;
  revenueThisYear: string;
  revenueLastMonth: string;
  momGrowth: string;
  revenueByPlan: { weekly: number; monthly: number; yearly: number; "1week"?: number; "2week"?: number; "4week"?: number };
  revenueByType: { subscription: number; coins: number; reports: number; upsells: number };
  arpu: string;
  ltv: string;
  totalActiveSubscribers: number;
  newSubscribersThisMonth: number;
  churnedSubscribers: number;
  netSubscriberChange: number;
  churnRate: string;
  monthlyChurnRate?: string;
  retentionRate: string;
  successfulPayments: number;
  failedPayments: number;
  refunds: number;
  trialsStarted: number;
  trialsConverted: number;
  trialConversionRate: string;
  revenueOverTime: { date: string; revenue: number }[];
  subscriptionDistribution: { weekly: number; monthly: number; yearly: number; "1week"?: number; "2week"?: number; "4week"?: number };
  upsellBreakdown: { name: string; count: number; revenue: number }[];
  totalUpsellRevenue: number;
  totalUpsellCount: number;
  recentTransactions: {
    id: string;
    date: string;
    userId: string;
    amount: number;
    plan: string;
    type: string;
    status: string;
    userEmail: string;
    userName: string;
  }[];
  activeSubscribersList?: SubscriberInfo[];
  trialingSubscribersList?: SubscriberInfo[];
  cancelledSubscribersList?: SubscriberInfo[];
  totalPayments: number;
  totalUsers: number;
  uniquePayingUsers: number;
  unregisteredSubscribers?: number;
  stripeSubscriptionsCount?: number;
  customDateRevenue?: string;
  customDatePaymentCount?: number;
  customDateTransactions?: {
    id: string;
    date: string;
    userId: string;
    amount: number;
    plan: string;
    type: string;
    status: string;
    userEmail: string;
    userName: string;
  }[];
  customDateRange?: { start: string; end: string };
}

// Default card order
const DEFAULT_CARD_ORDER = [
  "primary-kpis",
  "revenue-period",
  "subscription-breakdown",
  "upsell-analytics",
  "subscriber-counts",
  "churn-retention",
  "transaction-activity",
  "revenue-chart",
  "subscription-distribution",
  "recent-transactions",
];

export default function AdminRevenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("all");
  
  // Date picker for revenue lookup (defaults to today)
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [dateLoading, setDateLoading] = useState(false);
  
  // Sorting
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Subscriber tab
  const [subscriberTab, setSubscriberTab] = useState<"active" | "trialing" | "cancelled">("active");
  
  // Flow tab (All, Flow A, Flow B)
  const [flowTab, setFlowTab] = useState<"all" | "flow-a" | "flow-b">("all");

  // Format date with time
  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Card order (persisted in localStorage)
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_CARD_ORDER);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  
  // Load card order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem("admin_card_order");
    if (savedOrder) {
      try {
        setCardOrder(JSON.parse(savedOrder));
      } catch (e) {
        setCardOrder(DEFAULT_CARD_ORDER);
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setDateLoading(true);
      
      // Check for admin session token
      const token = localStorage.getItem("admin_session_token");
      const expiry = localStorage.getItem("admin_session_expiry");
      
      if (!token || !expiry || new Date(expiry) < new Date()) {
        // No valid session, redirect to login
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }
      
      let url = `/api/admin/revenue?token=${token}&flow=${flowTab}`;
      if (selectedDate) {
        url += `&startDate=${selectedDate}&endDate=${selectedDate}`;
      }
      const response = await fetch(url);
      
      if (response.status === 401) {
        // Session invalid or expired, redirect to login
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
  }, [router, flowTab, selectedDate]); // Re-fetch when flow tab or selected date changes

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
          <h1 className="text-white text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={() => router.push("/reports")}
            className="px-6 py-2 bg-primary text-white rounded-lg"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
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

  // Filter transactions
  const getFilteredTransactions = () => {
    let filtered = [...data.recentTransactions];
    
    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(tx => (tx.type || "subscription") === filterType);
    }
    
    // Filter by plan
    if (filterPlan !== "all") {
      filtered = filtered.filter(tx => tx.plan === filterPlan);
    }
    
    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter(tx => tx.status === filterStatus);
    }
    
    // Filter by date range
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
        case "year":
          startDate = new Date(now);
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      filtered = filtered.filter(tx => new Date(tx.date) >= startDate);
    }
    
    // Sort
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
      
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  };

  // Card drag handlers
  const handleDragStart = (cardId: string) => {
    setDraggedCard(cardId);
  };

  const handleDragOver = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    if (!draggedCard || draggedCard === cardId) return;
    
    const newOrder = [...cardOrder];
    const draggedIndex = newOrder.indexOf(draggedCard);
    const targetIndex = newOrder.indexOf(cardId);
    
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedCard);
    
    setCardOrder(newOrder);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    localStorage.setItem("admin_card_order", JSON.stringify(cardOrder));
  };

  const resetCardOrder = () => {
    setCardOrder(DEFAULT_CARD_ORDER);
    localStorage.removeItem("admin_card_order");
  };

  const clearFilters = () => {
    setFilterType("all");
    setFilterPlan("all");
    setFilterStatus("all");
    setFilterDateRange("all");
  };

  const hasActiveFilters = filterType !== "all" || filterPlan !== "all" || filterStatus !== "all" || filterDateRange !== "all";
  const filteredTransactions = getFilteredTransactions();

  // Server-side filtered revenue for selected date
  const selectedDateRevenue = data.customDateRevenue ? parseFloat(data.customDateRevenue) : 0;
  const selectedDateTransactions = data.customDateTransactions || [];
  const selectedDatePaymentCount = data.customDatePaymentCount || 0;
  
  // Format date as "06 February 2026"
  const formatSelectedDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  };

  const maxRevenue = Math.max(...data.revenueOverTime.map(d => d.revenue), 1);

  return (
    <div className="min-h-screen bg-[#0A0E1A] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#1A1F2E] to-transparent px-4 pt-12 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="text-white/50 text-sm">Real-time revenue analytics and metrics</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Flow Tabs (All, Flow A, Flow B) */}
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setFlowTab("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              flowTab === "all"
                ? "bg-primary text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            All Revenue
          </button>
          <button
            onClick={() => setFlowTab("flow-a")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              flowTab === "flow-a"
                ? "bg-blue-500 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <Repeat className="w-4 h-4" />
            Flow A (Subscriptions)
          </button>
          <button
            onClick={() => setFlowTab("flow-b")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              flowTab === "flow-b"
                ? "bg-green-500 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <Package className="w-4 h-4" />
            Flow B (Bundles)
          </button>
        </div>

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
          
          <button
            onClick={resetCardOrder}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 text-sm transition-colors"
          >
            <GripVertical className="w-4 h-4" />
            Reset Layout
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
              {/* Date Range Filter */}
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
                  <option value="year">Last Year</option>
                </select>
              </div>
              
              {/* Type Filter */}
              <div>
                <label className="text-white/50 text-xs mb-2 block">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Types</option>
                  <option value="subscription">Subscription</option>
                  <option value="upsell">Upsell</option>
                  <option value="coins">Coins</option>
                  <option value="report">Report</option>
                </select>
              </div>
              
              {/* Plan Filter */}
              <div>
                <label className="text-white/50 text-xs mb-2 block">Plan</label>
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Plans</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              
              {/* Status Filter */}
              <div>
                <label className="text-white/50 text-xs mb-2 block">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="all">All Status</option>
                  <option value="succeeded">Succeeded</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
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
                      sortField === field
                        ? "bg-primary/20 text-primary"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
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
        <section
          draggable
          onDragStart={() => handleDragStart("primary-kpis")}
          onDragOver={(e) => handleDragOver(e, "primary-kpis")}
          onDragEnd={handleDragEnd}
          className={`${draggedCard === "primary-kpis" ? "opacity-50" : ""}`}
        >
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <GripVertical className="w-4 h-4 cursor-grab text-white/30" />
            <DollarSign className="w-4 h-4" /> Primary KPIs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="MRR"
              value={formatCurrency(data.mrr)}
              subtitle={data.projectedMrr && parseFloat(data.projectedMrr) > parseFloat(data.mrr) 
                ? `Projected: ${formatCurrency(data.projectedMrr)}` 
                : "Monthly Recurring"}
              icon={<TrendingUp className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Monthly Recurring Revenue: Predictable revenue from active paying subscriptions, normalized to a monthly amount. Excludes trialing users."
            />
            <KPICard
              title="ARR"
              value={formatCurrency(data.arr)}
              subtitle={data.projectedArr && parseFloat(data.projectedArr) > parseFloat(data.arr)
                ? `Projected: ${formatCurrency(data.projectedArr)}`
                : "Annual Recurring"}
              icon={<TrendingUp className="w-4 h-4" />}
              color="text-blue-400"
              tooltip="Annual Recurring Revenue: MRR multiplied by 12. Represents the yearly value of your subscription revenue."
            />
            <KPICard
              title="Total Revenue"
              value={formatCurrency(data.totalRevenue)}
              subtitle="All time"
              icon={<DollarSign className="w-4 h-4" />}
              color="text-purple-400"
              tooltip="Total Revenue: All-time revenue from subscriptions, upsells, coins, and other payments. Includes one-time and recurring charges."
            />
            <KPICard
              title="MoM Growth"
              value={data.momGrowth === "N/A" ? "N/A" : `${data.momGrowth}%`}
              subtitle="vs last month"
              icon={parseFloat(data.momGrowth) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              color={parseFloat(data.momGrowth) >= 0 ? "text-green-400" : "text-red-400"}
              tooltip="Month-over-Month Growth: Percentage change in revenue compared to the previous month. Positive values indicate growth."
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
                  <span className="text-white/50 text-xs">{selectedDate === new Date().toISOString().split("T")[0] ? "Today" : formatSelectedDate(selectedDate)}</span>
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
                      <th className="text-left text-white/50 text-xs font-medium px-4 py-2">Plan</th>
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
                        <td className="text-white/70 text-sm px-4 py-2 capitalize">{tx.type || "subscription"}</td>
                        <td className="text-white/70 text-sm px-4 py-2 capitalize">{tx.plan || "-"}</td>
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

        {/* Subscription Breakdown */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4" /> Subscription Breakdown
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Revenue by Plan */}
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Revenue by Plan</h3>
              <div className="space-y-3">
                <PlanBar label="Weekly" value={data.revenueByPlan.weekly} total={data.revenueByPlan.weekly + data.revenueByPlan.monthly + data.revenueByPlan.yearly} color="bg-blue-500" />
                <PlanBar label="Monthly" value={data.revenueByPlan.monthly} total={data.revenueByPlan.weekly + data.revenueByPlan.monthly + data.revenueByPlan.yearly} color="bg-purple-500" />
                <PlanBar label="Yearly" value={data.revenueByPlan.yearly} total={data.revenueByPlan.weekly + data.revenueByPlan.monthly + data.revenueByPlan.yearly} color="bg-green-500" />
              </div>
            </div>

            {/* Revenue by Type */}
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Revenue by Type</h3>
              <div className="space-y-3">
                <PlanBar label="Subscriptions" value={data.revenueByType.subscription} total={data.revenueByType.subscription + data.revenueByType.coins + data.revenueByType.reports + data.revenueByType.upsells} color="bg-indigo-500" />
                <PlanBar label="Coins" value={data.revenueByType.coins} total={data.revenueByType.subscription + data.revenueByType.coins + data.revenueByType.reports + data.revenueByType.upsells} color="bg-amber-500" />
                <PlanBar label="Reports" value={data.revenueByType.reports} total={data.revenueByType.subscription + data.revenueByType.coins + data.revenueByType.reports + data.revenueByType.upsells} color="bg-pink-500" />
                <PlanBar label="Upsells" value={data.revenueByType.upsells} total={data.revenueByType.subscription + data.revenueByType.coins + data.revenueByType.reports + data.revenueByType.upsells} color="bg-cyan-500" />
              </div>
            </div>
          </div>

          {/* ARPU & LTV */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <MetricCard 
              title="ARPU" 
              value={formatCurrency(data.arpu)} 
              subtitle="Avg Revenue Per User" 
              tooltip="Average Revenue Per User: Total revenue divided by total number of paying users. Indicates how much each user generates on average."
            />
            <MetricCard 
              title="LTV" 
              value={formatCurrency(data.ltv)} 
              subtitle="Lifetime Value" 
              tooltip="Lifetime Value: Estimated total revenue a customer will generate over their lifetime. Calculated as ARPU divided by churn rate."
            />
          </div>
        </section>

        {/* Upsell Analytics */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" /> Upsell Analytics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Upsell Summary */}
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Upsell Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-sm">Total Upsells</span>
                  <span className="text-white font-semibold">{data.totalUpsellCount || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-sm">Total Revenue</span>
                  <span className="text-green-400 font-semibold">{formatCurrency(data.totalUpsellRevenue || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/50 text-sm">Avg per Upsell</span>
                  <span className="text-white font-semibold">
                    {data.totalUpsellCount > 0 
                      ? formatCurrency((data.totalUpsellRevenue || 0) / data.totalUpsellCount) 
                      : "$0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* Upsell Breakdown */}
            <div className="md:col-span-2 bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Revenue by Upsell Type (Highest First)</h3>
              {data.upsellBreakdown && data.upsellBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {data.upsellBreakdown.map((upsell, index) => {
                    const maxRevenue = data.upsellBreakdown[0]?.revenue || 1;
                    const percentage = (upsell.revenue / maxRevenue) * 100;
                    return (
                      <div key={upsell.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/70 capitalize">{upsell.name.replace(/-/g, " ")}</span>
                          <span className="text-white/50">
                            {upsell.count} sales • {formatCurrency(upsell.revenue)}
                          </span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              index === 0 ? "bg-green-500" : 
                              index === 1 ? "bg-blue-500" : 
                              index === 2 ? "bg-purple-500" : "bg-amber-500"
                            }`} 
                            style={{ width: `${percentage}%` }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-white/40 text-sm text-center py-4">No upsell data available</p>
              )}
            </div>
          </div>
        </section>

        {/* Subscriber Counts */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Subscriber Counts
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="Active Subscribers"
              value={data.totalActiveSubscribers.toString()}
              icon={<Users className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Total number of active paying subscribers and trialing users verified in Stripe."
            />
            <KPICard
              title="New This Month"
              value={data.newSubscribersThisMonth.toString()}
              icon={<UserPlus className="w-4 h-4" />}
              color="text-blue-400"
              tooltip="Number of new subscribers who started their subscription this month."
            />
            <KPICard
              title="Churned"
              value={data.churnedSubscribers.toString()}
              icon={<UserMinus className="w-4 h-4" />}
              color="text-red-400"
              tooltip="Total number of subscribers who have cancelled their subscription."
            />
            <KPICard
              title="Net Change"
              value={data.netSubscriberChange >= 0 ? `+${data.netSubscriberChange}` : data.netSubscriberChange.toString()}
              icon={data.netSubscriberChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              color={data.netSubscriberChange >= 0 ? "text-green-400" : "text-red-400"}
              tooltip="Net subscriber change this month (New subscribers minus churned subscribers)."
            />
          </div>
        </section>

        {/* Churn & Retention */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Repeat className="w-4 h-4" /> Churn & Retention
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard title="Lifetime Churn" value={`${data.churnRate}%`} color="text-red-400" tooltip="Percentage of all subscribers who have ever cancelled (lifetime churn rate)." />
            <MetricCard title="Monthly Churn" value={`${data.monthlyChurnRate || "0"}%`} color="text-orange-400" tooltip="Percentage of subscribers who cancelled this month relative to the start of the month." />
            <MetricCard title="Retention Rate" value={`${data.retentionRate}%`} color="text-green-400" tooltip="Percentage of subscribers who remain active (100% - Lifetime Churn Rate)." />
            <MetricCard title="Trials Started" value={data.trialsStarted.toString()} tooltip="Total number of users who have started a trial subscription." />
            <MetricCard title="Trial Conversion" value={`${data.trialConversionRate}%`} color="text-blue-400" tooltip="Percentage of trial users who converted to paying subscribers after their trial ended." />
          </div>
        </section>

        {/* Subscriber Management */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Subscriber Management
          </h2>
          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setSubscriberTab("active")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  subscriberTab === "active"
                    ? "bg-green-500/20 text-green-400 border-b-2 border-green-400"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                Active ({data.activePayingSubscribers || 0})
              </button>
              <button
                onClick={() => setSubscriberTab("trialing")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  subscriberTab === "trialing"
                    ? "bg-blue-500/20 text-blue-400 border-b-2 border-blue-400"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                On Trial ({data.trialingSubscribers || 0})
              </button>
              <button
                onClick={() => setSubscriberTab("cancelled")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  subscriberTab === "cancelled"
                    ? "bg-red-500/20 text-red-400 border-b-2 border-red-400"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                Cancelled ({data.churnedSubscribers || 0})
              </button>
            </div>
            
            {/* Subscriber Table */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-[#1A2235]">
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Email</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Plan</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Started</th>
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">
                      {subscriberTab === "trialing" ? "Trial Ends" : subscriberTab === "cancelled" ? "Cancelled" : "Next Billing"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const list = subscriberTab === "active" 
                      ? data.activeSubscribersList 
                      : subscriberTab === "trialing" 
                        ? data.trialingSubscribersList 
                        : data.cancelledSubscribersList;
                    
                    if (!list || list.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="text-center text-white/40 py-8">
                            No {subscriberTab} subscribers
                          </td>
                        </tr>
                      );
                    }
                    
                    return list.map((sub) => (
                      <tr key={sub.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-white/80 text-sm">{sub.email}</p>
                            {sub.name && <p className="text-white/40 text-xs">{sub.name}</p>}
                          </div>
                        </td>
                        <td className="text-white/70 text-sm px-4 py-3 capitalize">{sub.plan || "-"}</td>
                        <td className="text-white/70 text-sm px-4 py-3">
                          {formatDateTime(sub.startedAt)}
                        </td>
                        <td className="text-white/70 text-sm px-4 py-3">
                          {subscriberTab === "trialing" && sub.trialEndsAt
                            ? formatDateTime(sub.trialEndsAt)
                            : subscriberTab === "cancelled" && sub.cancelledAt
                              ? formatDateTime(sub.cancelledAt)
                              : sub.currentPeriodEnd
                                ? formatDateTime(sub.currentPeriodEnd)
                                : "-"}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Transaction Activity */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Transaction Activity
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KPICard
              title="Successful"
              value={data.successfulPayments.toString()}
              icon={<CheckCircle className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Total number of successful payment transactions across all payment types."
            />
            <KPICard
              title="Failed"
              value={data.failedPayments.toString()}
              icon={<XCircle className="w-4 h-4" />}
              color="text-red-400"
              tooltip="Number of failed payment attempts. High failure rates may indicate payment method issues."
            />
            <KPICard
              title="Refunds"
              value={data.refunds.toString()}
              icon={<RefreshCw className="w-4 h-4" />}
              color="text-amber-400"
              tooltip="Total number of refunded transactions."
            />
            <KPICard
              title="Conversions"
              value={data.trialsConverted.toString()}
              icon={<ArrowUpRight className="w-4 h-4" />}
              color="text-blue-400"
              tooltip="Number of trial users who successfully converted to paying subscribers."
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
              {data.revenueOverTime.map((day, i) => (
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
              <span>{data.revenueOverTime[0]?.date}</span>
              <span>{data.revenueOverTime[data.revenueOverTime.length - 1]?.date}</span>
            </div>
          </div>
        </section>

        {/* Subscription Distribution */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4" /> Active Subscription Distribution
          </h2>
          <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-center gap-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {(() => {
                    const dist = data.subscriptionDistribution;
                    const total = (dist.weekly || 0) + (dist.monthly || 0) + (dist.yearly || 0) + 
                                  (dist["1week"] || 0) + (dist["2week"] || 0) + (dist["4week"] || 0);
                    if (total === 0) return <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3" />;
                    
                    const segments = [
                      { value: dist["1week"] || 0, color: "#F59E0B" },
                      { value: dist["2week"] || 0, color: "#10B981" },
                      { value: dist["4week"] || 0, color: "#6366F1" },
                      { value: dist.weekly || 0, color: "#3B82F6" },
                      { value: dist.monthly || 0, color: "#8B5CF6" },
                      { value: dist.yearly || 0, color: "#22C55E" },
                    ].filter(s => s.value > 0);
                    
                    let offset = 0;
                    return segments.map((seg, i) => {
                      const pct = (seg.value / total) * 100;
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
                  <span className="text-white text-lg font-semibold">
                    {(data.subscriptionDistribution.weekly || 0) + (data.subscriptionDistribution.monthly || 0) + 
                     (data.subscriptionDistribution.yearly || 0) + (data.subscriptionDistribution["1week"] || 0) + 
                     (data.subscriptionDistribution["2week"] || 0) + (data.subscriptionDistribution["4week"] || 0)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {(data.subscriptionDistribution["1week"] || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-white/70 text-sm">1-Week Trial: {data.subscriptionDistribution["1week"]}</span>
                  </div>
                )}
                {(data.subscriptionDistribution["2week"] || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-white/70 text-sm">2-Week Trial: {data.subscriptionDistribution["2week"]}</span>
                  </div>
                )}
                {(data.subscriptionDistribution["4week"] || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-500" />
                    <span className="text-white/70 text-sm">4-Week Trial: {data.subscriptionDistribution["4week"]}</span>
                  </div>
                )}
                {(data.subscriptionDistribution.weekly || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-white/70 text-sm">Weekly: {data.subscriptionDistribution.weekly}</span>
                  </div>
                )}
                {(data.subscriptionDistribution.monthly || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-white/70 text-sm">Monthly: {data.subscriptionDistribution.monthly}</span>
                  </div>
                )}
                {(data.subscriptionDistribution.yearly || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-white/70 text-sm">Yearly: {data.subscriptionDistribution.yearly}</span>
                  </div>
                )}
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
                ({filteredTransactions.length} of {data.recentTransactions.length} shown)
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
                    <th className="text-left text-white/50 text-xs font-medium px-4 py-3">Plan</th>
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
                        <td className="text-white/70 text-sm px-4 py-3 capitalize">{tx.type || "subscription"}</td>
                        <td className="text-white/70 text-sm px-4 py-3 capitalize">{tx.plan || "-"}</td>
                        <td className="text-white text-sm px-4 py-3 text-right font-medium">{formatCurrency(tx.amount || 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                            tx.status === "succeeded" || tx.status === "paid" ? "bg-green-500/20 text-green-400" :
                            tx.status === "failed" ? "bg-red-500/20 text-red-400" :
                            tx.status === "refunded" ? "bg-amber-500/20 text-amber-400" :
                            "bg-gray-500/20 text-gray-400"
                          }`}>
                            {(tx.status === "succeeded" || tx.status === "paid") && <CheckCircle className="w-3 h-3" />}
                            {tx.status === "failed" && <XCircle className="w-3 h-3" />}
                            {tx.status === "refunded" && <RefreshCw className="w-3 h-3" />}
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
            <div className="grid grid-cols-5 gap-4 text-center">
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
              <div>
                <p className="text-white/40 text-xs">Stripe Subs</p>
                <p className="text-green-400 text-lg font-semibold">{data.stripeSubscriptionsCount || 0}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Unregistered</p>
                <p className={`text-lg font-semibold ${(data.unregisteredSubscribers || 0) > 0 ? "text-amber-400" : "text-white"}`}>
                  {data.unregisteredSubscribers || 0}
                </p>
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

function PlanBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/70">{label}</span>
        <span className="text-white/50">${value.toFixed(2)} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
