"use client";

import { useState, useEffect, type ComponentType } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  BarChart3, 
  DollarSign,
  RefreshCw,
  Play,
  Pause,
  Settings,
  ChevronRight,
  Eye,
  UserCheck,
  XCircle,
  RotateCcw,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_LAYOUT_B_CONFIG,
  normalizeLayoutBConfig,
  type LayoutBFunnelConfig,
} from "@/lib/layout-b-funnel";
const DEFAULT_ONBOARDING_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;

interface ABTest {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  variants: {
    A: { weight: number; page: string };
    B: { weight: number; page: string };
  };
  createdAt: string;
  updatedAt: string;
  quickStats?: {
    totalImpressions: number;
    totalConversions: number;
    variantAConversionRate: string;
    variantBConversionRate: string;
  };
}

interface TestStats {
  impressions: number;
  conversions: number;
  bounces: number;
  checkoutsStarted: number;
  totalRevenue: number;
  conversionRate: string;
  bounceRate: string;
  checkoutRate: string;
  checkoutToConversionRate: string;
  avgRevenuePerUser: string;
  avgRevenuePerImpression: string;
}

interface RouteStatsRow {
  route: string;
  assignedUsers: number;
  uniqueAudience: number;
  impressions: number;
  checkoutsStarted: number;
  trackedBundleConversions: number;
  bounces: number;
  bounceRate: string;
  checkoutStartRate: string;
  trackedConversionRate: string;
  trackedCheckoutToConversionRate: string;
  trackedRevenueInr: number;
  paidOrders: number;
  paidRevenueInr: number;
  upsellOrders: number;
  upsellRevenueInr: number;
  upsellAttachRate: string;
}

interface FunnelFlowStepRow {
  step: number;
  route: string;
  audience: number;
  impressions: number;
  continuedToNext: number;
  dropOffs: number;
  bounceRate: string;
  checkoutsStarted: number;
  trackedBundleConversions: number;
  paidOrders: number;
  paidRevenueInr: number;
  upsellOrders: number;
  upsellRevenueInr: number;
}

interface PurchaseDetailRow {
  purchasedAt: string;
  userId: string;
  email: string;
  userName?: string;
  variant: "A" | "B";
  funnel: string;
  source?: "upsell_page" | "dashboard";
  item: string;
  amountInr: number;
  paymentId: string;
  transactionId: string;
  paymentStatus: string;
}

interface MixSummaryRow {
  item: string;
  orders: number;
  buyers: number;
  revenueInr: number;
}

interface UpsellKpiRow {
  item: string;
  audience: number;
  orders: number;
  conversionRate: string;
  revenueInr: number;
  avgOrderValue: string;
  revenuePerAudience: string;
}

interface FunnelDecisionSummary {
  assignedUsers: number;
  bundleBuyers: number;
  upsellBuyers: number;
  upsellAttachRate: string;
  bundleRevenueInr: number;
  upsellRevenueInr: number;
  totalRevenueInr: number;
  avgRevenuePerBundleBuyerInr: string;
}

interface TestDetails {
  test: ABTest;
  analyticsWindowStart?: string;
  appliedDateRange?: {
    start: string;
    end: string | null;
  };
  appliedCostaRicaDateRange?: {
    startDate: string | null;
    endDate: string | null;
    timezoneNote?: string;
  };
  stats: {
    A: TestStats;
    B: TestStats;
  };
  dailyBreakdown: Array<{
    date: string;
    A: { impressions: number; conversions: number; bounces: number; revenue: number };
    B: { impressions: number; conversions: number; bounces: number; revenue: number };
  }>;
  recentEvents: Array<any>;
  routeStats?: { A: RouteStatsRow[]; B: RouteStatsRow[] };
  orderedFunnelFlow?: { A: FunnelFlowStepRow[]; B: FunnelFlowStepRow[] };
  bundlePurchases?: PurchaseDetailRow[];
  upsellPurchases?: PurchaseDetailRow[];
  bundleBreakdown?: { A: MixSummaryRow[]; B: MixSummaryRow[] };
  upsellBreakdown?: { A: MixSummaryRow[]; B: MixSummaryRow[] };
  funnelSummary?: { A: FunnelDecisionSummary; B: FunnelDecisionSummary };
}

type DateRangePreset =
  | "custom"
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month"
  | "test_window";

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function getIstDateParts(date: Date): { dayKey: string; hour: number; minute: number } {
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

function getCurrentCostaRicaBusinessDayKey(): string {
  const { dayKey, hour, minute } = getIstDateParts(new Date());
  const isBeforeBoundary = hour < 11 || (hour === 11 && minute < 30);
  return isBeforeBoundary ? addDaysToIsoDate(dayKey, -1) : dayKey;
}

function getPresetRange(preset: DateRangePreset): { startDate: string; endDate: string } | null {
  const businessToday = getCurrentCostaRicaBusinessDayKey();
  if (preset === "today") return { startDate: businessToday, endDate: businessToday };
  if (preset === "yesterday") {
    const yesterday = addDaysToIsoDate(businessToday, -1);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (preset === "last_7d") return { startDate: addDaysToIsoDate(businessToday, -6), endDate: businessToday };
  if (preset === "last_14d") return { startDate: addDaysToIsoDate(businessToday, -13), endDate: businessToday };
  if (preset === "last_30d") return { startDate: addDaysToIsoDate(businessToday, -29), endDate: businessToday };

  const [year, month] = businessToday.split("-").map(Number);
  const thisMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  if (preset === "this_month") return { startDate: thisMonthStart, endDate: businessToday };

  if (preset === "last_month") {
    const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const lmYear = lastMonthDate.getUTCFullYear();
    const lmMonth = lastMonthDate.getUTCMonth() + 1;
    const startDate = `${lmYear}-${String(lmMonth).padStart(2, "0")}-01`;
    const endDate = `${lmYear}-${String(lmMonth).padStart(2, "0")}-${String(
      new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate()
    ).padStart(2, "0")}`;
    return { startDate, endDate };
  }

  return null;
}

export default function ABTestsPage() {
  const router = useRouter();
  const initialTodayRange = getPresetRange("today");
  const [tests, setTests] = useState<ABTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingWeights, setEditingWeights] = useState(false);
  const [weightA, setWeightA] = useState(50);
  const [weightB, setWeightB] = useState(50);
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [funnelConfig, setFunnelConfig] = useState<LayoutBFunnelConfig>(DEFAULT_LAYOUT_B_CONFIG);
  const [savingFunnelConfig, setSavingFunnelConfig] = useState(false);
  const [dateStart, setDateStart] = useState(initialTodayRange?.startDate || "");
  const [dateEnd, setDateEnd] = useState(initialTodayRange?.endDate || "");
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("today");
  const [expandOrderedFlow, setExpandOrderedFlow] = useState(false);
  const [upsellKpiViewMode, setUpsellKpiViewMode] = useState<"funnel" | "merged">("funnel");
  const [ordersFunnelFilter, setOrdersFunnelFilter] = useState<"all" | "A" | "B">("all");
  const [ordersSourceFilter, setOrdersSourceFilter] = useState<"all" | "bundle" | "upsell_page" | "dashboard">("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [expandedOrderKey, setExpandedOrderKey] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  // Check admin session and fetch data (same pattern as revenue dashboard)
  useEffect(() => {
    const checkAdminAndFetch = async () => {
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
      
      // Valid session, fetch tests
      fetchTests();
      fetchFunnelConfig();
    };
    
    checkAdminAndFetch();
  }, [router]);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/ab-tests");
      const data = await response.json();
      const nextTests = data.tests || [];
      setTests(nextTests);
      if (nextTests.length > 0) {
        const onboardingTest =
          nextTests.find((test: ABTest) => test.id === funnelConfig.testId) ||
          nextTests.find((test: ABTest) => test.id === DEFAULT_ONBOARDING_TEST_ID);
        if (onboardingTest && (!selectedTest || selectedTest.test.id !== onboardingTest.id)) {
          fetchTestDetails(onboardingTest.id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch tests:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFunnelConfig = async () => {
    try {
      const response = await fetch("/api/admin/funnel-config");
      const data = await response.json();
      if (data?.success && data.config) {
        setFunnelConfig(normalizeLayoutBConfig(data.config));
      }
    } catch (error) {
      console.error("Failed to fetch funnel config:", error);
    }
  };

  const buildDetailsUrl = (testId: string, startDate = dateStart, endDate = dateEnd) => {
    const params = new URLSearchParams({ testId });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return `/api/admin/ab-tests?${params.toString()}`;
  };

  const fetchTestDetails = async (
    testId: string,
    rangeOverrides?: { startDate?: string; endDate?: string }
  ) => {
    try {
      setLoading(true);
      const response = await fetch(
        buildDetailsUrl(
          testId,
          rangeOverrides?.startDate ?? dateStart,
          rangeOverrides?.endDate ?? dateEnd
        )
      );
      const data = await response.json();
      setSelectedTest(data);
      setWeightA(data.test?.variants?.A?.weight ?? 50);
      setWeightB(data.test?.variants?.B?.weight ?? 50);
      if (data?.test?.id && data.test.id === funnelConfig.testId) {
        setFunnelConfig((prev) => ({
          ...prev,
          variantAWeight: data.test?.variants?.A?.weight ?? prev.variantAWeight,
          variantBWeight: data.test?.variants?.B?.weight ?? prev.variantBWeight,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch test details:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateTestStatus = async (testId: string, status: string) => {
    try {
      await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId, status }),
      });
      fetchTests();
      if (selectedTest?.test?.id === testId) {
        fetchTestDetails(testId);
      }
    } catch (error) {
      console.error("Failed to update test status:", error);
    }
  };

  const updateWeights = async () => {
    if (!selectedTest) return;
    
    if (weightA + weightB !== 100) {
      alert("Weights must sum to 100%");
      return;
    }

    try {
      setSaving(true);
      const testId = selectedTest.test?.id || funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID;
      const isOnboardingLayoutTest = testId.startsWith("onboarding-layout");
      await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId,
          variants: {
            A: { weight: weightA, page: isOnboardingLayoutTest ? "bundle-pricing" : "step-17" },
            B: { weight: weightB, page: isOnboardingLayoutTest ? "bundle-pricing-b" : "a-step-17" },
          },
        }),
      });
      setEditingWeights(false);
      fetchTestDetails(testId);
    } catch (error) {
      console.error("Failed to update weights:", error);
    } finally {
      setSaving(false);
    }
  };

  const createDefaultTest = async () => {
    try {
      const testId = funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID;
      await fetch("/api/admin/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId,
          name: "Onboarding Layout A/B (QA)",
          variants: {
            A: { weight: funnelConfig.variantAWeight, page: "bundle-pricing" },
            B: { weight: funnelConfig.variantBWeight, page: "bundle-pricing-b" },
          },
        }),
      });
      await fetchTests();
      await fetchTestDetails(testId);
    } catch (error) {
      console.error("Failed to create test:", error);
    }
  };

  const resetAnalytics = async () => {
    if (!selectedTest?.test?.id) return;
    
    try {
      setResetting(true);
      const response = await fetch("/api/admin/ab-tests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest.test.id,
          resetAnalytics: true,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowResetModal(false);
        // Refresh the test details
        fetchTestDetails(selectedTest.test.id);
      } else {
        alert(data.error || "Failed to reset analytics");
      }
    } catch (error) {
      console.error("Failed to reset analytics:", error);
      alert("Failed to reset analytics");
    } finally {
      setResetting(false);
    }
  };

  const saveFunnelConfig = async () => {
    try {
      setSavingFunnelConfig(true);
      const response = await fetch("/api/admin/funnel-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: funnelConfig }),
      });
      const data = await response.json();
      if (data?.success && data.config) {
        setFunnelConfig(normalizeLayoutBConfig(data.config));
      }
      await fetchTests();
      if (selectedTest?.test?.id) {
        await fetchTestDetails(selectedTest.test.id);
      }
    } catch (error) {
      console.error("Failed to save funnel config:", error);
    } finally {
      setSavingFunnelConfig(false);
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    color = "primary",
    comparison
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string; 
    icon: ComponentType<{ className?: string }>;
    color?: string;
    comparison?: { value: string; better: boolean };
  }) => (
    <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className={`w-4 h-4 text-${color}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {comparison && (
        <p className={`text-xs mt-1 ${comparison.better ? "text-green-400" : "text-red-400"}`}>
          {comparison.better ? "↑" : "↓"} {comparison.value} vs other variant
        </p>
      )}
    </div>
  );

  if (selectedTest) {
    const {
      test,
      stats,
      analyticsWindowStart,
      appliedDateRange,
      appliedCostaRicaDateRange,
      dailyBreakdown,
      routeStats = { A: [], B: [] },
      orderedFunnelFlow = { A: [], B: [] },
      bundlePurchases = [],
      upsellPurchases = [],
      bundleBreakdown = { A: [], B: [] },
      upsellBreakdown = { A: [], B: [] },
      funnelSummary,
    } = selectedTest;
    
    // Default stats if not available
    const defaultStats: TestStats = {
      impressions: 0,
      conversions: 0,
      bounces: 0,
      checkoutsStarted: 0,
      totalRevenue: 0,
      conversionRate: "0.00",
      bounceRate: "0.00",
      checkoutRate: "0.00",
      checkoutToConversionRate: "0.00",
      avgRevenuePerUser: "0.00",
      avgRevenuePerImpression: "0.00",
    };
    
    const aStats = stats?.A || defaultStats;
    const bStats = stats?.B || defaultStats;
    const summaryA = funnelSummary?.A || {
      assignedUsers: aStats.impressions,
      bundleBuyers: aStats.conversions,
      upsellBuyers: 0,
      upsellAttachRate: "0.00",
      bundleRevenueInr: aStats.totalRevenue,
      upsellRevenueInr: 0,
      totalRevenueInr: aStats.totalRevenue,
      avgRevenuePerBundleBuyerInr: aStats.avgRevenuePerUser,
    };
    const summaryB = funnelSummary?.B || {
      assignedUsers: bStats.impressions,
      bundleBuyers: bStats.conversions,
      upsellBuyers: 0,
      upsellAttachRate: "0.00",
      bundleRevenueInr: bStats.totalRevenue,
      upsellRevenueInr: 0,
      totalRevenueInr: bStats.totalRevenue,
      avgRevenuePerBundleBuyerInr: bStats.avgRevenuePerUser,
    };

    const formatDateTime = (value: string) => {
      if (!value) return "—";
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return "—";
      return dt.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    };

    const shortId = (value: string) => {
      if (!value) return "—";
      if (value.length <= 14) return value;
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    };

    const copyUserId = async (userId: string) => {
      if (!userId) return;
      try {
        await navigator.clipboard.writeText(userId);
        setCopiedUserId(userId);
        setTimeout(() => setCopiedUserId((current) => (current === userId ? null : current)), 1200);
      } catch (error) {
        console.error("Failed to copy user id", error);
      }
    };

    const groupedBundleRows = Object.values(
      bundlePurchases.reduce<Record<string, {
        key: string;
        funnel: string;
        variant: "A" | "B";
        bundle: string;
        orders: number;
        uniqueUsers: Set<string>;
        revenueInr: number;
        latestPurchasedAt: string;
      }>>((acc, row) => {
        const key = `${row.variant}|${row.item}`;
        if (!acc[key]) {
          acc[key] = {
            key,
            funnel: row.funnel,
            variant: row.variant,
            bundle: row.item,
            orders: 0,
            uniqueUsers: new Set<string>(),
            revenueInr: 0,
            latestPurchasedAt: row.purchasedAt,
          };
        }
        acc[key].orders += 1;
        acc[key].uniqueUsers.add(row.userId);
        acc[key].revenueInr += row.amountInr;
        if (new Date(row.purchasedAt).getTime() > new Date(acc[key].latestPurchasedAt).getTime()) {
          acc[key].latestPurchasedAt = row.purchasedAt;
        }
        return acc;
      }, {})
    )
      .map((row) => ({
        ...row,
        buyers: row.uniqueUsers.size,
        revenueInr: Number(row.revenueInr.toFixed(2)),
      }))
      .sort((a, b) => b.orders - a.orders);

    const groupedBundleRowsByVariant = {
      A: groupedBundleRows.filter((row) => row.variant === "A"),
      B: groupedBundleRows.filter((row) => row.variant === "B"),
    };

    const bundlePurchasesByVariant = {
      A: bundlePurchases.filter((row) => row.variant === "A"),
      B: bundlePurchases.filter((row) => row.variant === "B"),
    };

    const upsellPurchasesByVariant = {
      A: upsellPurchases.filter((row) => row.variant === "A"),
      B: upsellPurchases.filter((row) => row.variant === "B"),
    };

    type OrderSource = "bundle" | "upsell_page" | "dashboard";
    type AggregatedOrderRow = {
      key: string;
      userId: string;
      email: string;
      userName?: string;
      totalAmountInr: number;
      totalItems: number;
      items: Array<{ name: string; count: number }>;
      variants: ("A" | "B")[];
      sources: OrderSource[];
      funnelLabel: string;
      lastPurchasedAt: string;
    };

    const toOrderItems = (row: PurchaseDetailRow, kind: "bundle" | "upsell"): string[] => {
      if (kind === "bundle") return [row.item];
      return String(row.item || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    };

    const orderRowsMap = new Map<string, {
      userId: string;
      email: string;
      userName?: string;
      totalAmountInr: number;
      itemsMap: Map<string, number>;
      variants: Set<"A" | "B">;
      sources: Set<OrderSource>;
      lastPurchasedAt: string;
    }>();

    const appendOrderRow = (row: PurchaseDetailRow, kind: "bundle" | "upsell") => {
      const key = row.userId;
      if (!orderRowsMap.has(key)) {
        orderRowsMap.set(key, {
          userId: row.userId,
          email: row.email,
          userName: row.userName,
          totalAmountInr: 0,
          itemsMap: new Map<string, number>(),
          variants: new Set<"A" | "B">(),
          sources: new Set<OrderSource>(),
          lastPurchasedAt: row.purchasedAt,
        });
      }
      const entry = orderRowsMap.get(key)!;
      entry.totalAmountInr += row.amountInr;
      if (!entry.userName && row.userName) entry.userName = row.userName;
      if (!entry.email && row.email) entry.email = row.email;
      entry.variants.add(row.variant);
      entry.sources.add(kind === "bundle" ? "bundle" : (row.source === "dashboard" ? "dashboard" : "upsell_page"));
      if (new Date(row.purchasedAt).getTime() > new Date(entry.lastPurchasedAt).getTime()) {
        entry.lastPurchasedAt = row.purchasedAt;
      }
      for (const item of toOrderItems(row, kind)) {
        entry.itemsMap.set(item, (entry.itemsMap.get(item) || 0) + 1);
      }
    };

    bundlePurchases.forEach((row) => appendOrderRow(row, "bundle"));
    upsellPurchases.forEach((row) => appendOrderRow(row, "upsell"));

    const aggregatedOrderRows: AggregatedOrderRow[] = Array.from(orderRowsMap.values())
      .map((entry) => {
        const variants = Array.from(entry.variants).sort();
        const sources = Array.from(entry.sources).sort() as OrderSource[];
        const items = Array.from(entry.itemsMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
        const totalItems = items.reduce((sum, item) => sum + item.count, 0);
        const funnelLabel =
          variants.length === 0
            ? "Unknown"
            : variants.length === 1
              ? `Layout ${variants[0]}`
              : "Mixed (A/B)";
        return {
          key: entry.userId,
          userId: entry.userId,
          email: entry.email,
          userName: entry.userName,
          totalAmountInr: Number(entry.totalAmountInr.toFixed(2)),
          totalItems,
          items,
          variants,
          sources,
          funnelLabel,
          lastPurchasedAt: entry.lastPurchasedAt,
        };
      })
      .sort((a, b) => new Date(b.lastPurchasedAt).getTime() - new Date(a.lastPurchasedAt).getTime());

    const ordersSearchTerm = ordersSearch.trim().toLowerCase();
    const filteredOrderRows = aggregatedOrderRows.filter((row) => {
      if (ordersFunnelFilter !== "all" && !row.variants.includes(ordersFunnelFilter)) return false;
      if (ordersSourceFilter !== "all" && !row.sources.includes(ordersSourceFilter)) return false;
      if (!ordersSearchTerm) return true;
      const haystack = `${row.userId} ${row.email} ${row.userName || ""} ${row.items.map((i) => i.name).join(" ")}`.toLowerCase();
      return haystack.includes(ordersSearchTerm);
    });

    const toRate = (num: number, den: number) => (den > 0 ? ((num / den) * 100).toFixed(2) : "0.00");
    const toMoney = (value: number) => Number(value.toFixed(2));
    const normalizeUpsellSource = (source?: string): "upsell_page" | "dashboard" =>
      source === "dashboard" ? "dashboard" : "upsell_page";

    const upsellRouteStatsByVariant = {
      A: routeStats.A.find((row) => row.route === "/onboarding/bundle-upsell"),
      B:
        routeStats.B.find((row) => row.route === "/onboarding/bundle-upsell-b") ||
        routeStats.B.find((row) => row.route === "/onboarding/bundle-upsell"),
    };

    const bundleBuyersByVariant = {
      A: summaryA.bundleBuyers || 0,
      B: summaryB.bundleBuyers || 0,
    };

    const upsellAudienceBySourceAndVariant: Record<"upsell_page" | "dashboard", { A: number; B: number }> = {
      upsell_page: {
        A: Math.max(upsellRouteStatsByVariant.A?.uniqueAudience || 0, upsellRouteStatsByVariant.A?.impressions || 0),
        B: Math.max(upsellRouteStatsByVariant.B?.uniqueAudience || 0, upsellRouteStatsByVariant.B?.impressions || 0),
      },
      dashboard: {
        A: bundleBuyersByVariant.A,
        B: bundleBuyersByVariant.B,
      },
    };

    const aggregateUpsellRows = (rows: PurchaseDetailRow[]): MixSummaryRow[] =>
      Object.values(
        rows.reduce<Record<string, { item: string; orders: number; users: Set<string>; revenueInr: number }>>(
          (acc, row) => {
            const key = row.item || "Unknown Upsell";
            if (!acc[key]) {
              acc[key] = {
                item: key,
                orders: 0,
                users: new Set<string>(),
                revenueInr: 0,
              };
            }
            acc[key].orders += 1;
            acc[key].users.add(row.userId);
            acc[key].revenueInr += row.amountInr;
            return acc;
          },
          {}
        )
      )
        .map((row) => ({
          item: row.item,
          orders: row.orders,
          buyers: row.users.size,
          revenueInr: Number(row.revenueInr.toFixed(2)),
        }))
        .sort((a, b) => b.orders - a.orders);

    const upsellBreakdownBySource = {
      upsell_page: {
        A: aggregateUpsellRows(upsellPurchasesByVariant.A.filter((row) => normalizeUpsellSource(row.source) === "upsell_page")),
        B: aggregateUpsellRows(upsellPurchasesByVariant.B.filter((row) => normalizeUpsellSource(row.source) === "upsell_page")),
      },
      dashboard: {
        A: aggregateUpsellRows(upsellPurchasesByVariant.A.filter((row) => normalizeUpsellSource(row.source) === "dashboard")),
        B: aggregateUpsellRows(upsellPurchasesByVariant.B.filter((row) => normalizeUpsellSource(row.source) === "dashboard")),
      },
    };

    const buildUpsellKpiRows = (
      source: "upsell_page" | "dashboard",
      variant: "A" | "B",
      rows: MixSummaryRow[]
    ): UpsellKpiRow[] => {
      const audience = upsellAudienceBySourceAndVariant[source][variant];
      return rows.map((row) => {
        const orders = row.orders;
        const revenueInr = row.revenueInr;
        return {
          item: row.item,
          audience,
          orders,
          conversionRate: toRate(orders, audience),
          revenueInr: toMoney(revenueInr),
          avgOrderValue: orders > 0 ? (revenueInr / orders).toFixed(2) : "0.00",
          revenuePerAudience: audience > 0 ? (revenueInr / audience).toFixed(2) : "0.00",
        };
      });
    };

    const upsellKpiRowsBySource = {
      upsell_page: {
        A: buildUpsellKpiRows("upsell_page", "A", upsellBreakdownBySource.upsell_page.A),
        B: buildUpsellKpiRows("upsell_page", "B", upsellBreakdownBySource.upsell_page.B),
      },
      dashboard: {
        A: buildUpsellKpiRows("dashboard", "A", upsellBreakdownBySource.dashboard.A),
        B: buildUpsellKpiRows("dashboard", "B", upsellBreakdownBySource.dashboard.B),
      },
    };

    const buildMergedUpsellKpiRows = (source: "upsell_page" | "dashboard"): UpsellKpiRow[] => {
      const mergedRows = aggregateUpsellRows(
        upsellPurchases.filter((row) => normalizeUpsellSource(row.source) === source)
      );
      const audience = upsellAudienceBySourceAndVariant[source].A + upsellAudienceBySourceAndVariant[source].B;

      return mergedRows.map((row) => {
        const orders = row.orders;
        const revenueInr = row.revenueInr;
        return {
          item: row.item,
          audience,
          orders,
          conversionRate: toRate(orders, audience),
          revenueInr: toMoney(revenueInr),
          avgOrderValue: orders > 0 ? (revenueInr / orders).toFixed(2) : "0.00",
          revenuePerAudience: audience > 0 ? (revenueInr / audience).toFixed(2) : "0.00",
        };
      });
    };

    const mergedUpsellKpiRowsBySource = {
      upsell_page: buildMergedUpsellKpiRows("upsell_page"),
      dashboard: buildMergedUpsellKpiRows("dashboard"),
    };

    // If test is undefined, show loading or error state
    if (!test) {
      return (
        <div className="min-h-screen bg-background p-6 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading test data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedTest(null)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{test.name || "A/B Test"}</h1>
                <p className="text-sm text-muted-foreground">
                  Created {test.createdAt ? new Date(test.createdAt).toLocaleDateString() : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Analytics base: {analyticsWindowStart ? `since ${new Date(analyticsWindowStart).toLocaleString()}` : "all tracked data"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Applied range: {appliedDateRange?.start ? new Date(appliedDateRange.start).toLocaleString() : "start"}
                  {" → "}
                  {appliedDateRange?.end ? new Date(appliedDateRange.end).toLocaleString() : "now"}
                </p>
                {appliedCostaRicaDateRange?.timezoneNote ? (
                  <p className="text-xs text-muted-foreground">{appliedCostaRicaDateRange.timezoneNote}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                test.status === "active" 
                  ? "bg-green-500/20 text-green-400" 
                  : test.status === "paused"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-gray-500/20 text-gray-400"
              }`}>
                {(test.status || "unknown").charAt(0).toUpperCase() + (test.status || "unknown").slice(1)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateTestStatus(
                    test.id || funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID,
                    test.status === "active" ? "paused" : "active"
                  )
                }
              >
                {test.status === "active" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {test.status === "active" ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  fetchTestDetails(test.id || funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID, {
                    startDate: dateStart,
                    endDate: dateEnd,
                  })
                }
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetModal(true)}
                className="text-red-400 border-red-400/50 hover:bg-red-500/10"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Analytics
              </Button>
            </div>
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Date Range Filter</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">Range Preset</span>
                <select
                  value={dateRangePreset}
                  onChange={(e) => setDateRangePreset(e.target.value as DateRangePreset)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="custom">Custom (Calendar)</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_7d">Last 7 Days</option>
                  <option value="last_14d">Last 14 Days</option>
                  <option value="last_30d">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="test_window">Since Test Reset/Start</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">Start Date</span>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => {
                    setDateStart(e.target.value);
                    setDateRangePreset("custom");
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">End Date</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => {
                    setDateEnd(e.target.value);
                    setDateRangePreset("custom");
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </label>
              <Button
                onClick={() => {
                  const testKey = test.id || funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID;
                  if (dateRangePreset === "test_window") {
                    setDateStart("");
                    setDateEnd("");
                    fetchTestDetails(testKey, {
                      startDate: "",
                      endDate: "",
                    });
                    return;
                  }
                  if (dateRangePreset === "custom") {
                    fetchTestDetails(testKey, {
                      startDate: dateStart,
                      endDate: dateEnd,
                    });
                    return;
                  }
                  const presetRange = getPresetRange(dateRangePreset);
                  if (!presetRange) return;
                  setDateStart(presetRange.startDate);
                  setDateEnd(presetRange.endDate);
                  fetchTestDetails(testKey, presetRange);
                }}
                disabled={loading}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDateStart("");
                  setDateEnd("");
                  setDateRangePreset("test_window");
                  fetchTestDetails(test.id || funnelConfig.testId || DEFAULT_ONBOARDING_TEST_ID, {
                    startDate: "",
                    endDate: "",
                  });
                }}
                disabled={loading}
              >
                Clear
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Each selected date represents Costa Rica day (UTC-6), aligned as 11:30 AM IST to next day 11:29 AM IST.
            </p>
          </div>

          {/* Reset Analytics Modal */}
          {showResetModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Reset Analytics</h3>
                    <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                  </div>
                </div>
                
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-300">
                    This will permanently delete:
                  </p>
                  <ul className="text-sm text-red-300/80 mt-2 space-y-1">
                    <li>• All impressions and conversion data</li>
                    <li>• All user variant assignments</li>
                    <li>• Daily performance history</li>
                    <li>• Revenue tracking for this test</li>
                  </ul>
                  <p className="text-sm text-red-300 mt-3">
                    New analytics will start fresh from this moment.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowResetModal(false)}
                    disabled={resetting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={resetAnalytics}
                    disabled={resetting}
                  >
                    {resetting ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset All Data
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Layout B Funnel Controls */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Layout B Funnel Controls</h2>
              <Button size="sm" onClick={saveFunnelConfig} disabled={savingFunnelConfig}>
                {savingFunnelConfig ? "Saving..." : "Save Funnel Config"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <label className="flex items-center justify-between px-3 py-2 bg-background border border-border rounded-lg">
                <span className="text-sm">A/B Test Enabled</span>
                <input
                  type="checkbox"
                  checked={funnelConfig.enabled}
                  onChange={(e) => setFunnelConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 bg-background border border-border rounded-lg">
                <span className="text-sm">Layout B Enabled</span>
                <input
                  type="checkbox"
                  checked={funnelConfig.layoutBEnabled}
                  onChange={(e) => setFunnelConfig((prev) => ({ ...prev, layoutBEnabled: e.target.checked }))}
                />
              </label>
              <label className="flex items-center justify-between px-3 py-2 bg-background border border-border rounded-lg">
                <span className="text-sm">Max Sketch / User</span>
                <input
                  type="number"
                  min={1}
                  max={1}
                  value={funnelConfig.maxSketchPerUser}
                  onChange={(e) =>
                    setFunnelConfig((prev) => ({
                      ...prev,
                      maxSketchPerUser: Math.max(1, Math.min(1, Number(e.target.value) || 1)),
                    }))
                  }
                  className="w-14 bg-transparent text-right"
                />
              </label>
            </div>

          </div>

          {/* Traffic Split */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Traffic Split</h2>
              {!editingWeights ? (
                <Button variant="outline" size="sm" onClick={() => setEditingWeights(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Weights
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingWeights(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={updateWeights} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>

            {editingWeights ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Variant A (Current)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={weightA}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setWeightA(val);
                        setWeightB(100 - val);
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Variant B (New Plans)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={weightB}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setWeightB(val);
                        setWeightA(100 - val);
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {weightA + weightB}% (must equal 100%)
                </p>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Variant A</span>
                    <span className="text-2xl font-bold text-blue-400">{test.variants?.A?.weight ?? 50}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Layout A route: {test.variants?.A?.page || "bundle-pricing"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Current baseline onboarding/paywall experience</p>
                </div>
                <div className="flex-1 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Variant B</span>
                    <span className="text-2xl font-bold text-purple-400">{test.variants?.B?.weight ?? 50}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Layout B route: {test.variants?.B?.page || "bundle-pricing-b"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Sketch-focused onboarding + compatibility on upsell</p>
                </div>
              </div>
            )}
          </div>

          {/* Variant A Stats */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              Variant A - Current Plans
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Impressions"
                value={aStats.impressions.toLocaleString()}
                icon={Eye}
                color="blue-400"
              />
              <StatCard
                title="Conversions"
                value={aStats.conversions.toLocaleString()}
                subtitle={`${aStats.conversionRate}% rate`}
                icon={UserCheck}
                color="green-400"
                comparison={parseFloat(aStats.conversionRate) > parseFloat(bStats.conversionRate) 
                  ? { value: `${(parseFloat(aStats.conversionRate) - parseFloat(bStats.conversionRate)).toFixed(2)}%`, better: true }
                  : { value: `${(parseFloat(bStats.conversionRate) - parseFloat(aStats.conversionRate)).toFixed(2)}%`, better: false }
                }
              />
              <StatCard
                title="Bounce Rate"
                value={`${aStats.bounceRate}%`}
                icon={XCircle}
                color="red-400"
              />
              <StatCard
                title="Revenue"
                value={`$${aStats.totalRevenue.toFixed(2)}`}
                subtitle={`$${aStats.avgRevenuePerUser} per user`}
                icon={DollarSign}
                color="emerald-400"
              />
            </div>
          </div>

          {/* Variant B Stats */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              Variant B - New Plans
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Impressions"
                value={bStats.impressions.toLocaleString()}
                icon={Eye}
                color="purple-400"
              />
              <StatCard
                title="Conversions"
                value={bStats.conversions.toLocaleString()}
                subtitle={`${bStats.conversionRate}% rate`}
                icon={UserCheck}
                color="green-400"
                comparison={parseFloat(bStats.conversionRate) > parseFloat(aStats.conversionRate) 
                  ? { value: `${(parseFloat(bStats.conversionRate) - parseFloat(aStats.conversionRate)).toFixed(2)}%`, better: true }
                  : { value: `${(parseFloat(aStats.conversionRate) - parseFloat(bStats.conversionRate)).toFixed(2)}%`, better: false }
                }
              />
              <StatCard
                title="Bounce Rate"
                value={`${bStats.bounceRate}%`}
                icon={XCircle}
                color="red-400"
              />
              <StatCard
                title="Revenue"
                value={`$${bStats.totalRevenue.toFixed(2)}`}
                subtitle={`$${bStats.avgRevenuePerUser} per user`}
                icon={DollarSign}
                color="emerald-400"
              />
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Side-by-Side Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Metric</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-blue-400">Variant A</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-purple-400">Variant B</th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { metric: "Impressions", a: aStats.impressions, b: bStats.impressions, higherBetter: true },
                    { metric: "Conversions", a: aStats.conversions, b: bStats.conversions, higherBetter: true },
                    { metric: "Conversion Rate", a: `${aStats.conversionRate}%`, b: `${bStats.conversionRate}%`, higherBetter: true, compare: [parseFloat(aStats.conversionRate), parseFloat(bStats.conversionRate)] },
                    { metric: "Bounce Rate", a: `${aStats.bounceRate}%`, b: `${bStats.bounceRate}%`, higherBetter: false, compare: [parseFloat(aStats.bounceRate), parseFloat(bStats.bounceRate)] },
                    { metric: "Checkout Rate", a: `${aStats.checkoutRate}%`, b: `${bStats.checkoutRate}%`, higherBetter: true, compare: [parseFloat(aStats.checkoutRate), parseFloat(bStats.checkoutRate)] },
                    { metric: "Total Revenue", a: `$${aStats.totalRevenue.toFixed(2)}`, b: `$${bStats.totalRevenue.toFixed(2)}`, higherBetter: true, compare: [aStats.totalRevenue, bStats.totalRevenue] },
                    { metric: "Avg Revenue/User", a: `$${aStats.avgRevenuePerUser}`, b: `$${bStats.avgRevenuePerUser}`, higherBetter: true, compare: [parseFloat(aStats.avgRevenuePerUser), parseFloat(bStats.avgRevenuePerUser)] },
                  ].map((row) => {
                    let winner = "-";
                    if (row.compare) {
                      if (row.higherBetter) {
                        winner = row.compare[0] > row.compare[1] ? "A" : row.compare[1] > row.compare[0] ? "B" : "-";
                      } else {
                        winner = row.compare[0] < row.compare[1] ? "A" : row.compare[1] < row.compare[0] ? "B" : "-";
                      }
                    }
                    return (
                      <tr key={row.metric} className="border-b border-border/50">
                        <td className="py-3 px-4 text-sm">{row.metric}</td>
                        <td className={`py-3 px-4 text-sm text-center ${winner === "A" ? "text-green-400 font-semibold" : ""}`}>
                          {row.a}
                        </td>
                        <td className={`py-3 px-4 text-sm text-center ${winner === "B" ? "text-green-400 font-semibold" : ""}`}>
                          {row.b}
                        </td>
                        <td className="py-3 px-4 text-sm text-center">
                          {winner !== "-" && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              winner === "A" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                            }`}>
                              {winner}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funnel Decision Summary */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Funnel Decision Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                <p className="text-sm font-semibold text-blue-300 mb-3">Variant A (Layout A)</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Assigned</p>
                    <p className="text-lg font-semibold">{summaryA.assignedUsers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bundle Buyers</p>
                    <p className="text-lg font-semibold">{summaryA.bundleBuyers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Buyers</p>
                    <p className="text-lg font-semibold">{summaryA.upsellBuyers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Attach Rate</p>
                    <p className="text-lg font-semibold">{summaryA.upsellAttachRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bundle Revenue</p>
                    <p className="text-lg font-semibold">₹{summaryA.bundleRevenueInr.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Revenue</p>
                    <p className="text-lg font-semibold">₹{summaryA.upsellRevenueInr.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                <p className="text-sm font-semibold text-purple-300 mb-3">Variant B (Layout B)</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Assigned</p>
                    <p className="text-lg font-semibold">{summaryB.assignedUsers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bundle Buyers</p>
                    <p className="text-lg font-semibold">{summaryB.bundleBuyers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Buyers</p>
                    <p className="text-lg font-semibold">{summaryB.upsellBuyers}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Attach Rate</p>
                    <p className="text-lg font-semibold">{summaryB.upsellAttachRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bundle Revenue</p>
                    <p className="text-lg font-semibold">₹{summaryB.bundleRevenueInr.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Upsell Revenue</p>
                    <p className="text-lg font-semibold">₹{summaryB.upsellRevenueInr.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ordered Funnel Flow */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-lg font-semibold">Ordered Funnel Flow (Welcome → Pre-Dashboard)</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandOrderedFlow((prev) => !prev)}
              >
                {expandOrderedFlow ? "Collapse View" : "Expand View"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Routes are shown in exact funnel order for each variant. Drop-off is estimated from visitors who did not continue to the next step.
            </p>
            <div className={expandOrderedFlow ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 lg:grid-cols-2 gap-6"}>
              {([
                { variant: "A" as const, label: "Variant A Flow", accent: "text-blue-400", rows: orderedFunnelFlow.A || [] },
                { variant: "B" as const, label: "Variant B Flow", accent: "text-purple-400", rows: orderedFunnelFlow.B || [] },
              ]).map((group) => (
                <div key={group.variant} className="rounded-lg border border-border/70 bg-background/40 p-4">
                  <p className={`text-sm font-semibold mb-3 ${group.accent}`}>{group.label}</p>
                  {group.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ordered funnel data yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={expandOrderedFlow ? "w-full min-w-[980px]" : "w-full min-w-[860px]"}>
                        <thead>
                          <tr className="border-b border-border/70 text-xs text-muted-foreground">
                            <th className="text-left py-2 pr-3">Step</th>
                            <th className="text-left py-2 px-2">Route</th>
                            <th className="text-right py-2 px-2">Audience</th>
                            <th className="text-right py-2 px-2">Impressions</th>
                            <th className="text-right py-2 px-2">Continued</th>
                            <th className="text-right py-2 px-2">Drop-off</th>
                            <th className="text-right py-2 px-2">Bounce %</th>
                            <th className="text-right py-2 px-2">Checkout</th>
                            <th className="text-right py-2 px-2">Paid</th>
                            <th className="text-right py-2 pl-2">Revenue (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={`${group.variant}-flow-${row.step}-${row.route}`} className="border-b border-border/40 text-sm">
                              <td className="py-2 pr-3">{row.step}</td>
                              <td className="py-2 px-2">
                                <p className="font-medium">{row.route}</p>
                              </td>
                              <td className="text-right py-2 px-2">{row.audience}</td>
                              <td className="text-right py-2 px-2">{row.impressions}</td>
                              <td className="text-right py-2 px-2">{row.continuedToNext}</td>
                              <td className="text-right py-2 px-2">{row.dropOffs}</td>
                              <td className="text-right py-2 px-2">{row.bounceRate}%</td>
                              <td className="text-right py-2 px-2">{row.checkoutsStarted}</td>
                              <td className="text-right py-2 px-2">{row.paidOrders}</td>
                              <td className="text-right py-2 pl-2">₹{(row.paidRevenueInr + row.upsellRevenueInr).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bundle/Upsell Mix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Bundle Mix by Funnel</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { variant: "A", label: "Variant A", rows: bundleBreakdown.A || [], accent: "text-blue-400" },
                  { variant: "B", label: "Variant B", rows: bundleBreakdown.B || [], accent: "text-purple-400" },
                ]).map((group) => (
                  <div key={group.variant} className="rounded-lg border border-border/70 p-3">
                    <p className={`text-sm font-semibold mb-2 ${group.accent}`}>{group.label}</p>
                    {group.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No bundle purchases yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {group.rows.slice(0, 8).map((row) => (
                          <div key={`${group.variant}-${row.item}`} className="flex items-center justify-between text-sm">
                            <div>
                              <p className="font-medium">{row.item}</p>
                              <p className="text-xs text-muted-foreground">{row.orders} orders</p>
                              <p className="text-xs text-muted-foreground">
                                Price: ₹{(row.orders > 0 ? row.revenueInr / row.orders : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <p className="font-semibold">₹{row.revenueInr.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Upsell Mix by Funnel</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { variant: "A", label: "Variant A", rows: upsellBreakdown.A || [], accent: "text-blue-400" },
                  { variant: "B", label: "Variant B", rows: upsellBreakdown.B || [], accent: "text-purple-400" },
                ]).map((group) => (
                  <div key={group.variant} className="rounded-lg border border-border/70 p-3">
                    <p className={`text-sm font-semibold mb-2 ${group.accent}`}>{group.label}</p>
                    {group.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No upsell purchases yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {group.rows.slice(0, 8).map((row) => (
                          <div key={`${group.variant}-${row.item}`} className="flex items-center justify-between text-sm">
                            <div>
                              <p className="font-medium">{row.item}</p>
                              <p className="text-xs text-muted-foreground">{row.orders} orders</p>
                              <p className="text-xs text-muted-foreground">
                                Price: ₹{(row.orders > 0 ? row.revenueInr / row.orders : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <p className="font-semibold">₹{row.revenueInr.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-lg font-semibold">Upsell KPI Performance</h2>
              <div className="inline-flex items-center rounded-lg border border-border bg-background/60 p-1">
                <Button
                  size="sm"
                  variant={upsellKpiViewMode === "funnel" ? "default" : "ghost"}
                  onClick={() => setUpsellKpiViewMode("funnel")}
                >
                  By Funnel
                </Button>
                <Button
                  size="sm"
                  variant={upsellKpiViewMode === "merged" ? "default" : "ghost"}
                  onClick={() => setUpsellKpiViewMode("merged")}
                >
                  Merged
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              {([
                { key: "upsell_page" as const, title: "Onboarding Upsell Page KPIs", accent: "text-fuchsia-400" },
                { key: "dashboard" as const, title: "Dashboard Upsell KPIs", accent: "text-cyan-400" },
              ]).map((sourceGroup) => (
                <div key={sourceGroup.key} className="rounded-lg border border-border/70 bg-background/30 p-4">
                  <p className={`text-sm font-semibold mb-3 ${sourceGroup.accent}`}>{sourceGroup.title}</p>
                  {upsellKpiViewMode === "funnel" ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {([
                        { variant: "A" as const, label: "Variant A", accent: "text-blue-400", rows: upsellKpiRowsBySource[sourceGroup.key].A },
                        { variant: "B" as const, label: "Variant B", accent: "text-purple-400", rows: upsellKpiRowsBySource[sourceGroup.key].B },
                      ]).map((group) => (
                        <div key={`${sourceGroup.key}-${group.variant}`} className="rounded-lg border border-border/70 bg-background/40 p-4">
                          <p className={`text-sm font-semibold mb-3 ${group.accent}`}>{group.label}</p>
                          {group.rows.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No data in selected range.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[860px]">
                                <thead>
                                  <tr className="border-b border-border text-xs text-muted-foreground">
                                    <th className="text-left py-2 pr-3">Upsell</th>
                                    <th className="text-right py-2 px-2">Audience</th>
                                    <th className="text-right py-2 px-2">Orders</th>
                                    <th className="text-right py-2 px-2">Conv %</th>
                                    <th className="text-right py-2 px-2">Revenue (₹)</th>
                                    <th className="text-right py-2 px-2">AOV (₹)</th>
                                    <th className="text-right py-2 pl-2">Rev/Audience (₹)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((row) => (
                                    <tr key={`${sourceGroup.key}-${group.variant}-upsell-kpi-${row.item}`} className="border-b border-border/40 text-sm">
                                      <td className="py-2 pr-3">{row.item}</td>
                                      <td className="py-2 px-2 text-right">{row.audience}</td>
                                      <td className="py-2 px-2 text-right">{row.orders}</td>
                                      <td className="py-2 px-2 text-right">{row.conversionRate}%</td>
                                      <td className="py-2 px-2 text-right">{row.revenueInr.toLocaleString()}</td>
                                      <td className="py-2 px-2 text-right">{Number(row.avgOrderValue).toLocaleString()}</td>
                                      <td className="py-2 pl-2 text-right">{Number(row.revenuePerAudience).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/70 bg-background/40 p-4">
                      <p className="text-sm font-semibold mb-3 text-emerald-400">Merged (All Funnels)</p>
                      {mergedUpsellKpiRowsBySource[sourceGroup.key].length === 0 ? (
                        <p className="text-xs text-muted-foreground">No data in selected range.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[860px]">
                            <thead>
                              <tr className="border-b border-border text-xs text-muted-foreground">
                                <th className="text-left py-2 pr-3">Upsell</th>
                                <th className="text-right py-2 px-2">Audience</th>
                                <th className="text-right py-2 px-2">Orders</th>
                                <th className="text-right py-2 px-2">Conv %</th>
                                <th className="text-right py-2 px-2">Revenue (₹)</th>
                                <th className="text-right py-2 px-2">AOV (₹)</th>
                                <th className="text-right py-2 pl-2">Rev/Audience (₹)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mergedUpsellKpiRowsBySource[sourceGroup.key].map((row) => (
                                <tr key={`${sourceGroup.key}-merged-upsell-kpi-${row.item}`} className="border-b border-border/40 text-sm">
                                  <td className="py-2 pr-3">{row.item}</td>
                                  <td className="py-2 px-2 text-right">{row.audience}</td>
                                  <td className="py-2 px-2 text-right">{row.orders}</td>
                                  <td className="py-2 px-2 text-right">{row.conversionRate}%</td>
                                  <td className="py-2 px-2 text-right">{row.revenueInr.toLocaleString()}</td>
                                  <td className="py-2 px-2 text-right">{Number(row.avgOrderValue).toLocaleString()}</td>
                                  <td className="py-2 pl-2 text-right">{Number(row.revenuePerAudience).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold">Orders</h2>
              <p className="text-xs text-muted-foreground">
                {filteredOrderRows.length} of {aggregatedOrderRows.length} users
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">Search</span>
                <input
                  type="text"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="User, email, name, item..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">Funnel</span>
                <select
                  value={ordersFunnelFilter}
                  onChange={(e) => setOrdersFunnelFilter(e.target.value as "all" | "A" | "B")}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="all">All</option>
                  <option value="A">Layout A</option>
                  <option value="B">Layout B</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground block mb-1">Source</span>
                <select
                  value={ordersSourceFilter}
                  onChange={(e) => setOrdersSourceFilter(e.target.value as "all" | "bundle" | "upsell_page" | "dashboard")}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                >
                  <option value="all">All</option>
                  <option value="bundle">Bundle</option>
                  <option value="upsell_page">Onboarding Upsell</option>
                  <option value="dashboard">Dashboard Upsell</option>
                </select>
              </label>
              <div className="text-sm flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setOrdersSearch("");
                    setOrdersFunnelFilter("all");
                    setOrdersSourceFilter("all");
                    setExpandedOrderKey(null);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </div>

            {filteredOrderRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching orders in selected window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-3">User</th>
                      <th className="text-left py-2 px-2">Email / Name</th>
                      <th className="text-right py-2 px-2">Total Paid (₹)</th>
                      <th className="text-left py-2 px-2">Items</th>
                      <th className="text-left py-2 px-2">Funnel</th>
                      <th className="text-left py-2 pl-2">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrderRows.map((row) => {
                      const isExpanded = expandedOrderKey === row.key;
                      return (
                          <tr key={`order-${row.key}`} className="border-b border-border/40 text-sm hover:bg-muted/20">
                            <td className="py-2 pr-3 font-mono">
                              <div className="group inline-flex items-center gap-2">
                                <span>{shortId(row.userId)}</span>
                                <button
                                  type="button"
                                  onClick={() => copyUserId(row.userId)}
                                  className="px-2 py-0.5 text-[10px] rounded border border-border bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/60"
                                >
                                  {copiedUserId === row.userId ? "Copied" : "Copy ID"}
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <p className="font-medium">{row.userName || "—"}</p>
                              <p className="text-xs text-muted-foreground">{row.email}</p>
                            </td>
                            <td className="py-2 px-2 text-right font-semibold">{row.totalAmountInr.toLocaleString()}</td>
                            <td className="py-2 px-2 relative isolate">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-foreground hover:bg-muted/60 transition-colors"
                                onClick={() => setExpandedOrderKey(isExpanded ? null : row.key)}
                              >
                                {row.totalItems} item{row.totalItems === 1 ? "" : "s"}
                                <span className={`text-[10px] leading-none transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                              </button>
                              {isExpanded ? (
                                <div className="absolute top-[calc(100%+4px)] left-2 z-[999] w-72 rounded-md border border-slate-700 bg-slate-950 shadow-2xl p-3">
                                  <p className="text-xs text-muted-foreground mb-2">Products bought</p>
                                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                    {row.items.map((item) => (
                                      <div key={`${row.key}-${item.name}`} className="flex items-center justify-between text-sm">
                                        <span className="pr-3">{item.name}</span>
                                        <span className="text-muted-foreground">x{item.count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 px-2">{row.funnelLabel}</td>
                            <td className="py-2 pl-2">{formatDateTime(row.lastPurchasedAt)}</td>
                          </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bundle/Upsell Purchases */}
          <div className="grid grid-cols-1 gap-6 mb-6">
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Bundle Buyers Grouped by Funnel + Bundle</h2>
              {(groupedBundleRowsByVariant.A.length === 0 && groupedBundleRowsByVariant.B.length === 0) ? (
                <p className="text-sm text-muted-foreground">No paid bundle purchases in current A/B window.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {([
                    { variant: "A" as const, label: "Layout A (Variant A)", accent: "text-blue-400", rows: groupedBundleRowsByVariant.A },
                    { variant: "B" as const, label: "Layout B (Variant B)", accent: "text-purple-400", rows: groupedBundleRowsByVariant.B },
                  ]).map((group) => (
                    <div key={group.variant} className="rounded-lg border border-border/70 bg-background/40 p-4">
                      <p className={`text-sm font-semibold mb-3 ${group.accent}`}>{group.label}</p>
                      {group.rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No paid bundle purchases.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px]">
                            <thead>
                              <tr className="border-b border-border text-xs text-muted-foreground">
                                <th className="text-left py-2 pr-3">Bundle</th>
                                <th className="text-right py-2 px-2">Orders</th>
                                <th className="text-right py-2 px-2">Amount (₹)</th>
                                <th className="text-left py-2 pl-2">Last Purchase</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.slice(0, 40).map((row) => (
                                <tr key={`bundle-group-${row.key}`} className="border-b border-border/40 text-sm">
                                  <td className="py-2 pr-3">
                                    <p>{row.bundle}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Price: ₹{(row.orders > 0 ? row.revenueInr / row.orders : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </p>
                                  </td>
                                  <td className="py-2 px-2 text-right">{row.orders}</td>
                                  <td className="py-2 px-2 text-right">{row.revenueInr.toLocaleString()}</td>
                                  <td className="py-2 pl-2">{formatDateTime(row.latestPurchasedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Daily Breakdown Chart (simplified) */}
          {dailyBreakdown.length > 0 && (
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Daily Performance (Filtered Range)</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dailyBreakdown.slice(-14).map((day) => (
                  <div key={day.date} className="flex items-center gap-4 text-sm">
                    <span className="w-24 text-muted-foreground">{day.date}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-blue-400 w-16">A: {day.A.conversions}/{day.A.impressions}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500" 
                          style={{ width: `${day.A.impressions > 0 ? (day.A.conversions / day.A.impressions) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-purple-400 w-16">B: {day.B.conversions}/{day.B.impressions}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500" 
                          style={{ width: `${day.B.impressions > 0 ? (day.B.conversions / day.B.impressions) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/admin")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">A/B Tests</h1>
              <p className="text-sm text-muted-foreground">
                Manage and monitor your pricing experiments
              </p>
            </div>
          </div>
          <Button onClick={fetchTests} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No A/B Tests Found</h2>
            <p className="text-muted-foreground mb-4">Create your first A/B test to start experimenting</p>
            <Button onClick={createDefaultTest}>
              Create Onboarding Test
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => (
              <motion.div
                key={test.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fetchTestDetails(test.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${
                      test.status === "active" ? "bg-green-500" : 
                      test.status === "paused" ? "bg-yellow-500" : "bg-gray-500"
                    }`} />
                    <div>
                      <h3 className="font-semibold">{test.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {test.variants?.A?.weight ?? 50}% / {test.variants?.B?.weight ?? 50}% split
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {test.quickStats && (
                      <>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Impressions</p>
                          <p className="font-semibold">{test.quickStats.totalImpressions.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Conversions</p>
                          <p className="font-semibold">{test.quickStats.totalConversions.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">A vs B</p>
                          <p className="font-semibold">
                            <span className="text-blue-400">{test.quickStats.variantAConversionRate}%</span>
                            {" / "}
                            <span className="text-purple-400">{test.quickStats.variantBConversionRate}%</span>
                          </p>
                        </div>
                      </>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
