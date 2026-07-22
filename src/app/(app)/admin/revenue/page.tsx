"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  IndianRupee,
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
  Megaphone,
  Eye,
  MousePointerClick,
  Target,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  FileSpreadsheet,
  Facebook,
  TrendingDown,
  GripVertical,
} from "lucide-react";

import React from "react";
import { createPortal } from "react-dom";

// Tab type
type TabType = "dashboard" | "profit-sheet" | "meta-details" | "attribution" | "analytics";

// Profit Sheet row interface
interface ProfitSheetRow {
  date: string;           // Costa Rica date (e.g., "2026-03-13")
  day: string;            // Day of week (e.g., "Sat")
  revenue: number;        // Net revenue after refunds for that Costa Rica day
  grossRevenue?: number;  // Gross received amount before refunds
  refundAmount?: number;  // Refund amount for that day
  gst: number;            // 5% of revenue
  adsCostUSD: number;     // Meta Ads spend in USD
  adsCostINR: number;     // Meta Ads spend converted to INR
  netRevenue: number;     // Revenue - GST - Ads Cost (INR)
  profitPercent?: number; // Net Revenue / Revenue * 100
  roas: number;           // Bundle purchase revenue / Ads Cost INR (if ads cost > 0)
  bundleRevenue?: number; // Revenue from bundle purchases only
  transactionCount: number;
  bundlePurchases: number;
}

// Meta Ads Breakdown interfaces
interface MetaAdMetrics {
  id: string;
  metaId?: string;
  accountId?: string;
  accountName?: string;
  name: string;
  status: string;
  spend: number;
  budget: number | null;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  purchases: number;
  firstPartySales?: number;
  firstPartyRevenue?: number;
  costPerPurchase: number;
  reach: number;
  roas: number;
}

interface MetaAdData extends MetaAdMetrics {}

interface MetaAdSetData extends MetaAdMetrics {
  ads: MetaAdData[];
}

interface MetaCampaignData extends MetaAdMetrics {
  adsets: MetaAdSetData[];
}

interface MetaTotals {
  spend: number;
  spendINR: number;
  impressions: number;
  clicks: number;
  purchases: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  costPerPurchase: number;
  roas: number;
}

interface MetaSourceBreakdown {
  firstPartySales: number;
  firstPartyAttributedSales?: number;
  firstPartyAttributedRevenue?: number;
  metaPurchases: number;
  organicOrUnattributedSales: number;
}

interface MetaBreakdownData {
  configured: boolean;
  account?: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  accounts?: Array<{
    account: {
      id: string;
      name: string;
      currency: string;
      timezone: string;
    };
    campaigns: MetaCampaignData[];
    totals: MetaTotals;
    sourceBreakdown?: MetaSourceBreakdown;
  }>;
  exchangeRate: number;
  datePreset: string;
  dateRange: { start: string; end: string };
  businessDateRange?: { start: string; end: string };
  businessRule?: string;
  campaigns: MetaCampaignData[];
  revenue: {
    totalRevenue: number;
    grossRevenue?: number;
    refundAmount?: number;
    totalSales: number;
    totalRefunds?: number;
    gst: number;
    netRevenue: number;
    totalSpendINR: number;
    profit: number;
    roas: number;
  };
  sourceBreakdown?: MetaSourceBreakdown;
  attribution?: {
    campaignAttributionSource: string;
    firstPartyCampaignAttributionAvailable: boolean;
    note: string;
  };
  totals: MetaTotals;
}

interface AttributionFunnelStage {
  id: string;
  label: string;
  visitors: number;
  dropOffFromPrevious: number;
  conversionFromPreviousPercent: number;
}

interface AttributionProductRow {
  key: string;
  label: string;
  productType: string;
  productId: string | null;
  orders: number;
  revenueInr: number;
  estimatedGstInr: number;
  estimatedProfitBeforeAdSpendInr: number;
}

interface AttributionCampaignProduct {
  label: string;
  orders: number;
  revenueInr: number;
}

interface AttributionCampaignRow {
  key: string;
  utmCampaign: string | null;
  utmContent: string | null;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  campaignName?: string | null;
  adsetName?: string | null;
  adName?: string | null;
  orders: number;
  metaPurchases?: number | null;
  revenueInr: number;
  adSpendInr: number;
  budgetInr?: number | null;
  impressions?: number;
  clicks?: number;
  cpcInr?: number;
  cpaInr?: number;
  cpmInr?: number;
  ctr?: number;
  estimatedProfitAfterAdSpendInr: number;
  roas: number | null;
  products: AttributionCampaignProduct[];
}

interface MarketingAttributionData {
  configured: boolean;
  eventsAvailable: boolean;
  eventsError: string | null;
  range: {
    start: string;
    end: string;
    startDate: string;
    endDate: string;
  };
  metaUrlParameterTemplate: string;
  summary: {
    events: number;
    payments: number;
    paidOrders: number;
    revenueInr: number;
    attributedRevenueInr: number;
    attributedRevenuePercent: number;
    metaSpendConfigured: boolean;
  };
  funnel: AttributionFunnelStage[];
  products: AttributionProductRow[];
  campaigns: AttributionCampaignRow[];
}

interface AnalyticsPeakSalesMetric {
  label: string;
  count: number;
  revenueInr: number;
}

interface AnalyticsPeakTrafficMetric {
  label: string;
  sessions: number;
}

interface AnalyticsTrafficTrendPoint {
  label: string;
  sessions: number;
}

interface AnalyticsSalesTrendPoint {
  label: string;
  count: number;
  revenueInr: number;
}

interface AnalyticsHourlyProfitabilityPoint {
  date: string;
  weekday: string;
  hour: number;
  label: string;
  orderCount: number;
  revenueInr: number;
  profitInr: number;
  roas: number;
}

interface AnalyticsRouteMetric {
  route: string;
  viewers: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDurationSec: number;
  checkouts: number;
  bounces: number;
  source: "ga" | "internal";
}

interface AnalyticsSourceStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

interface AnalyticsData {
  range: {
    startDate: string;
    endDate: string;
    timezone: string;
    dayMode?: "calendar_ist" | "business_1130_ist";
  };
  kpis: {
    paidOrders: number;
    refundedOrders?: number;
    paidRevenueInr: number;
    pendingPayments: number;
    failedPayments: number;
    checkoutStarts: number;
    checkoutToPaidRate: number;
  };
  funnel: {
    totalVisitors?: number;
    paywallVisitors: number;
    paidOrders: number;
    exitedWithoutPaying: number;
    conversionRate: number;
    dropOffRate: number;
    paywallRoute: string | null;
  };
  peaks: {
    sales: {
      hour: AnalyticsPeakSalesMetric;
      day: AnalyticsPeakSalesMetric;
    };
    traffic: {
      hour: AnalyticsPeakTrafficMetric;
      day: AnalyticsPeakTrafficMetric;
    };
  };
  trends: {
    sales: {
      hourly: AnalyticsSalesTrendPoint[];
      daily: AnalyticsSalesTrendPoint[];
      weekday: AnalyticsSalesTrendPoint[];
    };
    traffic: {
      hourly: AnalyticsTrafficTrendPoint[];
      daily: AnalyticsTrafficTrendPoint[];
      weekday: AnalyticsTrafficTrendPoint[];
    };
  };
  hourlyProfitability?: {
    rows: AnalyticsHourlyProfitabilityPoint[];
    exchangeRate: number;
    adsSource: "meta" | "none";
    dayMode?: "calendar_ist" | "business_1130_ist";
  };
  traffic: {
    totalSessions: number;
    totalPageViews: number;
    overallBounceRate: number;
    avgSessionDurationSec: number;
  };
  routes: AnalyticsRouteMetric[];
  sources: {
    sales: AnalyticsSourceStatus;
    googleAnalytics: AnalyticsSourceStatus;
    clarity: AnalyticsSourceStatus;
    vercelAnalytics: AnalyticsSourceStatus;
    internal: AnalyticsSourceStatus;
  };
  notes: string[];
}

interface RevenueData {
  currency: string;
  totalRevenue: string;
  grossRevenue?: string;
  refundAmount?: string;
  revenueToday: string;
  revenueThisWeek: string;
  revenueThisMonth: string;
  revenueThisYear: string;
  revenueLastMonth: string;
  momGrowth: string;
  revenueByType: { bundle: number; upsell: number; coins: number; report: number };
  upsellAttachment?: {
    bundleBuyerCount: number;
    upsellBuyerCount: number;
    noUpsellBuyers: number;
    upsellAttachRate: number;
    noUpsellRate: number;
    upsellRevenue: number;
    combinationBreakdown: {
      label: string;
      items: string[];
      itemCount: number;
      buyers: number;
      percentOfBundleBuyers: number;
      revenue: number;
    }[];
    itemBreakdown: {
      item: string;
      buyers: number;
      percentOfBundleBuyers: number;
      revenue: number;
    }[];
  };
  bundleBreakdown: {
    "palm-reading": { count: number; revenue: number };
    "palm-birth": { count: number; revenue: number };
    "palm-birth-compat": { count: number; revenue: number };
    "palm-birth-sketch": { count: number; revenue: number };
    "palm-birth-sketch-aura-astro": { count: number; revenue: number };
  };
  arpu: string;
  totalPayments: number;
  successfulPayments: number;
  refundedPayments?: number;
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

interface MetaAdsData {
  configured: boolean;
  error?: string;
  datePreset?: string;
  account?: {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
    ctr: number;
    reach: number;
    frequency: number;
    linkClicks: number;
    leads: number;
    purchases: number;
    addToCart: number;
    initiateCheckout: number;
    pageViews: number;
    costPerLead: number;
    costPerPurchase: number;
    costPerLinkClick: number;
  };
  campaigns?: {
    name: string;
    id: string;
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    ctr: number;
    reach: number;
    leads: number;
    purchases: number;
    linkClicks: number;
    costPerLead: number;
    costPerPurchase: number;
  }[];
  dailyBreakdown?: {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    linkClicks: number;
  }[];
  activeCampaigns?: {
    name: string;
    status: string;
    objective: string;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
  }[];
  activeCampaignCount?: number;
}

const META_IST_TIMEZONE = "Asia/Kolkata";
const META_BUSINESS_BOUNDARY_HOUR = 11;
const META_BUSINESS_BOUNDARY_MINUTE = 30;
const META_MIN_RANGE_START = "2024-01-01";
const ATTRIBUTION_TRACKING_START_DATE = "2026-07-13";
const ANALYTICS_RANGE_STORAGE_KEY = "analytics_date_range_v1";

type CalendarRange = { startDate: string; endDate: string };
type CalendarCell = { isoDate: string; day: number; inCurrentMonth: boolean };
type AnalyticsDateRangeSettings = {
  startDate: string;
  endDate: string;
  dayMode: "calendar_ist" | "business_1130_ist";
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getIstDateTimeParts(date: Date): {
  dayKey: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: META_IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    dayKey: `${year}-${pad2(month)}-${pad2(day)}`,
    year: Number.isFinite(year) ? year : 1970,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getCurrentBusinessDateIso(now: Date = new Date()): string {
  const ist = getIstDateTimeParts(now);
  const isBeforeBoundary =
    ist.hour < META_BUSINESS_BOUNDARY_HOUR ||
    (ist.hour === META_BUSINESS_BOUNDARY_HOUR && ist.minute < META_BUSINESS_BOUNDARY_MINUTE);
  return isBeforeBoundary ? shiftIsoDate(ist.dayKey, -1) : ist.dayKey;
}

function getWeekStartMondayIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const mondayIndex = (d.getUTCDay() + 6) % 7;
  return shiftIsoDate(isoDate, -mondayIndex);
}

function getFirstDayOfMonthIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  return `${year}-${pad2(month)}-01`;
}

function getPreviousMonthFirstIso(monthStartIso: string): string {
  const d = new Date(`${monthStartIso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().split("T")[0];
}

function getFirstDayOfQuarterIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${pad2(quarterStartMonth)}-01`;
}

function getPreviousQuarterFirstIso(quarterStartIso: string): string {
  const d = new Date(`${quarterStartIso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().split("T")[0];
}

function getFirstDayOfYearIso(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  return `${year}-01-01`;
}

function getPreviousYearFirstIso(yearStartIso: string): string {
  const year = Number(yearStartIso.slice(0, 4));
  return `${year - 1}-01-01`;
}

function getPresetCalendarRange(preset: string, now: Date = new Date()): CalendarRange {
  const businessTodayIso = getCurrentBusinessDateIso(now);
  switch (preset) {
    case "today":
      return { startDate: businessTodayIso, endDate: businessTodayIso };
    case "yesterday": {
      const iso = shiftIsoDate(businessTodayIso, -1);
      return { startDate: iso, endDate: iso };
    }
    case "last_3d":
      return { startDate: shiftIsoDate(businessTodayIso, -3), endDate: businessTodayIso };
    case "last_7d":
      return { startDate: shiftIsoDate(businessTodayIso, -7), endDate: businessTodayIso };
    case "last_14d":
      return { startDate: shiftIsoDate(businessTodayIso, -14), endDate: businessTodayIso };
    case "last_30d":
      return { startDate: shiftIsoDate(businessTodayIso, -30), endDate: businessTodayIso };
    case "last_60d":
      return { startDate: shiftIsoDate(businessTodayIso, -60), endDate: businessTodayIso };
    case "last_90d":
      return { startDate: shiftIsoDate(businessTodayIso, -90), endDate: businessTodayIso };
    case "this_week":
      return { startDate: getWeekStartMondayIso(businessTodayIso), endDate: businessTodayIso };
    case "last_week": {
      const thisWeekStartIso = getWeekStartMondayIso(businessTodayIso);
      return {
        startDate: shiftIsoDate(thisWeekStartIso, -7),
        endDate: shiftIsoDate(thisWeekStartIso, -1),
      };
    }
    case "this_month":
      return { startDate: getFirstDayOfMonthIso(businessTodayIso), endDate: businessTodayIso };
    case "last_month": {
      const thisMonthStartIso = getFirstDayOfMonthIso(businessTodayIso);
      return {
        startDate: getPreviousMonthFirstIso(thisMonthStartIso),
        endDate: shiftIsoDate(thisMonthStartIso, -1),
      };
    }
    case "this_quarter":
      return { startDate: getFirstDayOfQuarterIso(businessTodayIso), endDate: businessTodayIso };
    case "last_quarter": {
      const thisQuarterStartIso = getFirstDayOfQuarterIso(businessTodayIso);
      return {
        startDate: getPreviousQuarterFirstIso(thisQuarterStartIso),
        endDate: shiftIsoDate(thisQuarterStartIso, -1),
      };
    }
    case "this_year":
      return { startDate: getFirstDayOfYearIso(businessTodayIso), endDate: businessTodayIso };
    case "last_year": {
      const thisYearStartIso = getFirstDayOfYearIso(businessTodayIso);
      return {
        startDate: getPreviousYearFirstIso(thisYearStartIso),
        endDate: shiftIsoDate(thisYearStartIso, -1),
      };
    }
    case "maximum":
      return { startDate: META_MIN_RANGE_START, endDate: businessTodayIso };
    default:
      return { startDate: shiftIsoDate(businessTodayIso, -7), endDate: businessTodayIso };
  }
}

function getMonthStartUtcDate(isoDate: string): Date {
  const [year, month] = isoDate.split("-").map((v) => Number(v));
  return new Date(Date.UTC(year, month - 1, 1));
}

function shiftMonthStartUtcDate(monthStart: Date, months: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + months, 1));
}

function buildMonthGrid(viewMonthStart: Date): CalendarCell[] {
  const firstDayIso = viewMonthStart.toISOString().split("T")[0];
  const weekdayIndex = (viewMonthStart.getUTCDay() + 6) % 7;
  const gridStartIso = shiftIsoDate(firstDayIso, -weekdayIndex);
  const currentMonth = viewMonthStart.getUTCMonth();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const isoDate = shiftIsoDate(gridStartIso, i);
    const cellDate = new Date(`${isoDate}T00:00:00.000Z`);
    cells.push({
      isoDate,
      day: cellDate.getUTCDate(),
      inCurrentMonth: cellDate.getUTCMonth() === currentMonth,
    });
  }
  return cells;
}

function formatCalendarDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function formatCalendarDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    day: "2-digit",
    month: "short",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function getStoredAnalyticsRange(): AnalyticsDateRangeSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ANALYTICS_RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.startDate === "string" &&
      typeof parsed.endDate === "string" &&
      (parsed.dayMode === "calendar_ist" || parsed.dayMode === "business_1130_ist")
    ) {
      return parsed;
    }
  } catch {
    // ignore corrupt saved date range
  }
  return null;
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

  // Date picker with time and timezone
  const [selectedStartDate, setSelectedStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEndDate, setSelectedEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedStartTime, setSelectedStartTime] = useState<string>("11:30");
  const [selectedEndTime, setSelectedEndTime] = useState<string>("11:30");
  const [selectedTimezone, setSelectedTimezone] = useState<string>("ist");
  const [dateLoading, setDateLoading] = useState(false);
  const [usePayU, setUsePayU] = useState<boolean>(true); // Default to PayU for accurate data

  // Sorting
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Meta Ads
  const [metaAds, setMetaAds] = useState<MetaAdsData | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaDatePreset, setMetaDatePreset] = useState<string>("last_30d");
  const [showMetaCampaigns, setShowMetaCampaigns] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // Analytics tab
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(
    () => getStoredAnalyticsRange()?.startDate || "2026-03-13"
  );
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    () => getStoredAnalyticsRange()?.endDate || new Date().toISOString().split("T")[0]
  );
  const [analyticsDayMode, setAnalyticsDayMode] = useState<"calendar_ist" | "business_1130_ist">(
    () => getStoredAnalyticsRange()?.dayMode || "calendar_ist"
  );
  
  // Profit Sheet state
  const [profitSheetData, setProfitSheetData] = useState<ProfitSheetRow[]>([]);
  const [profitSheetLoading, setProfitSheetLoading] = useState(false);
  const [profitSheetError, setProfitSheetError] = useState<string | null>(null);
  const [profitSheetStartDate, setProfitSheetStartDate] = useState<string>("2026-06-21");
  const [profitSheetEndDate, setProfitSheetEndDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [profitSheetFilter, setProfitSheetFilter] = useState<string>("all");
  const [profitSheetRoasFilter, setProfitSheetRoasFilter] = useState<string>("all");
  const [profitSheetExchangeRate, setProfitSheetExchangeRate] = useState<number>(85);
  const [profitSheetCustomExchangeRate, setProfitSheetCustomExchangeRate] = useState<string>("");
  const [profitSheetSelectedDates, setProfitSheetSelectedDates] = useState<string[]>([]);
  const profitSheetRequestIdRef = useRef(0);

  // Meta Breakdown state
  const [metaBreakdown, setMetaBreakdown] = useState<MetaBreakdownData | null>(null);
  const [metaBreakdownLoading, setMetaBreakdownLoading] = useState(false);
  const [metaBreakdownDatePreset, setMetaBreakdownDatePreset] = useState<string>("last_7d");
  const [metaBreakdownExchangeRate, setMetaBreakdownExchangeRate] = useState<string>("");
  const [metaBreakdownStartDate, setMetaBreakdownStartDate] = useState<string>(
    () => getPresetCalendarRange("last_7d").startDate
  );
  const [metaBreakdownEndDate, setMetaBreakdownEndDate] = useState<string>(
    () => getPresetCalendarRange("last_7d").endDate
  );
  const [metaBreakdownUseCustomDateRange, setMetaBreakdownUseCustomDateRange] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());

  // First-party attribution
  const [attributionData, setAttributionData] = useState<MarketingAttributionData | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);
  const [attributionDatePreset, setAttributionDatePreset] = useState<string>("today");
  const [attributionStartDate, setAttributionStartDate] = useState<string>(
    ATTRIBUTION_TRACKING_START_DATE
  );
  const [attributionEndDate, setAttributionEndDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [attributionUseCustomDateRange, setAttributionUseCustomDateRange] = useState(true);

  // Backfill
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const runBackfill = async () => {
    try {
      setBackfillLoading(true);
      setBackfillResult(null);
      const token = localStorage.getItem("admin_session_token");
      const response = await fetch(`/api/admin/backfill-payments?token=${token}`, {
        method: "POST",
      });
      const result = await response.json();
      if (result.success) {
        setBackfillResult(`Created ${result.summary.created} payment records, skipped ${result.summary.skipped}`);
        // Refresh data after backfill
        fetchData();
      } else {
        setBackfillResult(`Error: ${result.error}`);
      }
    } catch (err: any) {
      setBackfillResult(`Error: ${err.message}`);
    } finally {
      setBackfillLoading(false);
    }
  };

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

      let url: string;
      if (usePayU) {
        url = `/api/admin/revenue-payu?token=${token}&_t=${Date.now()}`;
        url += `&startDate=${selectedStartDate}&endDate=${selectedEndDate}`;
        url += `&startTime=${selectedStartTime}&endTime=${selectedEndTime}`;
        url += `&timezone=${selectedTimezone}`;
      } else {
        url = `/api/admin/revenue?token=${token}&_t=${Date.now()}`;
        if (selectedStartDate) {
          url += `&startDate=${selectedStartDate}&endDate=${selectedEndDate}`;
          url += `&startTime=${selectedStartTime}&endTime=${selectedEndTime}`;
        }
      }
      const response = await fetch(url, { cache: "no-store" });

      if (response.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || "Failed to fetch revenue data");
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err: any) {
      console.error("Revenue fetch error:", err.message);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setDateLoading(false);
    }
  };

  const fetchMetaAds = async (preset?: string, customStart?: string, customEnd?: string) => {
    try {
      setMetaLoading(true);
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;
      
      let url = `/api/admin/meta-ads?token=${token}`;
      
      // Use custom date range if provided
      if (customStart && customEnd) {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      } else {
        const dp = preset || metaDatePreset;
        url += `&datePreset=${dp}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const result = await res.json();
        setMetaAds(result);
      }
    } catch (err) {
      console.error("Meta ads fetch error:", err);
    } finally {
      setMetaLoading(false);
    }
  };

  // Fetch Profit Sheet data
  const fetchProfitSheet = async (customRate?: number, syncLastTwoDays: boolean = false) => {
    const requestId = ++profitSheetRequestIdRef.current;
    try {
      setProfitSheetLoading(true);
      setProfitSheetError(null);
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;
      
      let url = `/api/admin/profit-sheet?token=${token}&startDate=${profitSheetStartDate}&endDate=${profitSheetEndDate}`;
      if (syncLastTwoDays) {
        url += "&sync=last2";
      }
      
      // Use custom exchange rate if provided
      const rateToUse = customRate || (profitSheetCustomExchangeRate ? parseFloat(profitSheetCustomExchangeRate) : undefined);
      if (rateToUse) {
        url += `&exchangeRate=${rateToUse}`;
      }
      
      const res = await fetch(url);
      if (requestId !== profitSheetRequestIdRef.current) return;
      if (res.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch profit sheet" }));
        throw new Error(err.error || "Failed to fetch profit sheet");
      }

      const result = await res.json();
      if (requestId !== profitSheetRequestIdRef.current) return;
      setProfitSheetData(result.rows || []);
      if (result.exchangeRate) {
        setProfitSheetExchangeRate(result.exchangeRate);
        if (!profitSheetCustomExchangeRate) {
          setProfitSheetCustomExchangeRate(result.exchangeRate.toFixed(2));
        }
      }
    } catch (err) {
      if (requestId !== profitSheetRequestIdRef.current) return;
      console.error("Profit sheet fetch error:", err);
      setProfitSheetError(err instanceof Error ? err.message : "Failed to fetch profit sheet");
      setProfitSheetData([]);
    } finally {
      if (requestId === profitSheetRequestIdRef.current) {
        setProfitSheetLoading(false);
      }
    }
  };

  // Fetch Meta Breakdown data
  const fetchMetaBreakdown = async (customRate?: number, startDate?: string, endDate?: string) => {
    try {
      setMetaBreakdownLoading(true);
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;
      
      let url = `/api/admin/meta-ads-breakdown?token=${token}`;

      const hasExplicitCustomDates = typeof startDate === "string" && startDate.length > 0;
      const resolvedStartDate = hasExplicitCustomDates ? startDate : metaBreakdownStartDate;
      const resolvedEndDate = hasExplicitCustomDates ? (endDate || startDate) : metaBreakdownEndDate;
      const shouldUseCustomRange =
        hasExplicitCustomDates ||
        (metaBreakdownUseCustomDateRange && !!resolvedStartDate && !!resolvedEndDate);

      if (shouldUseCustomRange && resolvedStartDate && resolvedEndDate) {
        url += `&startDate=${resolvedStartDate}&endDate=${resolvedEndDate}`;
      } else {
        url += `&datePreset=${metaBreakdownDatePreset}`;
      }
      
      const rateToUse = customRate || (metaBreakdownExchangeRate ? parseFloat(metaBreakdownExchangeRate) : undefined);
      if (rateToUse) {
        url += `&exchangeRate=${rateToUse}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const result = await res.json();
        setMetaBreakdown(result);
        if (result.exchangeRate && !metaBreakdownExchangeRate) {
          setMetaBreakdownExchangeRate(result.exchangeRate.toFixed(2));
        }
      }
    } catch (err) {
      console.error("Meta breakdown fetch error:", err);
    } finally {
      setMetaBreakdownLoading(false);
    }
  };

  const fetchAttribution = async () => {
    try {
      setAttributionLoading(true);
      setAttributionError(null);
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;

      const presetRange = getPresetCalendarRange(attributionDatePreset);
      const startDate = attributionUseCustomDateRange ? attributionStartDate : presetRange.startDate;
      const endDate = attributionUseCustomDateRange ? attributionEndDate : presetRange.endDate;
      const res = await fetch(
        `/api/admin/marketing-attribution?token=${encodeURIComponent(token)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { cache: "no-store" }
      );
      if (res.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch attribution" }));
        throw new Error(err.error || "Failed to fetch attribution");
      }
      const result = await res.json();
      setAttributionData(result);
    } catch (err) {
      console.error("Attribution fetch error:", err);
      setAttributionError(err instanceof Error ? err.message : "Failed to fetch attribution");
      setAttributionData(null);
    } finally {
      setAttributionLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      const token = localStorage.getItem("admin_session_token");
      if (!token) return;

      const url = `/api/admin/analytics?token=${encodeURIComponent(token)}&startDate=${encodeURIComponent(
        analyticsStartDate
      )}&endDate=${encodeURIComponent(analyticsEndDate)}&dayMode=${encodeURIComponent(analyticsDayMode)}`;

      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        localStorage.removeItem("admin_session_token");
        localStorage.removeItem("admin_session_expiry");
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch analytics" }));
        throw new Error(err.error || "Failed to fetch analytics");
      }
      const result = await res.json();
      setAnalyticsData(result);
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setAnalyticsError(err instanceof Error ? err.message : "Failed to fetch analytics");
      setAnalyticsData(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Toggle campaign expansion
  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  // Toggle adset expansion
  const toggleAdset = (adsetId: string) => {
    setExpandedAdsets(prev => {
      const next = new Set(prev);
      if (next.has(adsetId)) {
        next.delete(adsetId);
      } else {
        next.add(adsetId);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchData();
    fetchMetaAds();
  }, [router, selectedStartDate, selectedEndDate, selectedStartTime, selectedEndTime, selectedTimezone, usePayU]);

  useEffect(() => {
    fetchMetaAds(metaDatePreset);
  }, [metaDatePreset]);

  // Fetch profit sheet when tab changes or date range changes
  useEffect(() => {
    if (activeTab === "profit-sheet") {
      fetchProfitSheet();
    }
  }, [activeTab, profitSheetStartDate, profitSheetEndDate]);

  // Fetch meta breakdown when tab changes or date preset changes
  useEffect(() => {
    if (activeTab === "meta-details") {
      fetchMetaBreakdown();
    }
  }, [activeTab, metaBreakdownDatePreset]);

  useEffect(() => {
    if (activeTab === "attribution") {
      fetchAttribution();
    }
  }, [activeTab, attributionDatePreset, attributionStartDate, attributionEndDate, attributionUseCustomDateRange]);

  useEffect(() => {
    if (activeTab === "analytics") {
      fetchAnalytics();
    }
  }, [activeTab, analyticsStartDate, analyticsEndDate, analyticsDayMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      ANALYTICS_RANGE_STORAGE_KEY,
      JSON.stringify({
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
        dayMode: analyticsDayMode,
      })
    );
  }, [analyticsStartDate, analyticsEndDate, analyticsDayMode]);

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
  const bb = data.bundleBreakdown || { "palm-reading": { count: 0, revenue: 0 }, "palm-birth": { count: 0, revenue: 0 }, "palm-birth-compat": { count: 0, revenue: 0 }, "palm-birth-sketch": { count: 0, revenue: 0 }, "palm-birth-sketch-aura-astro": { count: 0, revenue: 0 } };
  bb["palm-birth-sketch-aura-astro"] ||= { count: 0, revenue: 0 };
  const totalBundleRevenue = bb["palm-reading"].revenue + bb["palm-birth"].revenue + bb["palm-birth-compat"].revenue + bb["palm-birth-sketch"].revenue + bb["palm-birth-sketch-aura-astro"].revenue;
  const totalBundleCount = bb["palm-reading"].count + bb["palm-birth"].count + bb["palm-birth-compat"].count + bb["palm-birth-sketch"].count + bb["palm-birth-sketch-aura-astro"].count;

  // Revenue by type
  const rbt = data.revenueByType || { bundle: 0, upsell: 0, coins: 0, report: 0 };
  const totalTypeRevenue = rbt.bundle + rbt.upsell + rbt.coins + rbt.report;

  return (
    <div className="min-h-screen bg-[#0A0E1A] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#1A1F2E] to-transparent px-4 pt-12 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
                onClick={() => router.push("/admin")}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/70 text-sm"
              >
                ←
              </button>
            <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
            <div className="flex items-center gap-2">
              {data && data.totalPayments === 0 && data.uniquePayingUsers > 0 && (
                <button
                  onClick={runBackfill}
                  disabled={backfillLoading}
                  className="px-3 py-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors text-yellow-400 text-sm flex items-center gap-2"
                >
                  {backfillLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Recover Payments
                </button>
              )}
              <button
                onClick={() => {
                  if (activeTab === "dashboard") fetchData();
                  else if (activeTab === "profit-sheet") fetchProfitSheet(undefined, true);
                  else if (activeTab === "meta-details") fetchMetaBreakdown();
                  else if (activeTab === "attribution") fetchAttribution();
                  else if (activeTab === "analytics") fetchAnalytics();
                }}
                disabled={refreshing || profitSheetLoading || metaLoading || metaBreakdownLoading || attributionLoading || analyticsLoading}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-white ${(refreshing || profitSheetLoading || metaLoading || metaBreakdownLoading || attributionLoading || analyticsLoading) ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "dashboard"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("profit-sheet")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "profit-sheet"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Profit Sheet
            </button>
            <button
              onClick={() => setActiveTab("meta-details")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "meta-details"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Facebook className="w-4 h-4" />
              Meta Details
            </button>
            <button
              onClick={() => setActiveTab("attribution")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "attribution"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Target className="w-4 h-4" />
              Attribution
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "analytics"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Activity className="w-4 h-4" />
              Analytics
            </button>
          </div>
          
          {backfillResult && (
            <div className={`mt-2 px-3 py-2 rounded-lg text-sm ${backfillResult.startsWith("Error") ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
              {backfillResult}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Dashboard Tab Content */}
        {activeTab === "dashboard" && (
          <>
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
                  <option value="palm-birth-compat">Palm + Birth + Compatibility + Future Partner</option>
                  <option value="palm-birth-sketch">Palm + Birth + Soulmate Sketch + Future Partner</option>
                  <option value="palm-birth-sketch-aura-astro">Cosmic Bundle</option>
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
                  <option value="refunded">Refunded</option>
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
            <IndianRupee className="w-4 h-4" /> Primary KPIs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="Total Revenue"
              value={formatCurrency(data.totalRevenue)}
              subtitle="All time"
              icon={<IndianRupee className="w-4 h-4" />}
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

        {/* Date Range Selector with Time & Timezone */}
        <section className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white/70 text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Date Range & Data Source
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUsePayU(!usePayU)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${usePayU ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/60'}`}
              >
                {usePayU ? '✓ PayU (Live)' : '✓ Supabase'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Start Date & Time */}
            <div>
              <label className="text-white/50 text-xs mb-2 block">Start Date</label>
              <input
                type="date"
                value={selectedStartDate}
                min="2026-03-13"
                onChange={(e) => setSelectedStartDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs mb-2 block">Start Time</label>
              <input
                type="time"
                value={selectedStartTime}
                onChange={(e) => setSelectedStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
            
            {/* End Date & Time */}
            <div>
              <label className="text-white/50 text-xs mb-2 block">End Date</label>
              <input
                type="date"
                value={selectedEndDate}
                min="2026-03-13"
                onChange={(e) => setSelectedEndDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs mb-2 block">End Time</label>
              <input
                type="time"
                value={selectedEndTime}
                onChange={(e) => setSelectedEndTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
          </div>
          
          {/* Timezone & Quick Presets */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs">Timezone:</label>
              <select
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="costa_rica">Costa Rica (UTC-6)</option>
                <option value="ist">India (IST UTC+5:30)</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  const today = new Date().toISOString().split("T")[0];
                  setSelectedStartDate(today);
                  setSelectedEndDate(today);
                  setSelectedStartTime("00:00");
                  setSelectedEndTime("23:59");
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-white/60 bg-white/10 hover:bg-white/20 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  setSelectedStartDate(yesterday.toISOString().split("T")[0]);
                  setSelectedEndDate(yesterday.toISOString().split("T")[0]);
                  setSelectedStartTime("00:00");
                  setSelectedEndTime("23:59");
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-white/60 bg-white/10 hover:bg-white/20 transition-colors"
              >
                Yesterday
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const weekAgo = new Date(today);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  setSelectedStartDate(weekAgo.toISOString().split("T")[0]);
                  setSelectedEndDate(today.toISOString().split("T")[0]);
                  setSelectedStartTime("00:00");
                  setSelectedEndTime("23:59");
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-white/60 bg-white/10 hover:bg-white/20 transition-colors"
              >
                Last 7 Days
              </button>
              <button
                onClick={() => {
                  setSelectedStartDate("2026-03-13");
                  setSelectedEndDate(new Date().toISOString().split("T")[0]);
                  setSelectedStartTime("00:00");
                  setSelectedEndTime("23:59");
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-white/60 bg-white/10 hover:bg-white/20 transition-colors"
              >
                All Time
              </button>
            </div>
          </div>
          
          {/* Info about timezone */}
          {selectedTimezone === "costa_rica" && (
            <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-400 text-xs">
                📍 Times are in Costa Rica timezone (UTC-6). IST is 11.5 hours ahead.
                <br />
                Example: 11:30 AM Costa Rica = 11:00 PM IST (same day) → 12:00 AM IST (next day)
              </p>
            </div>
          )}
        </section>

        {/* Revenue by Period */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white/70 text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Revenue Summary
            </h2>
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
                  <span className="text-white/50 text-xs">Selected Range</span>
                  <Tooltip content="Revenue for the selected date range." />
                </div>
                <span className="text-green-400"><IndianRupee className="w-4 h-4" /></span>
              </div>
              <p className="text-xl font-bold text-green-400">{formatCurrency(selectedDateRevenue)}</p>
              <p className="text-white/40 text-xs mt-1">{selectedDatePaymentCount} payments</p>
              <p className="text-white/30 text-xs mt-1">{selectedStartDate} to {selectedEndDate}</p>
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
                  {selectedDatePaymentCount} transaction{selectedDatePaymentCount !== 1 ? "s" : ""} from {selectedStartDate} to {selectedEndDate}
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
          {!dateLoading && selectedDateTransactions.length === 0 && selectedStartDate && (
            <div className="mt-4 bg-[#1A2235] rounded-xl p-4 border border-white/10 text-center">
              <p className="text-white/40 text-sm">No transactions from {selectedStartDate} to {selectedEndDate}</p>
            </div>
          )}
        </section>
        
        {/* Meta / Facebook Ads */}
        <MetaAdsSection
          metaAds={metaAds}
          metaLoading={metaLoading}
          metaDatePreset={metaDatePreset}
          setMetaDatePreset={setMetaDatePreset}
          showMetaCampaigns={showMetaCampaigns}
          setShowMetaCampaigns={setShowMetaCampaigns}
          formatCurrency={formatCurrency}
          onRefresh={() => fetchMetaAds()}
          onCustomDateRefresh={(startDate, endDate) => fetchMetaAds(undefined, startDate, endDate)}
        />

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
                <PlanBar label="Palm + Birth + Compatibility + Future Partner" value={bb["palm-birth-compat"].revenue} total={totalBundleRevenue} color="bg-green-500" count={bb["palm-birth-compat"].count} />
                <PlanBar label="Palm + Birth + Soulmate Sketch + Future Partner" value={bb["palm-birth-sketch"].revenue} total={totalBundleRevenue} color="bg-pink-500" count={bb["palm-birth-sketch"].count} />
                <PlanBar label="Cosmic Bundle" value={bb["palm-birth-sketch-aura-astro"].revenue} total={totalBundleRevenue} color="bg-cyan-500" count={bb["palm-birth-sketch-aura-astro"].count} />
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
                      { value: bb["palm-birth-sketch"].count, color: "#EC4899" },
                      { value: bb["palm-birth-sketch-aura-astro"].count, color: "#06B6D4" },
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
                    <span className="text-white/70 text-sm">Palm + Birth + Compatibility + Future Partner: {bb["palm-birth-compat"].count}</span>
                  </div>
                )}
                {bb["palm-birth-sketch"].count > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-pink-500" />
                    <span className="text-white/70 text-sm">Palm + Birth + Soulmate Sketch + Future Partner: {bb["palm-birth-sketch"].count}</span>
                  </div>
                )}
                {bb["palm-birth-sketch-aura-astro"].count > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-500" />
                    <span className="text-white/70 text-sm">Cosmic Bundle: {bb["palm-birth-sketch-aura-astro"].count}</span>
                  </div>
                )}
                {totalBundleCount === 0 && (
                  <span className="text-white/40 text-sm">No sales yet</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Upsell Attachment */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" /> Upsell Attachment
          </h2>
          <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs">Bundle Buyers</p>
                <p className="text-white text-xl font-bold">{data.upsellAttachment?.bundleBuyerCount || totalBundleCount}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs">Upsell Buyers</p>
                <p className="text-green-400 text-xl font-bold">{data.upsellAttachment?.upsellBuyerCount || 0}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs">Attach Rate</p>
                <p className="text-primary text-xl font-bold">{(data.upsellAttachment?.upsellAttachRate || 0).toFixed(2)}%</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs">Upsell Value</p>
                <p className="text-emerald-400 text-xl font-bold">{formatCurrency(data.upsellAttachment?.upsellRevenue || 0)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h3 className="text-white/60 text-xs mb-3">Exact Upsell Combinations</h3>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="text-left text-white/50 text-xs font-medium px-3 py-2">Combination</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">Users</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">%</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.upsellAttachment?.combinationBreakdown || []).map((row) => (
                        <tr key={row.label} className="border-t border-white/5">
                          <td className="text-white/80 text-sm px-3 py-2">{row.label}</td>
                          <td className="text-white text-sm px-3 py-2 text-right">{row.buyers}</td>
                          <td className="text-primary text-sm px-3 py-2 text-right">{row.percentOfBundleBuyers.toFixed(2)}%</td>
                          <td className="text-green-400 text-sm px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                        </tr>
                      ))}
                      {(data.upsellAttachment?.combinationBreakdown || []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-white/40 text-sm px-3 py-4 text-center">No upsells bought by bundle buyers in this range.</td>
                        </tr>
                      )}
                      {(data.upsellAttachment?.noUpsellBuyers || 0) > 0 && (
                        <tr className="border-t border-white/10 bg-white/[0.03]">
                          <td className="text-white/60 text-sm px-3 py-2">No upsell</td>
                          <td className="text-white/70 text-sm px-3 py-2 text-right">{data.upsellAttachment?.noUpsellBuyers || 0}</td>
                          <td className="text-white/50 text-sm px-3 py-2 text-right">{(data.upsellAttachment?.noUpsellRate || 0).toFixed(2)}%</td>
                          <td className="text-white/40 text-sm px-3 py-2 text-right">{formatCurrency(0)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-white/60 text-xs mb-3">Individual Upsell Reach</h3>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="text-left text-white/50 text-xs font-medium px-3 py-2">Upsell</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">Users</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">%</th>
                        <th className="text-right text-white/50 text-xs font-medium px-3 py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.upsellAttachment?.itemBreakdown || []).map((row) => (
                        <tr key={row.item} className="border-t border-white/5">
                          <td className="text-white/80 text-sm px-3 py-2">{row.item}</td>
                          <td className="text-white text-sm px-3 py-2 text-right">{row.buyers}</td>
                          <td className="text-primary text-sm px-3 py-2 text-right">{row.percentOfBundleBuyers.toFixed(2)}%</td>
                          <td className="text-green-400 text-sm px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                        </tr>
                      ))}
                      {(data.upsellAttachment?.itemBreakdown || []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-white/40 text-sm px-3 py-4 text-center">No individual upsell data in this range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-white/35 text-xs mt-2">
                  Percentages use bundle buyers as the denominator. A user who bought two upsells appears once in each individual upsell row and once in the exact-combination table.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Transaction Activity */}
        <section>
          <h2 className="text-white/70 text-sm font-medium mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Transaction Activity
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPICard
              title="Successful"
              value={(data.successfulPayments || 0).toString()}
              icon={<CheckCircle className="w-4 h-4" />}
              color="text-green-400"
              tooltip="Total number of successful (paid) payment transactions."
            />
            <KPICard
              title="Refunded"
              value={(data.refundedPayments || 0).toString()}
              icon={<ArrowDownRight className="w-4 h-4" />}
              color="text-orange-400"
              tooltip="Payments that were refunded/chargebacked."
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
          </>
        )}

        {/* Profit Sheet Tab Content */}
        {activeTab === "profit-sheet" && (
          <ProfitSheetTab
            data={profitSheetData}
            loading={profitSheetLoading}
            error={profitSheetError}
            startDate={profitSheetStartDate}
            endDate={profitSheetEndDate}
            setStartDate={setProfitSheetStartDate}
            setEndDate={setProfitSheetEndDate}
            periodFilter={profitSheetFilter}
            setPeriodFilter={setProfitSheetFilter}
            roasFilter={profitSheetRoasFilter}
            setRoasFilter={setProfitSheetRoasFilter}
            selectedDates={profitSheetSelectedDates}
            setSelectedDates={setProfitSheetSelectedDates}
            exchangeRate={profitSheetCustomExchangeRate}
            setExchangeRate={setProfitSheetCustomExchangeRate}
            onRefresh={() => fetchProfitSheet(undefined, true)}
            onRefreshWithRate={(rate) => fetchProfitSheet(rate, true)}
          />
        )}

        {/* Meta Details Tab Content */}
        {activeTab === "meta-details" && (
          <MetaBreakdownTab
            data={metaBreakdown}
            loading={metaBreakdownLoading}
            datePreset={metaBreakdownDatePreset}
            setDatePreset={setMetaBreakdownDatePreset}
            startDate={metaBreakdownStartDate}
            setStartDate={setMetaBreakdownStartDate}
            endDate={metaBreakdownEndDate}
            setEndDate={setMetaBreakdownEndDate}
            useCustomDateRange={metaBreakdownUseCustomDateRange}
            setUseCustomDateRange={setMetaBreakdownUseCustomDateRange}
            exchangeRate={metaBreakdownExchangeRate}
            setExchangeRate={setMetaBreakdownExchangeRate}
            expandedCampaigns={expandedCampaigns}
            expandedAdsets={expandedAdsets}
            toggleCampaign={toggleCampaign}
            toggleAdset={toggleAdset}
            onRefresh={() => fetchMetaBreakdown()}
            onRefreshWithRate={(rate) => fetchMetaBreakdown(rate)}
            onCustomDateRefresh={(start, end) => fetchMetaBreakdown(undefined, start, end)}
          />
        )}

        {activeTab === "attribution" && (
          <AttributionTab
            data={attributionData}
            loading={attributionLoading}
            error={attributionError}
            datePreset={attributionDatePreset}
            setDatePreset={setAttributionDatePreset}
            startDate={attributionStartDate}
            setStartDate={setAttributionStartDate}
            endDate={attributionEndDate}
            setEndDate={setAttributionEndDate}
            useCustomDateRange={attributionUseCustomDateRange}
            setUseCustomDateRange={setAttributionUseCustomDateRange}
            onRefresh={fetchAttribution}
          />
        )}

        {activeTab === "analytics" && (
          <AnalyticsTab
            data={analyticsData}
            loading={analyticsLoading}
            error={analyticsError}
            startDate={analyticsStartDate}
            endDate={analyticsEndDate}
            setStartDate={setAnalyticsStartDate}
            setEndDate={setAnalyticsEndDate}
            dayMode={analyticsDayMode}
            setDayMode={setAnalyticsDayMode}
            onRefresh={fetchAnalytics}
          />
        )}
      </div>
    </div>
  );
}

// Profit Sheet Tab Component
function ProfitSheetTab({
  data,
  loading,
  error,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  periodFilter,
  setPeriodFilter,
  roasFilter,
  setRoasFilter,
  selectedDates,
  setSelectedDates,
  exchangeRate,
  setExchangeRate,
  onRefresh,
  onRefreshWithRate,
}: {
  data: ProfitSheetRow[];
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  periodFilter: string;
  setPeriodFilter: (v: string) => void;
  roasFilter: string;
  setRoasFilter: (v: string) => void;
  selectedDates: string[];
  setSelectedDates: (dates: string[]) => void;
  exchangeRate: string;
  setExchangeRate: (v: string) => void;
  onRefresh: () => void;
  onRefreshWithRate: (rate: number) => void;
}) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const profitMinRangeStart = "2026-03-13";
  const [pickerStartDate, setPickerStartDate] = useState<string>(startDate);
  const [pickerEndDate, setPickerEndDate] = useState<string>(endDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const focusDate = endDate || startDate || getCurrentBusinessDateIso();
    return getMonthStartUtcDate(focusDate);
  });
  const [isSpecificDaysOpen, setIsSpecificDaysOpen] = useState(false);
  const specificDaysDropdownRef = useRef<HTMLDivElement | null>(null);
  const [specificDaysMonthStart, setSpecificDaysMonthStart] = useState<Date>(() => {
    const focusDate = selectedDates[selectedDates.length - 1] || endDate || startDate || getCurrentBusinessDateIso();
    return getMonthStartUtcDate(focusDate);
  });

  useEffect(() => {
    setPickerStartDate(startDate);
    setPickerEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (calendarDropdownRef.current && target && !calendarDropdownRef.current.contains(target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!isSpecificDaysOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        specificDaysDropdownRef.current &&
        target &&
        !specificDaysDropdownRef.current.contains(target)
      ) {
        setIsSpecificDaysOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSpecificDaysOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSpecificDaysOpen]);

  const maxSelectableBusinessDate = getCurrentBusinessDateIso();
  const maxMonthStart = getMonthStartUtcDate(maxSelectableBusinessDate);
  const secondCalendarMonthStart = useMemo(
    () => shiftMonthStartUtcDate(calendarMonthStart, 1),
    [calendarMonthStart]
  );
  const primaryCalendarCells = useMemo(() => buildMonthGrid(calendarMonthStart), [calendarMonthStart]);
  const secondaryCalendarCells = useMemo(
    () => buildMonthGrid(secondCalendarMonthStart),
    [secondCalendarMonthStart]
  );
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const specificSecondCalendarMonthStart = useMemo(
    () => shiftMonthStartUtcDate(specificDaysMonthStart, 1),
    [specificDaysMonthStart]
  );
  const specificPrimaryCalendarCells = useMemo(
    () => buildMonthGrid(specificDaysMonthStart),
    [specificDaysMonthStart]
  );
  const specificSecondaryCalendarCells = useMemo(
    () => buildMonthGrid(specificSecondCalendarMonthStart),
    [specificSecondCalendarMonthStart]
  );
  const primaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(calendarMonthStart);
  const secondaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(secondCalendarMonthStart);
  const specificPrimaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(specificDaysMonthStart);
  const specificSecondaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(specificSecondCalendarMonthStart);

  const clampToAllowedDate = (isoDate: string): string => {
    if (isoDate < profitMinRangeStart) return profitMinRangeStart;
    if (isoDate > maxSelectableBusinessDate) return maxSelectableBusinessDate;
    return isoDate;
  };

  const handleCalendarDateSelect = (isoDate: string) => {
    if (isoDate < profitMinRangeStart || isoDate > maxSelectableBusinessDate) {
      return;
    }
    if (!pickerStartDate || (pickerStartDate && pickerEndDate)) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    if (isoDate < pickerStartDate) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    setPickerEndDate(isoDate);
  };

  const applySpecificDateSelection = (dates: string[]) => {
    const normalizedDates = Array.from(
      new Set(
        dates
          .map((date) => clampToAllowedDate(date))
          .filter((date) => date >= profitMinRangeStart && date <= maxSelectableBusinessDate)
      )
    ).sort();

    setSelectedDates(normalizedDates);
    if (normalizedDates.length === 0) {
      return;
    }

    const firstDate = normalizedDates[0];
    const lastDate = normalizedDates[normalizedDates.length - 1];
    setStartDate(firstDate);
    setEndDate(lastDate);
    setPickerStartDate(firstDate);
    setPickerEndDate(lastDate);
    setCalendarMonthStart(getMonthStartUtcDate(lastDate));
  };

  const toggleSpecificDate = (isoDate: string) => {
    if (isoDate < profitMinRangeStart || isoDate > maxSelectableBusinessDate) {
      return;
    }

    const nextDates = selectedDateSet.has(isoDate)
      ? selectedDates.filter((date) => date !== isoDate)
      : [...selectedDates, isoDate];
    applySpecificDateSelection(nextDates);
  };

  const clearSpecificDates = () => {
    setSelectedDates([]);
  };

  const applyCustomRange = () => {
    if (!pickerStartDate) return;
    const normalizedStart = clampToAllowedDate(pickerStartDate);
    const normalizedEnd = clampToAllowedDate(pickerEndDate || pickerStartDate);
    const finalStartDate = normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd;
    const finalEndDate = normalizedStart <= normalizedEnd ? normalizedEnd : normalizedStart;
    setStartDate(finalStartDate);
    setEndDate(finalEndDate);
    setSelectedDates([]);
    setIsCalendarOpen(false);
  };

  const selectedRangeLabel = pickerStartDate
    ? `${formatCalendarDateLabel(pickerStartDate)}${
        pickerEndDate ? ` → ${formatCalendarDateLabel(pickerEndDate)}` : ""
      }`
    : "No date selected";

  const activeRangeStart = startDate || pickerStartDate;
  const activeRangeEnd = endDate || pickerEndDate || activeRangeStart;
  const activeRangeButtonLabel =
    activeRangeStart && activeRangeEnd
      ? activeRangeStart === activeRangeEnd
        ? formatCalendarDateShort(activeRangeStart)
        : `${formatCalendarDateShort(activeRangeStart)} - ${formatCalendarDateShort(activeRangeEnd)}`
      : "Select Range";

  const applyPeriodRange = (period: string) => {
    let periodRange: CalendarRange;
    if (period === "last7") periodRange = getPresetCalendarRange("last_7d");
    else if (period === "last14") periodRange = getPresetCalendarRange("last_14d");
    else if (period === "last30") periodRange = getPresetCalendarRange("last_30d");
    else periodRange = { startDate: profitMinRangeStart, endDate: maxSelectableBusinessDate };

    setPeriodFilter(period);
    setStartDate(periodRange.startDate);
    setEndDate(periodRange.endDate);
    setPickerStartDate(periodRange.startDate);
    setPickerEndDate(periodRange.endDate);
    setCalendarMonthStart(getMonthStartUtcDate(periodRange.endDate));
    setSelectedDates([]);
    setIsCalendarOpen(false);
  };

  const renderCalendarGrid = (cells: CalendarCell[]) => (
    <>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-white/50 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <div key={weekday} className="text-center py-1">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isDisabled = cell.isoDate < profitMinRangeStart || cell.isoDate > maxSelectableBusinessDate;
          const isStart = pickerStartDate === cell.isoDate;
          const isEnd = pickerEndDate === cell.isoDate;
          const isInRange =
            !!pickerStartDate &&
            !!pickerEndDate &&
            cell.isoDate >= pickerStartDate &&
            cell.isoDate <= pickerEndDate;
          return (
            <button
              key={cell.isoDate}
              onClick={() => handleCalendarDateSelect(cell.isoDate)}
              disabled={isDisabled}
              className={`h-9 rounded-md text-sm transition-colors ${
                isStart || isEnd
                  ? "bg-primary text-white"
                  : isInRange
                  ? "bg-primary/25 text-white"
                  : cell.inCurrentMonth
                  ? "bg-white/5 text-white hover:bg-white/15"
                  : "bg-white/[0.02] text-white/45 hover:bg-white/10"
              } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
              title={formatCalendarDateLabel(cell.isoDate)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </>
  );

  const renderSpecificDaysCalendarGrid = (cells: CalendarCell[]) => (
    <>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-white/50 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <div key={weekday} className="text-center py-1">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isDisabled = cell.isoDate < profitMinRangeStart || cell.isoDate > maxSelectableBusinessDate;
          const isSelected = selectedDateSet.has(cell.isoDate);
          return (
            <button
              key={cell.isoDate}
              onClick={() => toggleSpecificDate(cell.isoDate)}
              disabled={isDisabled}
              className={`h-9 rounded-md text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-white"
                  : cell.inCurrentMonth
                  ? "bg-white/5 text-white hover:bg-white/15"
                  : "bg-white/[0.02] text-white/45 hover:bg-white/10"
              } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
              title={formatCalendarDateLabel(cell.isoDate)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </>
  );

  // Filter data based on filters
  let filteredData = selectedDates.length > 0
    ? data.filter((row) => selectedDateSet.has(row.date))
    : [...data];

  // ROAS filter
  if (roasFilter === "positive") {
    filteredData = filteredData.filter(row => row.roas > 1);
  } else if (roasFilter === "negative") {
    filteredData = filteredData.filter(row => row.roas > 0 && row.roas <= 1);
  } else if (roasFilter === "noads") {
    filteredData = filteredData.filter(row => row.adsCostINR === 0);
  }

  // Calculate totals
  const totals = filteredData.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      grossRevenue: acc.grossRevenue + (row.grossRevenue ?? row.revenue),
      refundAmount: acc.refundAmount + (row.refundAmount ?? 0),
      gst: acc.gst + row.gst,
      adsCostUSD: acc.adsCostUSD + row.adsCostUSD,
      adsCostINR: acc.adsCostINR + row.adsCostINR,
      netRevenue: acc.netRevenue + row.netRevenue,
      bundleRevenue: acc.bundleRevenue + (row.bundleRevenue ?? 0),
      transactionCount: acc.transactionCount + row.transactionCount,
      bundlePurchases: acc.bundlePurchases + row.bundlePurchases,
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
    }
  );
  const overallRoas = totals.adsCostINR > 0 ? totals.bundleRevenue / totals.adsCostINR : 0;
  const overallProfitPercent = totals.revenue > 0 ? (totals.netRevenue / totals.revenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap items-end gap-4">
          <div ref={calendarDropdownRef} className="relative">
            <label className="text-white/50 text-xs mb-1 block">Custom Range</label>
            <button
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="px-3 py-2 rounded-lg text-sm border bg-white/5 border-white/10 text-white/70 hover:bg-white/10 transition-colors"
            >
              {activeRangeButtonLabel}
            </button>
            {isCalendarOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[92vw] sm:w-[680px] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] shadow-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/80 text-sm font-medium">Custom Range</p>
                  <button
                    onClick={() => setIsCalendarOpen(false)}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Close custom range picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() =>
                      setCalendarMonthStart((prev) => shiftMonthStartUtcDate(prev, -1))
                    }
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-white text-sm font-medium">Select Date Range</p>
                  <button
                    onClick={() =>
                      setCalendarMonthStart((prev) => shiftMonthStartUtcDate(prev, 1))
                    }
                    disabled={secondCalendarMonthStart.getTime() >= maxMonthStart.getTime()}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-white/75 text-sm font-medium mb-2">{primaryMonthLabel}</p>
                    {renderCalendarGrid(primaryCalendarCells)}
                  </div>
                  <div>
                    <p className="text-white/75 text-sm font-medium mb-2">{secondaryMonthLabel}</p>
                    {renderCalendarGrid(secondaryCalendarCells)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-white/50 text-xs mb-1 block">Start Date (type)</label>
                    <input
                      type="date"
                      value={pickerStartDate}
                      min={profitMinRangeStart}
                      max={maxSelectableBusinessDate}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          setPickerStartDate("");
                          setPickerEndDate("");
                          return;
                        }
                        const nextStart = clampToAllowedDate(raw);
                        setPickerStartDate(nextStart);
                        if (pickerEndDate && pickerEndDate < nextStart) {
                          setPickerEndDate("");
                        }
                        setCalendarMonthStart(getMonthStartUtcDate(nextStart));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs mb-1 block">End Date (type)</label>
                    <input
                      type="date"
                      value={pickerEndDate}
                      min={profitMinRangeStart}
                      max={maxSelectableBusinessDate}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          setPickerEndDate("");
                          return;
                        }
                        const nextEnd = clampToAllowedDate(raw);
                        setPickerEndDate(nextEnd);
                        if (!pickerStartDate) {
                          setPickerStartDate(nextEnd);
                        }
                        setCalendarMonthStart(getMonthStartUtcDate(nextEnd));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-white/60">
                    Selected: <span className="text-white/90">{selectedRangeLabel}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPickerStartDate(startDate);
                        setPickerEndDate(endDate);
                      }}
                      className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={applyCustomRange}
                      disabled={!pickerStartDate}
                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors disabled:opacity-50"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              </div>
	            )}
	          </div>
	          <div ref={specificDaysDropdownRef} className="relative">
	            <label className="text-white/50 text-xs mb-1 block">Specific Days</label>
	            <button
	              onClick={() => {
	                setSpecificDaysMonthStart(
	                  getMonthStartUtcDate(
	                    selectedDates[selectedDates.length - 1] || endDate || startDate || getCurrentBusinessDateIso()
	                  )
	                );
	                setIsSpecificDaysOpen((prev) => !prev);
	              }}
	              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
	                selectedDates.length > 0
	                  ? "bg-primary/15 border-primary/40 text-primary"
	                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
	              }`}
	            >
	              {selectedDates.length > 0 ? `${selectedDates.length} days selected` : "Pick Days"}
	            </button>
	            {isSpecificDaysOpen && (
	              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[92vw] sm:w-[680px] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] shadow-2xl p-4">
	                <div className="flex items-center justify-between mb-3">
	                  <p className="text-white/80 text-sm font-medium">Specific Days</p>
	                  <button
	                    onClick={() => setIsSpecificDaysOpen(false)}
	                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
	                    aria-label="Close specific days picker"
	                  >
	                    <X className="w-4 h-4" />
	                  </button>
	                </div>
	                <div className="flex items-center justify-between mb-3">
	                  <button
	                    onClick={() =>
	                      setSpecificDaysMonthStart((prev) => shiftMonthStartUtcDate(prev, -1))
	                    }
	                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
	                    aria-label="Previous month"
	                  >
	                    <ChevronLeft className="w-4 h-4" />
	                  </button>
	                  <p className="text-white text-sm font-medium">Select Individual Dates</p>
	                  <button
	                    onClick={() =>
	                      setSpecificDaysMonthStart((prev) => shiftMonthStartUtcDate(prev, 1))
	                    }
	                    disabled={specificSecondCalendarMonthStart.getTime() >= maxMonthStart.getTime()}
	                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
	                    aria-label="Next month"
	                  >
	                    <ChevronRight className="w-4 h-4" />
	                  </button>
	                </div>
	                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
	                  <div>
	                    <p className="text-white/75 text-sm font-medium mb-2">{specificPrimaryMonthLabel}</p>
	                    {renderSpecificDaysCalendarGrid(specificPrimaryCalendarCells)}
	                  </div>
	                  <div>
	                    <p className="text-white/75 text-sm font-medium mb-2">{specificSecondaryMonthLabel}</p>
	                    {renderSpecificDaysCalendarGrid(specificSecondaryCalendarCells)}
	                  </div>
	                </div>
	                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
	                  <div className="min-w-0 flex-1">
	                    <p className="text-xs text-white/60 mb-2">
	                      Selected:{" "}
	                      <span className="text-white/90">
	                        {selectedDates.length > 0 ? `${selectedDates.length} day${selectedDates.length === 1 ? "" : "s"}` : "No dates selected"}
	                      </span>
	                    </p>
	                    {selectedDates.length > 0 && (
	                      <div className="flex flex-wrap gap-1.5">
	                        {selectedDates.map((date) => (
	                          <button
	                            key={date}
	                            onClick={() => toggleSpecificDate(date)}
	                            className="rounded-full bg-primary/15 px-2 py-1 text-xs text-primary hover:bg-primary/25 transition-colors"
	                            title="Click to remove"
	                          >
	                            {formatCalendarDateShort(date)}
	                          </button>
	                        ))}
	                      </div>
	                    )}
	                  </div>
	                  <div className="flex items-center gap-2">
	                    <button
	                      onClick={clearSpecificDates}
	                      disabled={selectedDates.length === 0}
	                      className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors disabled:opacity-40"
	                    >
	                      Clear
	                    </button>
	                    <button
	                      onClick={() => setIsSpecificDaysOpen(false)}
	                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors"
	                    >
	                      Done
	                    </button>
	                  </div>
	                </div>
	              </div>
	            )}
	          </div>
	          <div>
	            <label className="text-white/50 text-xs mb-1 block">Period</label>
	            <select
              value={periodFilter}
              onChange={(e) => applyPeriodRange(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="all">All Time</option>
              <option value="last7">Last 7 Days</option>
              <option value="last14">Last 14 Days</option>
              <option value="last30">Last 30 Days</option>
            </select>
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">ROAS Filter</label>
            <select
              value={roasFilter}
              onChange={(e) => setRoasFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="all">All</option>
              <option value="positive">Profitable (ROAS &gt; 1)</option>
              <option value="negative">Loss (ROAS ≤ 1)</option>
              <option value="noads">No Ads</option>
            </select>
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">USD to INR Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                placeholder="85.00"
              />
              <button
                onClick={() => {
                  const rate = parseFloat(exchangeRate);
                  if (rate > 0) onRefreshWithRate(rate);
                }}
                disabled={loading}
                className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-primary/80 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
	        <p className="text-white/30 text-xs mt-3">
	          Note: Each date represents Costa Rica timezone (UTC-6). Revenue is calculated from 11:30 AM IST to next day 11:29 AM IST. Ads cost is fetched in USD and converted to INR.
	        </p>
	        {selectedDates.length > 0 && (
	          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
	            <span className="text-xs font-medium text-primary">Showing specific days:</span>
	            {selectedDates.map((date) => (
	              <button
	                key={date}
	                onClick={() => toggleSpecificDate(date)}
	                className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20 transition-colors"
	                title="Click to remove"
	              >
	                {formatCalendarDateShort(date)}
	              </button>
	            ))}
	            <button
	              onClick={clearSpecificDates}
	              className="ml-auto rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20 transition-colors"
	            >
	              Clear
	            </button>
	          </div>
	        )}
	      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Total Received</p>
          <p className="text-green-400 text-xl font-bold">{formatCurrency(totals.grossRevenue)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Total Orders</p>
          <p className="text-white text-xl font-bold">{totals.transactionCount}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Refund Amount</p>
          <p className="text-red-400 text-xl font-bold">-{formatCurrency(totals.refundAmount)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Revenue After Refunds</p>
          <p className="text-green-400 text-xl font-bold">{formatCurrency(totals.revenue)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Total GST (5%)</p>
          <p className="text-amber-400 text-xl font-bold">{formatCurrency(totals.gst)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Ads Cost (USD)</p>
          <p className="text-red-400/70 text-lg font-bold">${totals.adsCostUSD.toFixed(2)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Ads Cost (INR)</p>
          <p className="text-red-400 text-xl font-bold">{formatCurrency(totals.adsCostINR)}</p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Profit</p>
          <p className={`text-xl font-bold ${totals.netRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrency(totals.netRevenue)}
          </p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Overall Profit %</p>
          <p className={`text-xl font-bold ${overallProfitPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {overallProfitPercent.toFixed(2)}%
          </p>
        </div>
        <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 min-w-0">
          <p className="text-white/50 text-xs mb-1">Overall ROAS</p>
          <p className={`text-xl font-bold ${overallRoas >= 1 ? "text-green-400" : overallRoas > 0 ? "text-amber-400" : "text-white/40"}`}>
            {overallRoas > 0 ? overallRoas.toFixed(2) : "-"}
          </p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <span className="ml-2 text-white/60">Loading profit sheet...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left text-white/70 text-xs font-semibold px-4 py-3">Date</th>
                  <th className="text-left text-white/70 text-xs font-semibold px-4 py-3">Day</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Received</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Refund</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Revenue</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">GST (5%)</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Ads (USD)</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Ads (INR)</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Profit</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Profit %</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">ROAS</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Bundle Purchases</th>
                  <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Orders</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center text-white/40 py-8">
                      No data available for the selected filters
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredData.map((row, idx) => (
                      <tr key={row.date} className={`border-b border-white/5 hover:bg-white/5 ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                        <td className="text-white/80 text-sm px-4 py-3">{formatDate(row.date)}</td>
                        <td className="text-white/60 text-sm px-4 py-3">{row.day}</td>
                        <td className="text-green-400 text-sm px-4 py-3 text-right font-medium">
                          {formatCurrency(row.grossRevenue ?? row.revenue)}
                        </td>
                        <td className="text-red-400 text-sm px-4 py-3 text-right font-medium">
                          -{formatCurrency(row.refundAmount ?? 0)}
                        </td>
                        <td className="text-green-400 text-sm px-4 py-3 text-right font-medium">{formatCurrency(row.revenue)}</td>
                        <td className="text-amber-400/70 text-sm px-4 py-3 text-right">{formatCurrency(row.gst)}</td>
                        <td className="text-red-400/50 text-sm px-4 py-3 text-right">${row.adsCostUSD.toFixed(2)}</td>
                        <td className="text-red-400/70 text-sm px-4 py-3 text-right">{formatCurrency(row.adsCostINR)}</td>
                        <td className={`text-sm px-4 py-3 text-right font-medium ${row.netRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatCurrency(row.netRevenue)}
                        </td>
                        <td className={`text-sm px-4 py-3 text-right font-medium ${(row.profitPercent || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(row.profitPercent || 0).toFixed(2)}%
                        </td>
                        <td className={`text-sm px-4 py-3 text-right font-medium ${
                          row.roas >= 1 ? "text-green-400" : row.roas > 0 ? "text-amber-400" : "text-white/30"
                        }`}>
                          {row.roas > 0 ? row.roas.toFixed(2) : "-"}
                        </td>
                        <td className="text-white/80 text-sm px-4 py-3 text-right">{row.bundlePurchases}</td>
                        <td className="text-white/60 text-sm px-4 py-3 text-right">{row.transactionCount}</td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr className="bg-white/10 border-t-2 border-white/20 font-semibold">
                      <td className="text-white text-sm px-4 py-3" colSpan={2}>TOTAL</td>
                      <td className="text-green-400 text-sm px-4 py-3 text-right">{formatCurrency(totals.grossRevenue)}</td>
                      <td className="text-red-400 text-sm px-4 py-3 text-right">-{formatCurrency(totals.refundAmount)}</td>
                      <td className="text-green-400 text-sm px-4 py-3 text-right">{formatCurrency(totals.revenue)}</td>
                      <td className="text-amber-400 text-sm px-4 py-3 text-right">{formatCurrency(totals.gst)}</td>
                      <td className="text-red-400/70 text-sm px-4 py-3 text-right">${totals.adsCostUSD.toFixed(2)}</td>
                      <td className="text-red-400 text-sm px-4 py-3 text-right">{formatCurrency(totals.adsCostINR)}</td>
                      <td className={`text-sm px-4 py-3 text-right ${totals.netRevenue >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatCurrency(totals.netRevenue)}
                      </td>
                      <td className={`text-sm px-4 py-3 text-right ${overallProfitPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {overallProfitPercent.toFixed(2)}%
                      </td>
                      <td className={`text-sm px-4 py-3 text-right ${overallRoas >= 1 ? "text-green-400" : "text-amber-400"}`}>
                        {overallRoas > 0 ? overallRoas.toFixed(2) : "-"}
                      </td>
                      <td className="text-white text-sm px-4 py-3 text-right">{totals.bundlePurchases}</td>
                      <td className="text-white text-sm px-4 py-3 text-right">{totals.transactionCount}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Meta Breakdown Tab Component
function MetaBreakdownTab({
  data,
  loading,
  datePreset,
  setDatePreset,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  useCustomDateRange,
  setUseCustomDateRange,
  exchangeRate,
  setExchangeRate,
  expandedCampaigns,
  expandedAdsets,
  toggleCampaign,
  toggleAdset,
  onRefresh,
  onRefreshWithRate,
  onCustomDateRefresh,
}: {
  data: MetaBreakdownData | null;
  loading: boolean;
  datePreset: string;
  setDatePreset: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  useCustomDateRange: boolean;
  setUseCustomDateRange: (v: boolean) => void;
  exchangeRate: string;
  setExchangeRate: (v: string) => void;
  expandedCampaigns: Set<string>;
  expandedAdsets: Set<string>;
  toggleCampaign: (id: string) => void;
  toggleAdset: (id: string) => void;
  onRefresh: () => void;
  onRefreshWithRate: (rate: number) => void;
  onCustomDateRefresh: (start: string, end: string) => void;
}) {
  const formatUSD = (value: number) => `$${value.toFixed(2)}`;
  const parsedExchangeRate = exchangeRate ? parseFloat(exchangeRate) : 85;
  const exchangeRateValue = Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0 ? parsedExchangeRate : 85;
  const formatINR = (value: number) => `₹${(value * exchangeRateValue).toFixed(2)}`;
  const normalizeAccountKey = (value: string | undefined) => String(value || "").replace(/^act_/i, "");
  const toInrValue = (value: number, currency?: string) =>
    String(currency || "USD").toUpperCase() === "INR" ? value : value * exchangeRateValue;
  const formatInrValue = (value: number, currency?: string) => `₹${toInrValue(value, currency).toFixed(2)}`;
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  type BreakdownSection = {
    key: string;
    title: string;
    subtitle: string;
    campaigns: MetaCampaignData[];
    totals: MetaTotals | null;
    sourceBreakdown: MetaSourceBreakdown | undefined;
    showCampaignAccountName: boolean;
    defaultCollapsed: boolean;
  };

  const breakdownSections = useMemo<BreakdownSection[]>(() => {
    const accountSections = (data?.accounts || []).map((account, index) => ({
      key: account.account.id,
      title: `Ad Account ${index + 1}`,
      subtitle: account.account.name || account.account.id,
      campaigns: account.campaigns || [],
      totals: account.totals || null,
      sourceBreakdown: account.sourceBreakdown,
      showCampaignAccountName: false,
      defaultCollapsed: true,
    }));

    const mergedSection: BreakdownSection = {
      key: "merged",
      title: "Merged Both Ad Accounts",
      subtitle:
        data?.account?.name ||
        (accountSections.length > 1 ? "Combined performance across all mapped ad accounts" : "Combined view"),
      campaigns: data?.campaigns || [],
      totals: data?.totals || null,
      sourceBreakdown: data?.sourceBreakdown,
      showCampaignAccountName: true,
      defaultCollapsed: false,
    };

    return [...accountSections, mergedSection];
  }, [data]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const accountCurrencyById = useMemo(() => {
    const map = new Map<string, string>();
    (data?.accounts || []).forEach((account) => {
      map.set(normalizeAccountKey(account.account.id), String(account.account.currency || "USD").toUpperCase());
    });
    return map;
  }, [data]);

  const isCampaignActive = (status: string | undefined) => String(status || "").toUpperCase() === "ACTIVE";

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next: Record<string, boolean> = {};
      breakdownSections.forEach((section) => {
        if (Object.prototype.hasOwnProperty.call(prev, section.key)) {
          next[section.key] = prev[section.key];
        } else {
          next[section.key] = section.defaultCollapsed;
        }
      });
      return next;
    });
  }, [breakdownSections]);

  // For per-campaign breakdown, prefer Meta ROAS (matches Ads Manager),
  // fallback to estimated AOV model when ROAS is unavailable.
  const AVG_ORDER_VALUE = data?.revenue?.totalSales && data?.revenue?.totalRevenue
    ? data.revenue.totalRevenue / data.revenue.totalSales
    : 1500;
  const mergedFirstPartySales = data?.sourceBreakdown?.firstPartySales ?? data?.revenue?.totalSales ?? 0;

  const mergedSection = breakdownSections.find((section) => section.key === "merged");
  const mergedActiveCampaigns = (mergedSection?.campaigns || []).filter((campaign) => isCampaignActive(campaign.status));
  const mergedActiveSpendINR = mergedActiveCampaigns.reduce((sum, campaign) => {
    const currency = accountCurrencyById.get(normalizeAccountKey(campaign.accountId));
    return sum + toInrValue(campaign.spend, currency);
  }, 0);
  const mergedProfit = (data?.revenue?.netRevenue || 0) - mergedActiveSpendINR;
  const mergedRoas = mergedActiveSpendINR > 0 ? (data?.revenue?.totalRevenue || 0) / mergedActiveSpendINR : 0;

  const resolveDisplayRoas = (purchases: number, spend: number, roas: number, currency?: string) => {
    if (roas > 0) return roas.toFixed(2);
    if (spend === 0 || purchases === 0) return "-";
    const estimatedRevenue = purchases * AVG_ORDER_VALUE;
    const spendINR = toInrValue(spend, currency);
    if (spendINR === 0) return "-";
    return (estimatedRevenue / spendINR).toFixed(2);
  };

  // Calculate estimated profit per campaign
  const calculateEstimatedProfit = (purchases: number, spend: number, roas: number, currency?: string) => {
    const spendINR = toInrValue(spend, currency);
    if (spendINR <= 0) return 0;
    if (roas > 0) {
      const metaRevenueInr = roas * spendINR;
      return metaRevenueInr - spendINR;
    }
    const estimatedRevenueInr = purchases * AVG_ORDER_VALUE;
    return estimatedRevenueInr - spendINR;
  };

  const [pickerStartDate, setPickerStartDate] = useState<string>(startDate);
  const [pickerEndDate, setPickerEndDate] = useState<string>(endDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const focusDate = endDate || startDate || getCurrentBusinessDateIso();
    return getMonthStartUtcDate(focusDate);
  });

  useEffect(() => {
    setPickerStartDate(startDate);
    setPickerEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (calendarDropdownRef.current && target && !calendarDropdownRef.current.contains(target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  const maxSelectableBusinessDate = getCurrentBusinessDateIso();
  const maxMonthStart = getMonthStartUtcDate(maxSelectableBusinessDate);
  const calendarCells = useMemo(() => buildMonthGrid(calendarMonthStart), [calendarMonthStart]);
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(calendarMonthStart);

  const applyPresetRange = (preset: string) => {
    const presetRange = getPresetCalendarRange(preset);
    setDatePreset(preset);
    setUseCustomDateRange(false);
    setStartDate(presetRange.startDate);
    setEndDate(presetRange.endDate);
    setPickerStartDate(presetRange.startDate);
    setPickerEndDate(presetRange.endDate);
    setCalendarMonthStart(getMonthStartUtcDate(presetRange.endDate));
    setIsCalendarOpen(false);
  };

  const handleCalendarDateSelect = (isoDate: string) => {
    if (isoDate < META_MIN_RANGE_START || isoDate > maxSelectableBusinessDate) {
      return;
    }
    if (!pickerStartDate || (pickerStartDate && pickerEndDate)) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    if (isoDate < pickerStartDate) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    setPickerEndDate(isoDate);
  };

  const applyCustomRange = () => {
    if (!pickerStartDate) return;
    const finalEndDate = pickerEndDate || pickerStartDate;
    setUseCustomDateRange(true);
    setStartDate(pickerStartDate);
    setEndDate(finalEndDate);
    onCustomDateRefresh(pickerStartDate, finalEndDate);
    setIsCalendarOpen(false);
  };

  const selectedRangeLabel = pickerStartDate
    ? `${formatCalendarDateLabel(pickerStartDate)}${
        pickerEndDate ? ` → ${formatCalendarDateLabel(pickerEndDate)}` : ""
      }`
    : "No date selected";

  const activeRangeStart = startDate || pickerStartDate;
  const activeRangeEnd = endDate || pickerEndDate || activeRangeStart;
  const activeRangeButtonLabel =
    activeRangeStart && activeRangeEnd
      ? activeRangeStart === activeRangeEnd
        ? formatCalendarDateShort(activeRangeStart)
        : `${formatCalendarDateShort(activeRangeStart)} - ${formatCalendarDateShort(activeRangeEnd)}`
      : "Select Range";

  const toggleSectionCollapse = (key: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderBreakdownSection = (section: BreakdownSection) => {
    const isCollapsed = collapsedSections[section.key] ?? section.defaultCollapsed;
    const sectionCampaigns = section.campaigns || [];
    const activeCampaigns = sectionCampaigns.filter((campaign) => isCampaignActive(campaign.status));
    const sectionTotals = section.totals;
    const sectionSourceBreakdown = section.sourceBreakdown;
    const sectionFirstPartySales = sectionSourceBreakdown?.firstPartySales ?? data?.revenue?.totalSales ?? 0;
    const sectionFirstPartyAttributedSales = activeCampaigns.reduce(
      (sum, campaign) => sum + (campaign.firstPartySales || 0),
      0
    );
    const sectionMetaPurchases = activeCampaigns.reduce((sum, campaign) => sum + (campaign.purchases || 0), 0);
    const sectionOrganicOrUnattributedSales =
      sectionSourceBreakdown?.organicOrUnattributedSales ??
      Math.max(sectionFirstPartySales - Math.max(sectionMetaPurchases, sectionFirstPartyAttributedSales), 0);
    const sectionSpendInr = activeCampaigns.reduce((sum, campaign) => {
      const currency = accountCurrencyById.get(normalizeAccountKey(campaign.accountId));
      return sum + toInrValue(campaign.spend, currency);
    }, 0);
    const sectionClicks = activeCampaigns.reduce((sum, campaign) => sum + (campaign.clicks || 0), 0);
    const sectionImpressions = activeCampaigns.reduce((sum, campaign) => sum + (campaign.impressions || 0), 0);
    const sectionCpmInr = sectionImpressions > 0 ? (sectionSpendInr / sectionImpressions) * 1000 : 0;
    const sectionCtr = sectionImpressions > 0 ? (sectionClicks / sectionImpressions) * 100 : 0;
    const sectionCpaInr = sectionMetaPurchases > 0 ? sectionSpendInr / sectionMetaPurchases : 0;

    return (
      <div key={section.key} className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
        <button
          onClick={() => toggleSectionCollapse(section.key)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <div className="text-left">
            <p className="text-white text-sm font-semibold">{section.title}</p>
            <p className="text-white/45 text-xs">{section.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-xs">{activeCampaigns.length} active campaigns</span>
            <ChevronRight
              className={`w-4 h-4 text-white/50 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            />
          </div>
        </button>

        {!isCollapsed && (
          <div className="border-t border-white/10 p-4 space-y-4">
            {sectionTotals && (
              <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">Ad Spend (INR)</p>
                  <p className="text-red-400 text-xl font-bold">
                    ₹{sectionSpendInr.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">Meta Purchases</p>
                  <p className="text-blue-400 text-xl font-bold">{sectionMetaPurchases}</p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">Live Attributed Sales</p>
                  <p className="text-cyan-300 text-xl font-bold">{sectionFirstPartyAttributedSales}</p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">Organic / Unattributed</p>
                  <p className="text-emerald-400 text-xl font-bold">{sectionOrganicOrUnattributedSales}</p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">First-Party Sales</p>
                  <p className="text-white text-xl font-bold">{sectionFirstPartySales}</p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">CPA (Cost/Purchase)</p>
                  <p className="text-amber-400 text-xl font-bold">
                    {sectionMetaPurchases > 0 ? `₹${sectionCpaInr.toFixed(2)}` : "-"}
                  </p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">CPM</p>
                  <p className="text-white/70 text-xl font-bold">₹{sectionCpmInr.toFixed(2)}</p>
                </div>
                <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white/50 text-xs mb-1">CTR</p>
                  <p className="text-blue-400 text-xl font-bold">{formatPercent(sectionCtr)}</p>
                </div>
              </div>
            )}

            <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <span className="ml-2 text-white/60">Loading campaigns...</span>
                </div>
              ) : !activeCampaigns.length ? (
                <div className="text-center text-white/40 py-12">No campaign data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left text-white/70 text-xs font-semibold px-4 py-3 w-8"></th>
                        <th className="text-left text-white/70 text-xs font-semibold px-4 py-3">Name</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Spend</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Budget</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">ROAS</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Profit</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Meta Purchases</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Live Sales</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPC</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPA</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPM</th>
                        <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCampaigns.map((campaign) => (
                        <React.Fragment key={campaign.id}>
                          <tr
                            className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                            onClick={() => toggleCampaign(campaign.id)}
                          >
                            <td className="px-4 py-3">
                              <ChevronRight
                                className={`w-4 h-4 text-white/40 transition-transform ${
                                  expandedCampaigns.has(campaign.id) ? "rotate-90" : ""
                                }`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    campaign.status === "ACTIVE" ? "bg-green-400" : "bg-gray-400"
                                  }`}
                                />
                                <div>
                                  <span className="text-white font-medium">{campaign.name}</span>
                                  {campaign.accountName && section.showCampaignAccountName && (
                                    <p className="text-[11px] text-white/45 mt-0.5">{campaign.accountName}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-red-400 px-4 py-3 text-right">
                              {formatInrValue(campaign.spend, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                            </td>
                            <td className="text-white/60 px-4 py-3 text-right">
                              {campaign.budget
                                ? formatInrValue(campaign.budget, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))
                                : "-"}
                            </td>
                            <td className="text-green-400 px-4 py-3 text-right">
                              {resolveDisplayRoas(
                                campaign.purchases,
                                campaign.spend,
                                campaign.roas,
                                accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                              )}
                            </td>
                            <td
                              className={`px-4 py-3 text-right ${
                                calculateEstimatedProfit(
                                  campaign.purchases,
                                  campaign.spend,
                                  campaign.roas,
                                  accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                ) >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}
                            >
                              {calculateEstimatedProfit(
                                campaign.purchases,
                                campaign.spend,
                                campaign.roas,
                                accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                              ) >= 0
                                ? ""
                                : "-"}
                              ₹
                              {Math.abs(
                                calculateEstimatedProfit(
                                  campaign.purchases,
                                  campaign.spend,
                                  campaign.roas,
                                  accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                )
                              ).toFixed(2)}
                            </td>
                            <td className="text-white px-4 py-3 text-right">{campaign.purchases}</td>
                            <td className="text-cyan-300 px-4 py-3 text-right">{campaign.firstPartySales ?? 0}</td>
                            <td className="text-white/60 px-4 py-3 text-right">
                              {formatInrValue(campaign.cpc, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                            </td>
                            <td className="text-amber-400 px-4 py-3 text-right">
                              {campaign.costPerPurchase > 0
                                ? formatInrValue(campaign.costPerPurchase, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))
                                : "-"}
                            </td>
                            <td className="text-white/60 px-4 py-3 text-right">
                              {formatInrValue(campaign.cpm, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                            </td>
                            <td className="text-blue-400 px-4 py-3 text-right">{formatPercent(campaign.ctr)}</td>
                          </tr>

                          {expandedCampaigns.has(campaign.id) &&
                            campaign.adsets?.map((adset) => (
                              <React.Fragment key={adset.id}>
                                <tr
                                  className="border-b border-white/5 bg-white/[0.02] hover:bg-white/5 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAdset(adset.id);
                                  }}
                                >
                                  <td className="px-4 py-3 pl-8">
                                    <ChevronRight
                                      className={`w-4 h-4 text-white/30 transition-transform ${
                                        expandedAdsets.has(adset.id) ? "rotate-90" : ""
                                      }`}
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 pl-4">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          adset.status === "ACTIVE" ? "bg-green-400" : "bg-gray-400"
                                        }`}
                                      />
                                      <span className="text-white/80">{adset.name}</span>
                                    </div>
                                  </td>
                                  <td className="text-red-400/80 px-4 py-3 text-right">
                                    {formatInrValue(adset.spend, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                  </td>
                                  <td className="text-white/50 px-4 py-3 text-right">
                                    {adset.budget
                                      ? formatInrValue(adset.budget, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))
                                      : "-"}
                                  </td>
                                  <td className="text-green-400/80 px-4 py-3 text-right">
                                    {resolveDisplayRoas(
                                      adset.purchases,
                                      adset.spend,
                                      adset.roas,
                                      accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                    )}
                                  </td>
                                  <td
                                    className={`px-4 py-3 text-right ${
                                      calculateEstimatedProfit(
                                        adset.purchases,
                                        adset.spend,
                                        adset.roas,
                                        accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                      ) >= 0
                                        ? "text-green-400/80"
                                        : "text-red-400/80"
                                    }`}
                                  >
                                    {calculateEstimatedProfit(
                                      adset.purchases,
                                      adset.spend,
                                      adset.roas,
                                      accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                    ) >= 0
                                      ? ""
                                      : "-"}
                                    ₹
                                    {Math.abs(
                                      calculateEstimatedProfit(
                                        adset.purchases,
                                        adset.spend,
                                        adset.roas,
                                        accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                      )
                                    ).toFixed(2)}
                                  </td>
                                  <td className="text-white/80 px-4 py-3 text-right">{adset.purchases}</td>
                                  <td className="text-cyan-300/70 px-4 py-3 text-right">-</td>
                                  <td className="text-white/50 px-4 py-3 text-right">
                                    {formatInrValue(adset.cpc, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                  </td>
                                  <td className="text-amber-400/80 px-4 py-3 text-right">
                                    {adset.costPerPurchase > 0
                                      ? formatInrValue(adset.costPerPurchase, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))
                                      : "-"}
                                  </td>
                                  <td className="text-white/50 px-4 py-3 text-right">
                                    {formatInrValue(adset.cpm, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                  </td>
                                  <td className="text-blue-400/80 px-4 py-3 text-right">
                                    {formatPercent(adset.ctr)}
                                  </td>
                                </tr>

                                {expandedAdsets.has(adset.id) &&
                                  adset.ads?.map((ad) => (
                                    <tr key={ad.id} className="border-b border-white/5 bg-white/[0.01]">
                                      <td className="px-4 py-3 pl-12"></td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 pl-8">
                                          <span
                                            className={`w-1 h-1 rounded-full ${
                                              ad.status === "ACTIVE" ? "bg-green-400" : "bg-gray-400"
                                            }`}
                                          />
                                          <span className="text-white/60 text-xs">{ad.name}</span>
                                        </div>
                                      </td>
                                      <td className="text-red-400/60 px-4 py-3 text-right text-xs">
                                        {formatInrValue(ad.spend, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                      </td>
                                      <td className="text-white/40 px-4 py-3 text-right text-xs">-</td>
                                      <td className="text-green-400/60 px-4 py-3 text-right text-xs">
                                        {resolveDisplayRoas(
                                          ad.purchases,
                                          ad.spend,
                                          ad.roas,
                                          accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                        )}
                                      </td>
                                      <td
                                        className={`px-4 py-3 text-right text-xs ${
                                          calculateEstimatedProfit(
                                            ad.purchases,
                                            ad.spend,
                                            ad.roas,
                                            accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                          ) >= 0
                                            ? "text-green-400/60"
                                            : "text-red-400/60"
                                        }`}
                                      >
                                        {calculateEstimatedProfit(
                                          ad.purchases,
                                          ad.spend,
                                          ad.roas,
                                          accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                        ) >= 0
                                          ? ""
                                          : "-"}₹
                                        {Math.abs(
                                          calculateEstimatedProfit(
                                            ad.purchases,
                                            ad.spend,
                                            ad.roas,
                                            accountCurrencyById.get(normalizeAccountKey(campaign.accountId))
                                          )
                                        ).toFixed(2)}
                                      </td>
                                      <td className="text-white/60 px-4 py-3 text-right text-xs">
                                        {ad.purchases}
                                      </td>
                                      <td className="text-cyan-300/50 px-4 py-3 text-right text-xs">-</td>
                                      <td className="text-white/40 px-4 py-3 text-right text-xs">
                                        {formatInrValue(ad.cpc, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                      </td>
                                      <td className="text-amber-400/60 px-4 py-3 text-right text-xs">
                                        {ad.costPerPurchase > 0
                                          ? formatInrValue(ad.costPerPurchase, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))
                                          : "-"}
                                      </td>
                                      <td className="text-white/40 px-4 py-3 text-right text-xs">
                                        {formatInrValue(ad.cpm, accountCurrencyById.get(normalizeAccountKey(campaign.accountId)))}
                                      </td>
                                      <td className="text-blue-400/60 px-4 py-3 text-right text-xs">
                                        {formatPercent(ad.ctr)}
                                      </td>
                                    </tr>
                                  ))}
                              </React.Fragment>
                            ))}
                        </React.Fragment>
                      ))}
                      <tr className="border-t border-white/10 bg-emerald-500/5">
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-emerald-200 font-medium">Organic / Unattributed Sales</span>
                          </div>
                        </td>
                        <td className="text-white/50 px-4 py-3 text-right">₹0.00</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-emerald-300 px-4 py-3 text-right font-medium">
                          {sectionOrganicOrUnattributedSales}
                        </td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                        <td className="text-white/40 px-4 py-3 text-right">-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-white/50 text-xs mb-1 block">Quick Select</label>
            <select
              value={datePreset}
              onChange={(e) => applyPresetRange(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_3d">Last 3 Days</option>
              <option value="last_7d">Last 7 Days</option>
              <option value="last_14d">Last 14 Days</option>
              <option value="last_30d">Last 30 Days</option>
              <option value="last_60d">Last 60 Days</option>
              <option value="last_90d">Last 90 Days</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="last_quarter">Last Quarter</option>
              <option value="this_year">This Year</option>
              <option value="last_year">Last Year</option>
              <option value="maximum">All Time</option>
            </select>
          </div>
          <div ref={calendarDropdownRef} className="relative">
            <label className="text-white/50 text-xs mb-1 block">Custom Range</label>
            <button
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                useCustomDateRange
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              {activeRangeButtonLabel}
            </button>
            {isCalendarOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[92vw] sm:w-[680px] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] shadow-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/80 text-sm font-medium">Custom Range</p>
                  <button
                    onClick={() => setIsCalendarOpen(false)}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Close custom range picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() =>
                      setCalendarMonthStart(
                        (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1))
                      )
                    }
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-white text-sm font-medium">{monthLabel}</p>
                  <button
                    onClick={() =>
                      setCalendarMonthStart(
                        (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
                      )
                    }
                    disabled={calendarMonthStart.getTime() >= maxMonthStart.getTime()}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-[11px] text-white/50 mb-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                    <div key={weekday} className="text-center py-1">
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell) => {
                    const isDisabled =
                      cell.isoDate < META_MIN_RANGE_START || cell.isoDate > maxSelectableBusinessDate;
                    const isStart = pickerStartDate === cell.isoDate;
                    const isEnd = pickerEndDate === cell.isoDate;
                    const isInRange =
                      !!pickerStartDate &&
                      !!pickerEndDate &&
                      cell.isoDate >= pickerStartDate &&
                      cell.isoDate <= pickerEndDate;
                    return (
                      <button
                        key={cell.isoDate}
                        onClick={() => handleCalendarDateSelect(cell.isoDate)}
                        disabled={isDisabled}
                        className={`h-9 rounded-md text-sm transition-colors ${
                          isStart || isEnd
                            ? "bg-primary text-white"
                            : isInRange
                            ? "bg-primary/25 text-white"
                            : cell.inCurrentMonth
                            ? "bg-white/5 text-white hover:bg-white/15"
                            : "bg-white/[0.02] text-white/45 hover:bg-white/10"
                        } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
                        title={formatCalendarDateLabel(cell.isoDate)}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-white/60">
                    Selected: <span className="text-white/90">{selectedRangeLabel}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPickerStartDate(startDate);
                        setPickerEndDate(endDate);
                      }}
                      className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={applyCustomRange}
                      disabled={!pickerStartDate}
                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors disabled:opacity-50"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">USD to INR Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                placeholder="85.00"
              />
              <button
                onClick={() => {
                  const rate = parseFloat(exchangeRate);
                  if (rate > 0) onRefreshWithRate(rate);
                }}
                disabled={loading}
                className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-primary/80 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <p className="text-white/30 text-xs mt-3">
          {data?.dateRange ? `Selected Dates: ${data.dateRange.start} to ${data.dateRange.end}` : ""}
        </p>
      </div>

      {/* Revenue & Profit Summary */}
      {data?.revenue && (
        <div className="bg-gradient-to-r from-[#1A2235] to-[#1E2942] rounded-xl p-5 border border-white/10">
          <h3 className="text-white/70 text-sm font-semibold mb-4">Selected Days Summary (Combined Accounts)</h3>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            <div>
              <p className="text-white/40 text-xs mb-1">Total Revenue</p>
              <p className="text-green-400 text-xl font-bold">₹{data.revenue.totalRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">First-Party Sales</p>
              <p className="text-white text-xl font-bold">{mergedFirstPartySales}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">GST (5%)</p>
              <p className="text-amber-400 text-lg font-bold">₹{data.revenue.gst.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Net Revenue</p>
              <p className="text-green-400/80 text-lg font-bold">₹{data.revenue.netRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Ad Spend (INR)</p>
              <p className="text-red-400 text-xl font-bold">₹{mergedActiveSpendINR.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Profit</p>
              <p className={`text-xl font-bold ${mergedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {mergedProfit >= 0 ? "" : "-"}₹{Math.abs(mergedProfit).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">ROAS</p>
              <p className={`text-xl font-bold ${mergedRoas >= 1 ? "text-green-400" : mergedRoas > 0 ? "text-amber-400" : "text-white/40"}`}>
                {mergedRoas > 0 ? mergedRoas.toFixed(2) : "-"}
              </p>
            </div>
          </div>
        </div>
      )}

      {data?.attribution?.note && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
          <p className="text-blue-200 text-sm">{data.attribution.note}</p>
        </div>
      )}

      <div className="space-y-4">
        {breakdownSections.map((section) => renderBreakdownSection(section))}
      </div>
    </div>
  );
}

function AttributionTab({
  data,
  loading,
  error,
  datePreset,
  setDatePreset,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  useCustomDateRange,
  setUseCustomDateRange,
  onRefresh,
}: {
  data: MarketingAttributionData | null;
  loading: boolean;
  error: string | null;
  datePreset: string;
  setDatePreset: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  useCustomDateRange: boolean;
  setUseCustomDateRange: (value: boolean) => void;
  onRefresh: () => void;
}) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value || 0);
  const formatCurrencyPrecise = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value || 0);

  const [copiedParameters, setCopiedParameters] = useState(false);
  const [pickerStartDate, setPickerStartDate] = useState<string>(startDate);
  const [pickerEndDate, setPickerEndDate] = useState<string>(endDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const focusDate = endDate || startDate || getCurrentBusinessDateIso();
    return getMonthStartUtcDate(focusDate);
  });

  useEffect(() => {
    setPickerStartDate(startDate);
    setPickerEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (calendarDropdownRef.current && target && !calendarDropdownRef.current.contains(target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  const maxSelectableBusinessDate = getCurrentBusinessDateIso();
  const maxMonthStart = getMonthStartUtcDate(maxSelectableBusinessDate);
  const calendarCells = useMemo(() => buildMonthGrid(calendarMonthStart), [calendarMonthStart]);
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(calendarMonthStart);

  const applyPresetRange = (preset: string) => {
    const presetRange = getPresetCalendarRange(preset);
    setDatePreset(preset);
    setUseCustomDateRange(false);
    setStartDate(presetRange.startDate);
    setEndDate(presetRange.endDate);
    setPickerStartDate(presetRange.startDate);
    setPickerEndDate(presetRange.endDate);
    setCalendarMonthStart(getMonthStartUtcDate(presetRange.endDate));
    setIsCalendarOpen(false);
  };

  const handleCalendarDateSelect = (isoDate: string) => {
    if (isoDate < META_MIN_RANGE_START || isoDate > maxSelectableBusinessDate) {
      return;
    }
    if (!pickerStartDate || (pickerStartDate && pickerEndDate)) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    if (isoDate < pickerStartDate) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    setPickerEndDate(isoDate);
  };

  const applyCustomRange = () => {
    if (!pickerStartDate) return;
    const finalEndDate = pickerEndDate || pickerStartDate;
    setUseCustomDateRange(true);
    setStartDate(pickerStartDate);
    setEndDate(finalEndDate);
    setIsCalendarOpen(false);
  };

  const selectedRangeLabel = pickerStartDate
    ? `${formatCalendarDateLabel(pickerStartDate)}${
        pickerEndDate ? ` → ${formatCalendarDateLabel(pickerEndDate)}` : ""
      }`
    : "No date selected";

  const activeRangeButtonLabel =
    startDate && endDate
      ? startDate === endDate
        ? formatCalendarDateShort(startDate)
        : `${formatCalendarDateShort(startDate)} - ${formatCalendarDateShort(endDate)}`
      : "Select Range";

  return (
    <div className="space-y-4">
      <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-white text-sm font-semibold">First-Party Attribution</p>
            <p className="text-white/45 text-xs mt-1">
              Funnel, bundle revenue, campaign ROAS, and profit from captured Meta URL params.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-white/50 text-xs mb-1 block">Quick Select</label>
              <select
                value={datePreset}
                onChange={(e) => applyPresetRange(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_3d">Last 3 Days</option>
                <option value="last_7d">Last 7 Days</option>
                <option value="last_14d">Last 14 Days</option>
                <option value="last_30d">Last 30 Days</option>
                <option value="last_60d">Last 60 Days</option>
                <option value="last_90d">Last 90 Days</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_quarter">This Quarter</option>
                <option value="last_quarter">Last Quarter</option>
                <option value="this_year">This Year</option>
                <option value="last_year">Last Year</option>
                <option value="maximum">All Time</option>
              </select>
            </div>
            <div ref={calendarDropdownRef} className="relative">
              <label className="text-white/50 text-xs mb-1 block">Custom Range</label>
              <button
                onClick={() => setIsCalendarOpen((prev) => !prev)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  useCustomDateRange
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                {activeRangeButtonLabel}
              </button>
              {isCalendarOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[92vw] sm:w-[680px] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] shadow-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white/80 text-sm font-medium">Custom Range</p>
                    <button
                      onClick={() => setIsCalendarOpen(false)}
                      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                      aria-label="Close custom range picker"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() =>
                        setCalendarMonthStart(
                          (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1))
                        )
                      }
                      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <p className="text-white text-sm font-medium">{monthLabel}</p>
                    <button
                      onClick={() =>
                        setCalendarMonthStart(
                          (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
                        )
                      }
                      disabled={calendarMonthStart.getTime() >= maxMonthStart.getTime()}
                      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-[11px] text-white/50 mb-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                      <div key={weekday} className="text-center py-1">
                        {weekday}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell) => {
                      const isDisabled =
                        cell.isoDate < META_MIN_RANGE_START || cell.isoDate > maxSelectableBusinessDate;
                      const isStart = pickerStartDate === cell.isoDate;
                      const isEnd = pickerEndDate === cell.isoDate;
                      const isInRange =
                        !!pickerStartDate &&
                        !!pickerEndDate &&
                        cell.isoDate >= pickerStartDate &&
                        cell.isoDate <= pickerEndDate;
                      return (
                        <button
                          key={cell.isoDate}
                          onClick={() => handleCalendarDateSelect(cell.isoDate)}
                          disabled={isDisabled}
                          className={`h-9 rounded-md text-sm transition-colors ${
                            isStart || isEnd
                              ? "bg-primary text-white"
                              : isInRange
                              ? "bg-primary/25 text-white"
                              : cell.inCurrentMonth
                              ? "bg-white/5 text-white hover:bg-white/15"
                              : "bg-white/[0.02] text-white/45 hover:bg-white/10"
                          } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
                          title={formatCalendarDateLabel(cell.isoDate)}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-white/60">
                      Selected: <span className="text-white/90">{selectedRangeLabel}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPickerStartDate(startDate);
                          setPickerEndDate(endDate);
                        }}
                        className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                      >
                        Reset
                      </button>
                      <button
                        onClick={applyCustomRange}
                        disabled={!pickerStartDate}
                        className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors disabled:opacity-50"
                      >
                        Apply Range
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-4 py-2 bg-primary hover:bg-primary/80 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        {data?.range && (
          <p className="text-white/30 text-xs mt-3">
            Selected dates: {data.range.startDate} to {data.range.endDate}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="bg-[#1A2235] rounded-xl p-8 border border-white/10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <span className="ml-2 text-white/60">Loading attribution...</span>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Tracked Events</p>
              <p className="text-white text-xl font-bold">{data.summary.events}</p>
            </div>
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Paid Orders</p>
              <p className="text-green-400 text-xl font-bold">{data.summary.paidOrders}</p>
            </div>
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Revenue</p>
              <p className="text-green-400 text-xl font-bold">{formatCurrency(data.summary.revenueInr)}</p>
            </div>
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Attributed Revenue</p>
              <p className="text-cyan-300 text-xl font-bold">{formatCurrency(data.summary.attributedRevenueInr)}</p>
            </div>
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Scope</p>
              <p className="text-blue-400 text-xl font-bold">Our Params Only</p>
            </div>
            <div className="bg-[#162136] rounded-xl p-4 border border-white/10">
              <p className="text-white/45 text-xs mb-1">Meta Spend Join</p>
              <p className={`text-xl font-bold ${data.summary.metaSpendConfigured ? "text-emerald-400" : "text-amber-400"}`}>
                {data.summary.metaSpendConfigured ? "On" : "Off"}
              </p>
            </div>
          </div>

          <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-white/75 text-sm font-semibold">Meta URL Parameters</p>
              <p className="text-white/35 text-xs">Click the parameter pill to copy it.</p>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard?.writeText(data.metaUrlParameterTemplate);
                setCopiedParameters(true);
                window.setTimeout(() => setCopiedParameters(false), 1600);
              }}
              className="group relative max-w-full sm:max-w-[720px] px-3 py-2 rounded-lg bg-black/20 hover:bg-black/30 border border-white/10 text-left transition-colors"
              title={copiedParameters ? "Copied!" : "Click to copy"}
            >
              <span className="pointer-events-none absolute -top-8 right-2 rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-[#0A0E1A] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {copiedParameters ? "Copied!" : "Click to copy"}
              </span>
              <code className="block whitespace-normal break-all text-xs leading-5 text-cyan-200">
                {data.metaUrlParameterTemplate}
              </code>
            </button>
          </div>

          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-white/75 text-sm font-semibold">First-Party Campaign Performance</h3>
              <p className="text-white/35 text-xs mt-1">
                Same operating columns as Meta Details, calculated from captured URL params and paid orders.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left text-white/70 text-xs font-semibold px-4 py-3">Campaign / Ad</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Spend</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Budget</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">ROAS</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Profit</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Meta Purchases</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Live Sales</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">Revenue</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPC</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPA</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CPM</th>
                    <th className="text-right text-white/70 text-xs font-semibold px-4 py-3">CTR</th>
                    <th className="text-left text-white/70 text-xs font-semibold px-4 py-3">Top Products</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.length === 0 ? (
                    <tr>
                      <td className="text-center text-white/40 py-8" colSpan={13}>
                        No attributed campaign sales in this range.
                      </td>
                    </tr>
                  ) : (
                    data.campaigns.map((campaign) => (
                      <tr key={campaign.key} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">
                            {campaign.adName || campaign.adsetName || campaign.campaignName || campaign.utmCampaign || campaign.key}
                          </p>
                          <p className="text-white/35 text-[11px] mt-0.5">
                            {campaign.metaCampaignId || "no campaign id"} / {campaign.metaAdsetId || "no adset id"} / {campaign.metaAdId || "no ad id"}
                          </p>
                        </td>
                        <td className="text-red-400 px-4 py-3 text-right">{formatCurrency(campaign.adSpendInr)}</td>
                        <td className="text-white/45 px-4 py-3 text-right">
                          {campaign.budgetInr ? formatCurrency(campaign.budgetInr) : "-"}
                        </td>
                        <td className="text-blue-400 px-4 py-3 text-right">{campaign.roas ? campaign.roas.toFixed(2) : "-"}</td>
                        <td
                          className={`px-4 py-3 text-right ${
                            campaign.estimatedProfitAfterAdSpendInr >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {formatCurrency(campaign.estimatedProfitAfterAdSpendInr)}
                        </td>
                        <td className="text-white/45 px-4 py-3 text-right">
                          {typeof campaign.metaPurchases === "number" ? campaign.metaPurchases : "-"}
                        </td>
                        <td className="text-cyan-300 px-4 py-3 text-right">{campaign.orders}</td>
                        <td className="text-green-400 px-4 py-3 text-right">{formatCurrency(campaign.revenueInr)}</td>
                        <td className="text-white/60 px-4 py-3 text-right">
                          {campaign.cpcInr ? formatCurrencyPrecise(campaign.cpcInr) : "-"}
                        </td>
                        <td className="text-amber-400 px-4 py-3 text-right">
                          {campaign.cpaInr ? formatCurrencyPrecise(campaign.cpaInr) : "-"}
                        </td>
                        <td className="text-white/60 px-4 py-3 text-right">
                          {campaign.cpmInr ? formatCurrencyPrecise(campaign.cpmInr) : "-"}
                        </td>
                        <td className="text-blue-400 px-4 py-3 text-right">
                          {typeof campaign.ctr === "number" && campaign.ctr > 0 ? `${campaign.ctr.toFixed(2)}%` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {campaign.products.slice(0, 3).map((product) => (
                              <span key={product.label} className="px-2 py-1 rounded-md bg-white/5 text-white/55 text-[11px]">
                                {product.label} ({product.orders})
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-white/75 text-sm font-semibold">Product / Bundle Breakdown</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {data.products.map((product) => (
                <div key={product.key} className="bg-[#162136] rounded-xl p-4 border border-white/10">
                  <p className="text-white text-sm font-semibold">{product.label}</p>
                  <p className="text-white/35 text-xs mt-1">{product.productType}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-white/40">Orders</p>
                      <p className="text-white font-semibold">{product.orders}</p>
                    </div>
                    <div>
                      <p className="text-white/40">Revenue</p>
                      <p className="text-green-400 font-semibold">{formatCurrency(product.revenueInr)}</p>
                    </div>
                    <div>
                      <p className="text-white/40">After GST</p>
                      <p className="text-cyan-300 font-semibold">{formatCurrency(product.estimatedProfitBeforeAdSpendInr)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AnalyticsTab({
  data,
  loading,
  error,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  dayMode,
  setDayMode,
  onRefresh,
}: {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  dayMode: "calendar_ist" | "business_1130_ist";
  setDayMode: (value: "calendar_ist" | "business_1130_ist") => void;
  onRefresh: () => void;
}) {
  type AnalyticsChartKey = "traffic-hourly" | "sales-hourly" | "traffic-daily" | "sales-daily";
  type ProfitMetric = "profit" | "roas";
  type ProfitView = "table" | "graph";
  type RouteViewMode = "performance" | "workflow" | "custom";
  type ChartStyle = "bar" | "line" | "pie";
  type MatrixDayMode = "calendar_ist" | "business_1130_ist";
  type CustomRouteView = {
    name: string;
    order: string[];
  };

  const WORKFLOW_ROUTE_ORDER = [
    "/",
    "/welcome",
    "/welcome-b",
    "/onboarding",
    "/onboarding/step-5",
    "/onboarding/step-6",
    "/onboarding/birthday",
    "/onboarding/birth-time",
    "/onboarding/birthplace",
    "/onboarding/step-7",
    "/onboarding/step-8",
    "/onboarding/step-9",
    "/onboarding/step-10",
    "/onboarding/step-11",
    "/onboarding/step-12",
    "/onboarding/step-10b",
    "/onboarding/step-13",
    "/onboarding/step-14",
    "/onboarding/step-15",
    "/onboarding/step-16",
    "/onboarding/step-17",
    "/onboarding/step-19",
    "/onboarding/step-20",
    "/onboarding/bundle-pricing",
    "/onboarding/bundle-upsell",
    "/onboarding/bundle-upsell-b",
    "/paywall",
    "/login",
    "/scan",
    "/dashboard",
    "/reports",
    "/profile",
    "/profile/edit",
  ];

  const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const [expandedChart, setExpandedChart] = useState<AnalyticsChartKey | null>(null);
  const [profitMetric, setProfitMetric] = useState<ProfitMetric>("profit");
  const [profitView, setProfitView] = useState<ProfitView>("table");
  const [profitPeriodDays, setProfitPeriodDays] = useState<7 | 14 | 28>(14);
  const [matrixStartDate, setMatrixStartDate] = useState<string>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 13);
    const local = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
    return local.toISOString().split("T")[0];
  });
  const [matrixEndDate, setMatrixEndDate] = useState<string>(() => {
    const end = new Date();
    const local = new Date(end.getTime() - end.getTimezoneOffset() * 60000);
    return local.toISOString().split("T")[0];
  });
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixRows, setMatrixRows] = useState<AnalyticsHourlyProfitabilityPoint[]>(() => data?.hourlyProfitability?.rows || []);
  const [matrixAdsSource, setMatrixAdsSource] = useState<"meta" | "none">(() => data?.hourlyProfitability?.adsSource || "none");
  const matrixFetchSeq = useRef(0);
  const [chartStyleByKey, setChartStyleByKey] = useState<Record<string, ChartStyle>>({
    "traffic-hourly": "bar",
    "sales-hourly": "bar",
    "traffic-daily": "bar",
    "sales-daily": "bar",
    "profit-hour": "bar",
    "profit-day": "bar",
  });
  const [chartHoverTooltip, setChartHoverTooltip] = useState<{
    chartId: string;
    x: number;
    y: number;
    label: string;
    value: string;
    placement?: "top" | "bottom";
  } | null>(null);
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const [routeViewMode, setRouteViewMode] = useState<RouteViewMode>("workflow");
  const [showCustomRouteModal, setShowCustomRouteModal] = useState(false);
  const [customRouteOrder, setCustomRouteOrder] = useState<string[]>([]);
  const [customViews, setCustomViews] = useState<CustomRouteView[]>([]);
  const [activeCustomViewName, setActiveCustomViewName] = useState("");
  const [customViewNameInput, setCustomViewNameInput] = useState("My Custom View");
  const customViewsHydratedRef = useRef(false);
  const [draggedRoute, setDraggedRoute] = useState<string | null>(null);
  const [dragOverRoute, setDragOverRoute] = useState<string | null>(null);
  const [routeSortBy, setRouteSortBy] = useState<"route" | "viewers" | "pageViews" | "bounceRate" | "avgSessionDurationSec" | "bounces">("viewers");
  const [routeSortDir, setRouteSortDir] = useState<"asc" | "desc">("desc");
  const analyticsMinRangeStart = "2026-03-13";
  const [pickerStartDate, setPickerStartDate] = useState<string>(startDate);
  const [pickerEndDate, setPickerEndDate] = useState<string>(endDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const analyticsCalendarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const focusDate = endDate || startDate || getCurrentBusinessDateIso();
    return getMonthStartUtcDate(focusDate);
  });

  useEffect(() => {
    setPickerStartDate(startDate);
    setPickerEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        analyticsCalendarDropdownRef.current &&
        target &&
        !analyticsCalendarDropdownRef.current.contains(target)
      ) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCalendarOpen]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(value);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDayLabel = (isoDate: string) => {
    if (!isoDate) return "-";
    const d = new Date(`${isoDate}T00:00:00`);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const formatHourRangeLabel = (rangeLabel: string) => {
    const match = rangeLabel.match(/^(\d{2}):00-(\d{2}):00/);
    if (!match) return rangeLabel;

    const start = Number(match[1]);
    const end = Number(match[2]);
    const to12 = (hour: number) => {
      const suffix = hour >= 12 ? "pm" : "am";
      const normalized = ((hour + 11) % 12) + 1;
      return { normalized, suffix };
    };

    const s = to12(start);
    const e = to12(end);
    const suffix = s.suffix === e.suffix ? e.suffix : `${s.suffix}/${e.suffix}`;
    return `${s.normalized}-${e.normalized}${suffix}`;
  };

  const splitGraphLabelLines = (label: string) => {
    const compactHourMatch = label.match(/^(\d+)-(\d+)(am|pm|am\/pm)$/i);
    if (compactHourMatch) {
      return [`${compactHourMatch[1]}-${compactHourMatch[2]}`, compactHourMatch[3].toLowerCase()];
    }

    const fullHourMatch = label.match(/^(\d{2}):00-(\d{2}):00/);
    if (fullHourMatch) {
      const start = Number(fullHourMatch[1]);
      const end = Number(fullHourMatch[2]);
      const to12 = (hour: number) => {
        const suffix = hour >= 12 ? "pm" : "am";
        const normalized = ((hour + 11) % 12) + 1;
        return { normalized, suffix };
      };
      const s = to12(start);
      const e = to12(end);
      const suffix = s.suffix === e.suffix ? e.suffix : `${s.suffix}/${e.suffix}`;
      return [`${s.normalized}-${e.normalized}`, suffix];
    }

    const dayMonth = label.match(/^(\d{1,2})\s+([A-Za-z]{3,})$/);
    if (dayMonth) {
      return [dayMonth[1], dayMonth[2]];
    }

    return [label, ""];
  };

  const formatHourSlot = (hour: number) => {
    const normalized = ((hour + 11) % 12) + 1;
    const nextNormalized = (((hour + 1) % 24 + 11) % 12) + 1;
    const suffix = hour >= 12 ? "pm" : "am";
    return `${normalized}-${nextNormalized}${suffix}`;
  };

  const getWorkflowRank = (route: string) => {
    const normalized = route.trim().toLowerCase();
    const exactIdx = WORKFLOW_ROUTE_ORDER.findIndex((item) => normalized === item || normalized.startsWith(`${item}/`));
    if (exactIdx >= 0) return exactIdx;

    if (normalized.includes("welcome")) return 1;
    if (normalized.includes("gender")) return 4;
    if (normalized.includes("birthday") || normalized.includes("birthdate")) return 6;
    if (normalized.includes("birth-time")) return 7;
    if (normalized.includes("birthplace")) return 8;
    if (normalized.includes("bundle") || normalized.includes("paywall")) return 24;
    if (normalized.includes("dashboard")) return 30;
    return 1000;
  };

  const formatAxisNumber = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 100000) return `${(value / 1000).toFixed(0)}k`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
    if (abs >= 100) return value.toFixed(0);
    return value.toFixed(2);
  };

  const renderTrendBars = (
    rows: Array<{ label: string; value: number; meta?: string }>,
    colorClass: string,
    emptyText: string,
    minWidth: number = 640,
    showBarValues: boolean = false
  ) => {
    if (!rows.length) {
      return <p className="text-white/40 text-xs">{emptyText}</p>;
    }

    const max = Math.max(...rows.map((r) => r.value), 1);
    const width = Math.max(rows.length * 28, minWidth);

    return (
      <div className="flex gap-2">
        <div className="w-10 shrink-0 h-48 flex flex-col justify-between pt-3 pb-10 text-[10px] text-white/35 text-right">
          <span>{formatAxisNumber(max)}</span>
          <span>{formatAxisNumber(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="overflow-x-auto flex-1">
          <div style={{ width }} className="h-48 flex items-end gap-1.5 border-b border-white/10 pb-2">
            {rows.map((row, idx) => (
              <div key={`${row.label}-${idx}`} className="flex-1 min-w-[16px] group h-full flex flex-col relative">
                <div className="h-4 flex items-end justify-center">
                  {showBarValues && (
                    <p className="text-[10px] text-white/70 text-center leading-none">{row.value}</p>
                  )}
                </div>
                <div className="flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t ${colorClass} hover:opacity-80 transition-opacity`}
                    style={{ height: `${Math.max((row.value / max) * 120, 6)}px` }}
                    title={`${row.label}: ${row.value}${row.meta ? ` (${row.meta})` : ""}`}
                  />
                </div>
                <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  <div className="px-2 py-0.5 rounded bg-[#0A0E1A] border border-white/20 text-[10px] text-white/90 whitespace-nowrap shadow">
                    {row.meta || row.value}
                  </div>
                </div>
                {(() => {
                  const [line1, line2] = splitGraphLabelLines(row.label);
                  return (
                    <div className="h-8 mt-1 flex flex-col items-center justify-start leading-tight">
                      <span className="text-[10px] text-white/40 text-center whitespace-nowrap">{line1}</span>
                      <span className="text-[10px] text-white/40 text-center h-3 whitespace-nowrap">{line2 || "\u00A0"}</span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSignedTrendBars = (
    rows: Array<{ label: string; value: number; meta?: string }>,
    positiveColorClass: string,
    negativeColorClass: string,
    emptyText: string,
    minWidth: number = 640
  ) => {
    if (!rows.length) {
      return <p className="text-white/40 text-xs">{emptyText}</p>;
    }

    const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
    const width = Math.max(rows.length * 28, minWidth);

    return (
      <div className="flex gap-2">
        <div className="w-10 shrink-0 h-56 flex flex-col justify-between pt-2 pb-10 text-[10px] text-white/35 text-right">
          <span>{formatAxisNumber(maxAbs)}</span>
          <span>0</span>
          <span>-{formatAxisNumber(maxAbs)}</span>
        </div>
        <div className="overflow-x-auto flex-1">
          <div style={{ width }} className="h-56 border-b border-white/10 pb-2">
            <div className="h-44 relative">
              <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-white/20" />
              <div className="h-full flex items-stretch gap-1.5">
                {rows.map((row, idx) => {
                  const barHeight = row.value === 0 ? 2 : Math.max((Math.abs(row.value) / maxAbs) * 68, 6);
                  const isPositive = row.value >= 0;
                  return (
                    <div key={`${row.label}-${idx}`} className="flex-1 min-w-[16px] h-full relative group">
                      <div
                        className={`absolute left-0 right-0 rounded ${isPositive ? positiveColorClass : negativeColorClass}`}
                        style={
                          isPositive
                            ? { height: `${barHeight}px`, bottom: "50%" }
                            : { height: `${barHeight}px`, top: "50%" }
                        }
                        title={`${row.label}: ${row.value.toFixed(2)}${row.meta ? ` (${row.meta})` : ""}`}
                      />
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="px-2 py-0.5 rounded bg-[#0A0E1A] border border-white/20 text-[10px] text-white/90 whitespace-nowrap shadow">
                          {row.meta || row.value.toFixed(2)}
                        </div>
                      </div>
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="h-8 mt-1 flex gap-1.5">
              {rows.map((row, idx) => (
                <div key={`${row.label}-axis-${idx}`} className="flex-1 min-w-[16px] flex flex-col items-center justify-start leading-tight">
                  {(() => {
                    const [line1, line2] = splitGraphLabelLines(row.label);
                    return (
                      <>
                        <span className="text-[10px] text-white/40 text-center whitespace-nowrap">{line1}</span>
                        <span className="text-[10px] text-white/40 text-center h-3 whitespace-nowrap">{line2 || "\u00A0"}</span>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const hideChartHoverTooltip = (chartId: string) => {
    setChartHoverTooltip((prev) => (prev?.chartId === chartId ? null : prev));
  };

  const renderLineTrend = (
    chartId: string,
    rows: Array<{ label: string; value: number; meta?: string }>,
    lineColorHex: string,
    emptyText: string,
    minWidth: number = 640
  ) => {
    if (!rows.length) {
      return <p className="text-white/40 text-xs">{emptyText}</p>;
    }

    const width = Math.max(rows.length * 36, minWidth);
    const chartHeight = 180;
    const topPad = 10;
    const bottomPad = 14;
    const leftPad = 44;
    const rightPad = 12;
    const plotHeight = chartHeight - topPad - bottomPad;
    const plotWidth = width - leftPad - rightPad;
    const minVal = Math.min(...rows.map((r) => r.value), 0);
    const maxVal = Math.max(...rows.map((r) => r.value), 0);
    const range = Math.max(maxVal - minVal, 1);
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount }, (_, idx) => {
      const value = maxVal - (range * idx) / Math.max(yTickCount - 1, 1);
      return { value, y: topPad + ((maxVal - value) / range) * plotHeight };
    });

    const getX = (idx: number) => leftPad + ((plotWidth * idx) / Math.max(rows.length - 1, 1));
    const getY = (value: number) => topPad + ((maxVal - value) / range) * plotHeight;
    const points = rows.map((row, idx) => `${getX(idx)},${getY(row.value)}`).join(" ");
    const zeroY = getY(0);
    const showLinePointTooltip = (idx: number) => {
      const row = rows[idx];
      if (!row) return;
      const x = getX(idx);
      const y = getY(row.value);
      const placement: "top" | "bottom" = y < 30 ? "bottom" : "top";
      setChartHoverTooltip({
        chartId,
        x,
        y: placement === "bottom" ? y + 10 : y - 10,
        label: "",
        value: row.meta || String(row.value),
        placement,
      });
    };

    return (
      <div className="overflow-x-auto overflow-y-visible" onMouseLeave={() => hideChartHoverTooltip(chartId)}>
        <div style={{ width }} className="relative">
          <svg width={width} height={chartHeight} className="block">
            {yTicks.map((tick, idx) => (
              <g key={`y-tick-${idx}`}>
                <line
                  x1={leftPad}
                  y1={tick.y}
                  x2={width - rightPad}
                  y2={tick.y}
                  stroke="rgba(255,255,255,0.08)"
                />
                <text
                  x={leftPad - 6}
                  y={tick.y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.42)"
                  fontSize="10"
                >
                  {formatAxisNumber(tick.value)}
                </text>
              </g>
            ))}
            <line x1={leftPad} y1={topPad} x2={leftPad} y2={chartHeight - bottomPad} stroke="rgba(255,255,255,0.16)" />
            <line x1={leftPad} y1={zeroY} x2={width - rightPad} y2={zeroY} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
            <polyline
              fill="none"
              stroke={lineColorHex}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
            {rows.length > 1 &&
              rows.slice(0, -1).map((_, idx) => (
                <line
                  key={`hover-segment-${idx}`}
                  x1={getX(idx)}
                  y1={getY(rows[idx].value)}
                  x2={getX(idx + 1)}
                  y2={getY(rows[idx + 1].value)}
                  stroke="transparent"
                  strokeWidth="14"
                  className="cursor-pointer"
                  onMouseMove={(e) => {
                    const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                    if (!svgRect) return;
                    const localX = ((e.clientX - svgRect.left) * width) / svgRect.width;
                    const nearestIdx =
                      Math.abs(localX - getX(idx)) <= Math.abs(localX - getX(idx + 1)) ? idx : idx + 1;
                    showLinePointTooltip(nearestIdx);
                  }}
                  onMouseLeave={() => hideChartHoverTooltip(chartId)}
                />
              ))}
            {rows.map((row, idx) => {
              const x = getX(idx);
              const y = getY(row.value);
              return (
                <g
                  key={`${row.label}-${idx}`}
                  onMouseEnter={() => showLinePointTooltip(idx)}
                  onMouseLeave={() => hideChartHoverTooltip(chartId)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="3"
                    fill={lineColorHex}
                  />
                  <circle cx={x} cy={y} r="10" fill="transparent" className="cursor-pointer" />
                </g>
              );
            })}
          </svg>
          {chartHoverTooltip?.chartId === chartId && (
            <div
              className={`absolute z-20 pointer-events-none -translate-x-1/2 ${
                chartHoverTooltip.placement === "bottom" ? "translate-y-1" : "-translate-y-full"
              }`}
              style={{ left: chartHoverTooltip.x, top: chartHoverTooltip.y }}
            >
              <div className="px-2 py-1 rounded bg-[#0A0E1A] border border-white/20 text-[10px] text-white/90 whitespace-nowrap shadow">
                {chartHoverTooltip.label ? <div className="text-white/60">{chartHoverTooltip.label}</div> : null}
                <div>{chartHoverTooltip.value}</div>
              </div>
            </div>
          )}
          <div className="h-8 mt-1 flex gap-1.5">
            {rows.map((row, idx) => {
              const [line1, line2] = splitGraphLabelLines(row.label);
              return (
                <div key={`${row.label}-axis-${idx}`} className="flex-1 min-w-[16px] flex flex-col items-center leading-tight">
                  <span className="text-[10px] text-white/40 whitespace-nowrap">{line1}</span>
                  <span className="text-[10px] text-white/40 h-3 whitespace-nowrap">{line2 || "\u00A0"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPieTrend = (
    chartId: string,
    rows: Array<{ label: string; value: number; meta?: string }>,
    emptyText: string
  ) => {
    const nonZero = rows
      .map((row) => ({ ...row, abs: Math.abs(row.value) }))
      .filter((row) => row.abs > 0);
    if (!nonZero.length) {
      return <p className="text-white/40 text-xs">{emptyText}</p>;
    }

    const sorted = [...nonZero].sort((a, b) => b.abs - a.abs);
    const top = sorted.slice(0, 8);
    const others = sorted.slice(8);
    const otherSum = others.reduce((acc, row) => acc + row.abs, 0);
    const slices = otherSum > 0 ? [...top, { label: "Others", value: otherSum, abs: otherSum }] : top;

    const total = slices.reduce((acc, row) => acc + row.abs, 0);
    const colors = ["#14b8a6", "#3b82f6", "#84cc16", "#f59e0b", "#ec4899", "#8b5cf6", "#22d3ee", "#f97316", "#6b7280"];

    const size = 160;
    const center = size / 2;
    const outerRadius = 70;
    const innerRadius = 34;

    const polarToCartesian = (angleDeg: number, radius: number) => {
      const angleRad = ((angleDeg - 90) * Math.PI) / 180;
      return {
        x: center + radius * Math.cos(angleRad),
        y: center + radius * Math.sin(angleRad),
      };
    };

    const createDonutArc = (startAngle: number, endAngle: number) => {
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      const outerStart = polarToCartesian(startAngle, outerRadius);
      const outerEnd = polarToCartesian(endAngle, outerRadius);
      const innerStart = polarToCartesian(startAngle, innerRadius);
      const innerEnd = polarToCartesian(endAngle, innerRadius);

      return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        "Z",
      ].join(" ");
    };

    let angleCursor = 0;

    return (
      <div className="flex flex-col md:flex-row gap-4 items-start" onMouseLeave={() => hideChartHoverTooltip(chartId)}>
        <div className="relative w-40 h-40 shrink-0">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 border border-white/10 rounded-full">
            {slices.map((slice, idx) => {
              const pct = total > 0 ? slice.abs / total : 0;
              const startAngle = angleCursor;
              const endAngle = angleCursor + pct * 360;
              angleCursor = endAngle;
              const midAngle = (startAngle + endAngle) / 2;
              const anchor = polarToCartesian(midAngle, (outerRadius + innerRadius) / 2);
              const valueText = slice.meta || (slice.label === "Others" ? formatCurrency(slice.value) : String(slice.value));

              const placement: "top" | "bottom" = anchor.y < 44 ? "bottom" : "top";
              return (
                <path
                  key={`${slice.label}-${idx}`}
                  d={createDonutArc(startAngle, endAngle)}
                  fill={colors[idx % colors.length]}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setChartHoverTooltip({
                      chartId,
                      x: anchor.x,
                      y: placement === "bottom" ? anchor.y + 8 : anchor.y - 8,
                      label: slice.label,
                      value: `${valueText} (${(pct * 100).toFixed(1)}%)`,
                      placement,
                    })
                  }
                  onMouseLeave={() => hideChartHoverTooltip(chartId)}
                />
              );
            })}
          </svg>
          {chartHoverTooltip?.chartId === chartId && (
            <div
              className={`absolute z-20 pointer-events-none -translate-x-1/2 ${
                chartHoverTooltip.placement === "bottom" ? "translate-y-1" : "-translate-y-full"
              }`}
              style={{ left: chartHoverTooltip.x, top: chartHoverTooltip.y }}
            >
              <div className="px-2 py-1 rounded bg-[#0A0E1A] border border-white/20 text-[10px] text-white/90 whitespace-nowrap shadow">
                <div className="text-white/60">{chartHoverTooltip.label}</div>
                <div>{chartHoverTooltip.value}</div>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1 text-xs w-full">
          {slices.map((slice, idx) => {
            const pct = total > 0 ? (slice.abs / total) * 100 : 0;
            return (
              <div key={`${slice.label}-${idx}`} className="flex items-center justify-between gap-3 text-white/70">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                  <span className="truncate">{slice.label}</span>
                </div>
                <span className="text-white/60 whitespace-nowrap">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderChartByStyle = (
    chartKey: string,
    rows: Array<{ label: string; value: number; meta?: string }>,
    colorClass: string,
    emptyText: string,
    minWidth: number = 640,
    showBarValues: boolean = false
  ) => {
    const style = chartStyleByKey[chartKey] || "bar";
    if (style === "line") {
      const hex =
        colorClass.includes("emerald") ? "#10b981" :
        colorClass.includes("lime") ? "#84cc16" :
        colorClass.includes("sky") ? "#38bdf8" :
        "#06b6d4";
      return renderLineTrend(chartKey, rows, hex, emptyText, minWidth);
    }
    if (style === "pie") {
      return renderPieTrend(chartKey, rows, emptyText);
    }
    return renderTrendBars(rows, colorClass, emptyText, minWidth, showBarValues);
  };

  const setChartStyle = (chartKey: string, style: ChartStyle) => {
    setChartStyleByKey((prev) => ({ ...prev, [chartKey]: style }));
  };

  const sourceCards = data
    ? [
        { key: "sales", label: "Sales Source", value: data.sources.sales },
        { key: "ga", label: "Google Analytics", value: data.sources.googleAnalytics },
        { key: "clarity", label: "Microsoft Clarity", value: data.sources.clarity },
        { key: "vercel", label: "Vercel Analytics", value: data.sources.vercelAnalytics },
        { key: "internal", label: "Internal Signals", value: data.sources.internal },
      ]
    : [];

  const trafficSourceBadge = data?.sources.googleAnalytics.connected ? "GA4" : "Internal";
  const salesSourceBadge = data?.sources.sales.connected ? "PayU" : "Supabase";
  const dayModeShortLabel = dayMode === "business_1130_ist" ? "CST" : "IST";
  const dayModeDetailLabel =
    dayMode === "business_1130_ist"
      ? "CST (11:30 IST treated as 12:00 AM)"
      : "IST calendar";

  const chartConfigs = data
    ? {
        "traffic-hourly": {
          title: `Traffic by Hour (${dayModeShortLabel})`,
          subtitle: "Hourly sessions distribution",
          sourceBadge: trafficSourceBadge,
          colorClass: "bg-cyan-500/70",
          emptyText: "No traffic hourly data",
          rows: data.trends.traffic.hourly.map((item) => ({
            label: formatHourRangeLabel(item.label),
            value: item.sessions,
          })),
        },
        "sales-hourly": {
          title: `Sales by Hour (${dayModeShortLabel})`,
          subtitle: "Hourly paid orders distribution",
          sourceBadge: salesSourceBadge,
          colorClass: "bg-emerald-500/70",
          emptyText: "No sales hourly data",
          rows: data.trends.sales.hourly.map((item) => ({
            label: formatHourRangeLabel(item.label),
            value: item.count,
            meta: formatCurrency(item.revenueInr),
          })),
        },
        "traffic-daily": {
          title: "Traffic by Day (Weekday)",
          subtitle: "Total sessions grouped by weekday",
          sourceBadge: trafficSourceBadge,
          colorClass: "bg-sky-500/70",
          emptyText: "No weekday traffic data",
          rows: (data.trends.traffic.weekday || []).map((item) => ({
            label: item.label.slice(0, 3),
            value: item.sessions,
          })),
        },
        "sales-daily": {
          title: "Sales by Day (Weekday)",
          subtitle: "Total paid orders grouped by weekday",
          sourceBadge: salesSourceBadge,
          colorClass: "bg-lime-500/70",
          emptyText: "No daily sales data",
          rows: data.trends.sales.weekday.map((item) => ({
            label: item.label.slice(0, 3),
            value: item.count,
            meta: formatCurrency(item.revenueInr),
          })),
        },
      }
    : null;

  const totalVisitors = data?.funnel?.totalVisitors ?? data?.traffic?.totalSessions ?? data?.kpis?.checkoutStarts ?? 0;
  const totalPaid = data?.funnel?.paidOrders ?? data?.kpis?.paidOrders ?? 0;
  const totalDropOff = data?.funnel?.exitedWithoutPaying ?? Math.max(totalVisitors - totalPaid, 0);
  const totalConversionRate = data?.funnel?.conversionRate ?? (totalVisitors > 0 ? (totalPaid / totalVisitors) * 100 : 0);
  const totalDropOffRate = data?.funnel?.dropOffRate ?? (totalVisitors > 0 ? (totalDropOff / totalVisitors) * 100 : 0);

  const profitabilityRows = matrixRows;
  const profitabilitySourceBadge = matrixAdsSource === "meta" ? "Meta + PayU" : "PayU";

  const profitabilityMatrix = useMemo(() => {
    if (!profitabilityRows.length) return null;

    const getMetricValue = (row: AnalyticsHourlyProfitabilityPoint) =>
      profitMetric === "profit" ? row.profitInr : row.roas;

    const rangeStart = new Date(`${matrixStartDate}T00:00:00`);
    const rangeEnd = new Date(`${matrixEndDate}T00:00:00`);
    const rangeDays =
      Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())
        ? 1
        : Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);

    // <7 days => show each selected date/day as separate columns
    if (rangeDays < 7) {
      const dateColumns: string[] = [];
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        dateColumns.push(cursor.toISOString().split("T")[0]);
        cursor.setDate(cursor.getDate() + 1);
      }

      const groupedByDateHour = new Map<string, number>();
      for (const row of profitabilityRows) {
        groupedByDateHour.set(`${row.date}|${row.hour}`, getMetricValue(row));
      }

      const rowSeries = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: formatHourSlot(hour),
        cells: dateColumns.map((dateKey) => groupedByDateHour.get(`${dateKey}|${hour}`) || 0),
      }));

      const columnTotals = dateColumns.map((_, idx) => {
        const sum = rowSeries.reduce((acc, row) => acc + row.cells[idx], 0);
        return profitMetric === "profit" ? sum : rowSeries.length > 0 ? sum / rowSeries.length : 0;
      });

      const graphByHour = rowSeries.map((row) => {
        const sum = row.cells.reduce((acc, val) => acc + val, 0);
        const avg = row.cells.length > 0 ? sum / row.cells.length : 0;
        return { label: row.label, value: avg };
      });

      const graphByColumn = dateColumns.map((dateKey, idx) => {
        const weekday = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
        return { label: `${weekday} ${formatDayLabel(dateKey)}`, value: columnTotals[idx] || 0 };
      });

      return {
        isSingleDay: rangeDays === 1,
        aggregationMode: rangeDays === 1 ? "single" : "daily",
        columns: dateColumns.map((dateKey) => {
          const weekday = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
          return { key: dateKey, label: `${weekday} ${formatDayLabel(dateKey)}` };
        }),
        rows: rowSeries,
        columnTotals,
        graphByHour,
        graphByColumn,
      };
    }

    const activeWeekdays = WEEKDAY_ORDER.filter((day) => profitabilityRows.some((row) => row.weekday === day));
    const grouped = new Map<string, { sum: number; count: number }>();

    for (const row of profitabilityRows) {
      const key = `${row.weekday}|${row.hour}`;
      const entry = grouped.get(key) || { sum: 0, count: 0 };
      entry.sum += getMetricValue(row);
      entry.count += 1;
      grouped.set(key, entry);
    }

    const rowSeries = Array.from({ length: 24 }, (_, hour) => {
      const cells = activeWeekdays.map((day) => {
        const entry = grouped.get(`${day}|${hour}`);
        return entry && entry.count > 0 ? entry.sum / entry.count : 0;
      });
      return {
        hour,
        label: formatHourSlot(hour),
        cells,
      };
    });

    const columnTotals = activeWeekdays.map((_, idx) => {
      const sum = rowSeries.reduce((acc, row) => acc + row.cells[idx], 0);
      return profitMetric === "profit" ? sum : rowSeries.length > 0 ? sum / rowSeries.length : 0;
    });

    const graphByHour = rowSeries.map((row) => {
      const sum = row.cells.reduce((acc, val) => acc + val, 0);
      const avg = row.cells.length > 0 ? sum / row.cells.length : 0;
      return { label: row.label, value: avg };
    });

    const graphByColumn = activeWeekdays.map((day, idx) => ({
      label: day.slice(0, 3),
      value: columnTotals[idx] || 0,
    }));

    return {
      isSingleDay: false,
      aggregationMode: "weekday-average",
      columns: activeWeekdays.map((day) => ({ key: day, label: day.slice(0, 3) })),
      rows: rowSeries,
      columnTotals,
      graphByHour,
      graphByColumn,
    };
  }, [profitMetric, profitabilityRows, matrixStartDate, matrixEndDate]);

  const routeOptions = data
    ? Array.from(new Set(data.routes.map((row) => row.route))).sort((a, b) => a.localeCompare(b))
    : [];

  useEffect(() => {
    if (!routeOptions.length) {
      setSelectedRoutes([]);
      return;
    }

    setSelectedRoutes((prev) => prev.filter((route) => routeOptions.includes(route)));
  }, [data?.routes]);

  useEffect(() => {
    if (!routeOptions.length) {
      setCustomRouteOrder([]);
      return;
    }

    setCustomRouteOrder((prev) => {
      const sanitized = prev.filter((route) => routeOptions.includes(route));
      const missing = routeOptions.filter((route) => !sanitized.includes(route));
      if (sanitized.length === 0) {
        return [...routeOptions].sort((a, b) => {
          const rankDiff = getWorkflowRank(a) - getWorkflowRank(b);
          return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
        });
      }
      return [...sanitized, ...missing];
    });
  }, [routeOptions.join("|")]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedViews = window.localStorage.getItem("analytics_route_custom_views_v1");
    const savedActiveView = window.localStorage.getItem("analytics_route_custom_active_view_v1");
    const saved = window.localStorage.getItem("analytics_route_custom_order_v1");
    let nextViews: CustomRouteView[] = [];
    let nextActiveView = "";
    let nextOrder: string[] = [];

    if (savedViews) {
      try {
        const parsed = JSON.parse(savedViews);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .filter(
              (item): item is { name: string; order: string[] } =>
                item &&
                typeof item.name === "string" &&
                Array.isArray(item.order)
            )
            .map((item) => ({
              name: item.name,
              order: item.order.filter((route): route is string => typeof route === "string"),
            }))
            .filter((item) => item.name.trim() && item.order.length > 0);
          if (sanitized.length) {
            nextViews = sanitized;
            if (savedActiveView && sanitized.some((item) => item.name === savedActiveView)) {
              nextActiveView = savedActiveView;
              const activeView = sanitized.find((item) => item.name === savedActiveView);
              if (activeView) nextOrder = activeView.order;
            } else {
              nextActiveView = sanitized[0].name;
              nextOrder = sanitized[0].order;
            }
          }
        }
      } catch {
        // ignore corrupt storage
      }
    }

    if (nextViews.length === 0 && saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const order = parsed.filter((item): item is string => typeof item === "string");
          if (order.length > 0) {
            nextViews = [{ name: "Default View", order }];
            nextActiveView = "Default View";
            nextOrder = order;
          }
        }
      } catch {
        // ignore corrupt local storage
      }
    }

    if (nextViews.length > 0) {
      setCustomViews(nextViews);
      setActiveCustomViewName(nextActiveView);
      setCustomViewNameInput(nextActiveView || "My Custom View");
      setCustomRouteOrder(nextOrder);
      setRouteViewMode("custom");
    }
    customViewsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customViewsHydratedRef.current) return;
    if (!customRouteOrder.length) return;
    window.localStorage.setItem("analytics_route_custom_order_v1", JSON.stringify(customRouteOrder));
  }, [customRouteOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customViewsHydratedRef.current) return;
    window.localStorage.setItem("analytics_route_custom_views_v1", JSON.stringify(customViews));
  }, [customViews]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customViewsHydratedRef.current) return;
    if (!activeCustomViewName) return;
    window.localStorage.setItem("analytics_route_custom_active_view_v1", activeCustomViewName);
  }, [activeCustomViewName]);

  useEffect(() => {
    if (!customViewsHydratedRef.current) return;
    if (routeViewMode !== "custom" || !activeCustomViewName || customRouteOrder.length === 0) return;
    setCustomViews((prev) =>
      prev.map((view) => {
        if (view.name !== activeCustomViewName) return view;
        const isSameOrder =
          view.order.length === customRouteOrder.length &&
          view.order.every((route, idx) => route === customRouteOrder[idx]);
        return isSameOrder ? view : { ...view, order: customRouteOrder };
      })
    );
  }, [activeCustomViewName, customRouteOrder, routeViewMode]);

  useEffect(() => {
    if (!routeOptions.length || !customViews.length) return;
    setCustomViews((prev) =>
      prev.map((view) => {
        const sanitized = view.order.filter((route) => routeOptions.includes(route));
        const missing = routeOptions.filter((route) => !sanitized.includes(route));
        return { ...view, order: [...sanitized, ...missing] };
      })
    );
  }, [routeOptions.join("|"), customViews.length]);

  useEffect(() => {
    const start = new Date(`${matrixStartDate}T00:00:00`);
    const end = new Date(`${matrixEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    const diffDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (diffDays === 7 || diffDays === 14 || diffDays === 28) {
      setProfitPeriodDays(diffDays as 7 | 14 | 28);
    }
  }, [matrixStartDate, matrixEndDate]);

  const filteredRoutes = data
    ? data.routes.filter((row) => {
        const matchesSearch = row.route.toLowerCase().includes(routeSearch.toLowerCase());
        const matchesSelection = selectedRoutes.length === 0 || selectedRoutes.includes(row.route);
        return matchesSearch && matchesSelection;
      })
    : [];

  const customOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    customRouteOrder.forEach((route, idx) => map.set(route, idx));
    return map;
  }, [customRouteOrder]);

  const sortedRoutes = [...filteredRoutes].sort((a, b) => {
    if (routeViewMode === "workflow") {
      const rankDiff = getWorkflowRank(a.route) - getWorkflowRank(b.route);
      if (rankDiff !== 0) return rankDiff;
      return a.route.localeCompare(b.route);
    }

    if (routeViewMode === "custom") {
      const aIdx = customOrderMap.get(a.route) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = customOrderMap.get(b.route) ?? Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.route.localeCompare(b.route);
    }

    const aVal = a[routeSortBy];
    const bVal = b[routeSortBy];
    if (typeof aVal === "string" || typeof bVal === "string") {
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return routeSortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    }
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    return routeSortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  const getMetricLabel = () => (profitMetric === "profit" ? "Profit / Loss (INR)" : "ROAS");

  const getMetricFormattedValue = (value: number) => {
    if (profitMetric === "profit") return formatCurrency(value);
    return `${value.toFixed(2)}x`;
  };

  const getHeatCellStyle = (value: number) => {
    if (profitMetric === "roas") {
      const normalized = Math.min(Math.abs(value) / 3, 1);
      const alpha = 0.08 + normalized * 0.28;
      return { backgroundColor: `rgba(56, 189, 248, ${alpha.toFixed(3)})` };
    }

    const normalized = Math.min(Math.abs(value) / 2000, 1);
    const alpha = 0.08 + normalized * 0.32;
    if (value < 0) {
      return { backgroundColor: `rgba(248, 113, 113, ${alpha.toFixed(3)})` };
    }
    return { backgroundColor: `rgba(74, 222, 128, ${alpha.toFixed(3)})` };
  };

  const toInputDate = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split("T")[0];
  };

  const fetchProfitabilityMatrix = async (
    customStartDate?: string,
    customEndDate?: string,
    customDayMode?: MatrixDayMode
  ) => {
    try {
      const token = window.localStorage.getItem("admin_session_token") || window.localStorage.getItem("adminSession");
      if (!token) return;

      const useStart = customStartDate || matrixStartDate;
      const useEnd = customEndDate || matrixEndDate;
      const useDayMode = customDayMode || dayMode;
      const requestSeq = ++matrixFetchSeq.current;

      setMatrixLoading(true);
      const url = `/api/admin/analytics?token=${encodeURIComponent(token)}&startDate=${encodeURIComponent(
        useStart
      )}&endDate=${encodeURIComponent(useEnd)}&matrixDayMode=${encodeURIComponent(useDayMode)}&_matrixTs=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "Failed to fetch matrix data");
      if (requestSeq !== matrixFetchSeq.current) return;

      setMatrixRows(result?.hourlyProfitability?.rows || []);
      setMatrixAdsSource(result?.hourlyProfitability?.adsSource === "meta" ? "meta" : "none");
    } catch (err) {
      console.error("Hourly profitability fetch error:", err);
    } finally {
      setMatrixLoading(false);
    }
  };

  const applyProfitPeriod = (days: 7 | 14 | 28) => {
    setProfitPeriodDays(days);
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    const nextStart = toInputDate(start);
    const nextEnd = toInputDate(end);
    setMatrixStartDate(nextStart);
    setMatrixEndDate(nextEnd);
    fetchProfitabilityMatrix(nextStart, nextEnd, dayMode);
  };

  const handleMatrixStartDateChange = (nextStart: string) => {
    if (!nextStart) return;
    const adjustedEnd = nextStart > matrixEndDate ? nextStart : matrixEndDate;
    setMatrixStartDate(nextStart);
    if (adjustedEnd !== matrixEndDate) setMatrixEndDate(adjustedEnd);
    fetchProfitabilityMatrix(nextStart, adjustedEnd, dayMode);
  };

  const handleMatrixEndDateChange = (nextEnd: string) => {
    if (!nextEnd) return;
    const adjustedStart = nextEnd < matrixStartDate ? nextEnd : matrixStartDate;
    setMatrixEndDate(nextEnd);
    if (adjustedStart !== matrixStartDate) setMatrixStartDate(adjustedStart);
    fetchProfitabilityMatrix(adjustedStart, nextEnd, dayMode);
  };

  const handleMatrixDayModeChange = (mode: MatrixDayMode) => {
    setDayMode(mode);
    fetchProfitabilityMatrix(matrixStartDate, matrixEndDate, mode);
  };

  const maxSelectableBusinessDate = getCurrentBusinessDateIso();
  const maxMonthStart = getMonthStartUtcDate(maxSelectableBusinessDate);
  const secondCalendarMonthStart = useMemo(
    () => shiftMonthStartUtcDate(calendarMonthStart, 1),
    [calendarMonthStart]
  );
  const primaryCalendarCells = useMemo(() => buildMonthGrid(calendarMonthStart), [calendarMonthStart]);
  const secondaryCalendarCells = useMemo(
    () => buildMonthGrid(secondCalendarMonthStart),
    [secondCalendarMonthStart]
  );
  const primaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(calendarMonthStart);
  const secondaryMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: META_IST_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(secondCalendarMonthStart);

  const clampAnalyticsDate = (isoDate: string): string => {
    if (isoDate < analyticsMinRangeStart) return analyticsMinRangeStart;
    if (isoDate > maxSelectableBusinessDate) return maxSelectableBusinessDate;
    return isoDate;
  };

  const handleCalendarDateSelect = (isoDate: string) => {
    if (isoDate < analyticsMinRangeStart || isoDate > maxSelectableBusinessDate) {
      return;
    }
    if (!pickerStartDate || (pickerStartDate && pickerEndDate)) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    if (isoDate < pickerStartDate) {
      setPickerStartDate(isoDate);
      setPickerEndDate("");
      return;
    }
    setPickerEndDate(isoDate);
  };

  const applyAnalyticsRange = () => {
    if (!pickerStartDate) return;
    const normalizedStart = clampAnalyticsDate(pickerStartDate);
    const normalizedEnd = clampAnalyticsDate(pickerEndDate || pickerStartDate);
    const finalStartDate = normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd;
    const finalEndDate = normalizedStart <= normalizedEnd ? normalizedEnd : normalizedStart;
    setStartDate(finalStartDate);
    setEndDate(finalEndDate);
    setIsCalendarOpen(false);
  };

  const selectedRangeLabel = pickerStartDate
    ? `${formatCalendarDateLabel(pickerStartDate)}${
        pickerEndDate ? ` → ${formatCalendarDateLabel(pickerEndDate)}` : ""
      }`
    : "No date selected";

  const activeRangeStart = startDate || pickerStartDate;
  const activeRangeEnd = endDate || pickerEndDate || activeRangeStart;
  const activeRangeButtonLabel =
    activeRangeStart && activeRangeEnd
      ? activeRangeStart === activeRangeEnd
        ? formatCalendarDateShort(activeRangeStart)
        : `${formatCalendarDateShort(activeRangeStart)} - ${formatCalendarDateShort(activeRangeEnd)}`
      : "Select Range";

  const renderCalendarGrid = (cells: CalendarCell[]) => (
    <>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-white/50 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
          <div key={weekday} className="text-center py-1">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isDisabled = cell.isoDate < analyticsMinRangeStart || cell.isoDate > maxSelectableBusinessDate;
          const isStart = pickerStartDate === cell.isoDate;
          const isEnd = pickerEndDate === cell.isoDate;
          const isInRange =
            !!pickerStartDate &&
            !!pickerEndDate &&
            cell.isoDate >= pickerStartDate &&
            cell.isoDate <= pickerEndDate;
          return (
            <button
              key={cell.isoDate}
              onClick={() => handleCalendarDateSelect(cell.isoDate)}
              disabled={isDisabled}
              className={`h-9 rounded-md text-sm transition-colors ${
                isStart || isEnd
                  ? "bg-primary text-white"
                  : isInRange
                  ? "bg-primary/25 text-white"
                  : cell.inCurrentMonth
                  ? "bg-white/5 text-white hover:bg-white/15"
                  : "bg-white/[0.02] text-white/45 hover:bg-white/10"
              } ${isDisabled ? "opacity-30 cursor-not-allowed" : ""}`}
              title={formatCalendarDateLabel(cell.isoDate)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </>
  );

  useEffect(() => {
    if (data?.hourlyProfitability?.rows?.length && matrixRows.length === 0) {
      setMatrixRows(data.hourlyProfitability.rows);
      setMatrixAdsSource(data.hourlyProfitability.adsSource === "meta" ? "meta" : "none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hourlyProfitability?.rows?.length]);

  const moveCustomRoute = (route: string, direction: "up" | "down") => {
    setCustomRouteOrder((prev) => {
      const idx = prev.indexOf(route);
      if (idx < 0) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const saveNamedCustomView = () => {
    const normalizedName = customViewNameInput.trim();
    if (!normalizedName) return;
    setCustomViews((prev) => {
      const existingIdx = prev.findIndex((item) => item.name.toLowerCase() === normalizedName.toLowerCase());
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { name: prev[existingIdx].name, order: customRouteOrder };
        return next;
      }
      return [...prev, { name: normalizedName, order: customRouteOrder }];
    });
    setActiveCustomViewName(normalizedName);
    setRouteViewMode("custom");
    setShowCustomRouteModal(false);
  };

  const selectCustomView = (name: string) => {
    setActiveCustomViewName(name);
    setCustomViewNameInput(name);
    const selected = customViews.find((item) => item.name === name);
    if (selected) {
      setCustomRouteOrder(selected.order);
      setRouteViewMode("custom");
    }
  };

  const renameActiveCustomView = () => {
    const newName = customViewNameInput.trim();
    if (!activeCustomViewName || !newName) return;
    setCustomViews((prev) => {
      if (prev.some((view) => view.name.toLowerCase() === newName.toLowerCase() && view.name !== activeCustomViewName)) {
        return prev;
      }
      return prev.map((view) => (view.name === activeCustomViewName ? { ...view, name: newName } : view));
    });
    setActiveCustomViewName(newName);
  };

  const deleteCustomView = (nameToDelete: string) => {
    if (!nameToDelete) return;
    setCustomViews((prev) => {
      const next = prev.filter((view) => view.name !== nameToDelete);
      if (activeCustomViewName === nameToDelete) {
        if (next.length > 0) {
          setActiveCustomViewName(next[0].name);
          setCustomViewNameInput(next[0].name);
          setCustomRouteOrder(next[0].order);
          setRouteViewMode("custom");
        } else {
          setActiveCustomViewName("");
          setCustomViewNameInput("My Custom View");
          setRouteViewMode("workflow");
        }
      }
      return next;
    });
  };

  const handleDragStartRoute = (route: string) => {
    setDraggedRoute(route);
  };

  const handleDropRoute = (targetRoute: string) => {
    if (!draggedRoute || draggedRoute === targetRoute) {
      setDraggedRoute(null);
      setDragOverRoute(null);
      return;
    }

    setCustomRouteOrder((prev) => {
      const fromIndex = prev.indexOf(draggedRoute);
      const toIndex = prev.indexOf(targetRoute);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    setDraggedRoute(null);
    setDragOverRoute(null);
  };

  const resetCustomViewToWorkflow = () => {
    const ordered = [...routeOptions].sort((a, b) => {
      const rankDiff = getWorkflowRank(a) - getWorkflowRank(b);
      return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    });
    setCustomRouteOrder(ordered);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap items-end gap-4">
          <div ref={analyticsCalendarDropdownRef} className="relative">
            <label className="text-white/50 text-xs mb-1 block">Custom Range</label>
            <button
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              className="px-3 py-2 rounded-lg text-sm border bg-white/5 border-white/10 text-white/70 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              {activeRangeButtonLabel}
            </button>
            {isCalendarOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[92vw] sm:w-[680px] max-w-[92vw] rounded-2xl border border-white/15 bg-[#1A2235] shadow-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/80 text-sm font-medium">Custom Range</p>
                  <button
                    onClick={() => setIsCalendarOpen(false)}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Close custom range picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setCalendarMonthStart((prev) => shiftMonthStartUtcDate(prev, -1))}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-white text-sm font-medium">Select Date Range</p>
                  <button
                    onClick={() => setCalendarMonthStart((prev) => shiftMonthStartUtcDate(prev, 1))}
                    disabled={secondCalendarMonthStart.getTime() >= maxMonthStart.getTime()}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-white/75 text-sm font-medium mb-2">{primaryMonthLabel}</p>
                    {renderCalendarGrid(primaryCalendarCells)}
                  </div>
                  <div>
                    <p className="text-white/75 text-sm font-medium mb-2">{secondaryMonthLabel}</p>
                    {renderCalendarGrid(secondaryCalendarCells)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-white/50 text-xs mb-1 block">Start Date (type)</label>
                    <input
                      type="date"
                      value={pickerStartDate}
                      min={analyticsMinRangeStart}
                      max={maxSelectableBusinessDate}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          setPickerStartDate("");
                          setPickerEndDate("");
                          return;
                        }
                        const nextStart = clampAnalyticsDate(raw);
                        setPickerStartDate(nextStart);
                        if (pickerEndDate && pickerEndDate < nextStart) {
                          setPickerEndDate("");
                        }
                        setCalendarMonthStart(getMonthStartUtcDate(nextStart));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs mb-1 block">End Date (type)</label>
                    <input
                      type="date"
                      value={pickerEndDate}
                      min={analyticsMinRangeStart}
                      max={maxSelectableBusinessDate}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          setPickerEndDate("");
                          return;
                        }
                        const nextEnd = clampAnalyticsDate(raw);
                        setPickerEndDate(nextEnd);
                        if (!pickerStartDate) {
                          setPickerStartDate(nextEnd);
                        }
                        setCalendarMonthStart(getMonthStartUtcDate(nextEnd));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50 [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-white/60">
                    Selected: <span className="text-white/90">{selectedRangeLabel}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPickerStartDate(startDate);
                        setPickerEndDate(endDate);
                        if (endDate || startDate) {
                          setCalendarMonthStart(getMonthStartUtcDate(endDate || startDate));
                        }
                      }}
                      className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={applyAnalyticsRange}
                      disabled={!pickerStartDate}
                      className="px-3 py-1.5 text-xs rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors disabled:opacity-50"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">Day Mode</label>
            <select
              value={dayMode}
              onChange={(e) => {
                const mode = e.target.value as MatrixDayMode;
                setDayMode(mode);
                fetchProfitabilityMatrix(matrixStartDate, matrixEndDate, mode);
              }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="calendar_ist">IST (00:00 - 23:59)</option>
              <option value="business_1130_ist">CST (11:30 IST - next 11:29)</option>
            </select>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-primary/80 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {data?.range && (
          <p className="text-white/30 text-xs mt-3">
            Timezone: {data.range.timezone} | Day Mode: {dayModeDetailLabel} | Range: {data.range.startDate} to {data.range.endDate}
          </p>
        )}
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-[#1A2235] rounded-xl p-10 border border-white/10 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-white/60 text-sm">Loading analytics...</span>
        </div>
      ) : !data ? (
        <div className="bg-[#1A2235] rounded-xl p-10 border border-white/10 text-center text-white/50 text-sm">
          No analytics data available yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <KPICard
              title="Paid Revenue"
              value={formatCurrency(data.kpis.paidRevenueInr)}
              subtitle="From paid/success/captured"
              color="text-green-400"
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <KPICard
              title="Paid Orders"
              value={String(data.kpis.paidOrders)}
              color="text-blue-400"
              icon={<CheckCircle className="w-4 h-4" />}
            />
            <KPICard
              title="Total Visitors"
              value={String(totalVisitors)}
              color="text-white"
              icon={<MousePointerClick className="w-4 h-4" />}
            />
            <KPICard
              title="Visitors → Paid"
              value={`${totalConversionRate.toFixed(2)}%`}
              color="text-amber-400"
              icon={<Target className="w-4 h-4" />}
            />
            <KPICard
              title="Total Sessions"
              value={String(data.traffic.totalSessions)}
              color="text-cyan-400"
              icon={<Users className="w-4 h-4" />}
            />
            <KPICard
              title="Overall Bounce"
              value={`${data.traffic.overallBounceRate.toFixed(2)}%`}
              color="text-red-400"
              icon={<TrendingDown className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricCard
              title="Peak Traffic Hour"
              value={`${formatHourRangeLabel(data.peaks.traffic.hour.label)} ${dayModeShortLabel} (${data.peaks.traffic.hour.sessions} sessions)`}
              color="text-white"
            />
            <MetricCard
              title="Peak Sales Hour"
              value={`${formatHourRangeLabel(data.peaks.sales.hour.label)} ${dayModeShortLabel} (${data.peaks.sales.hour.count} sales)`}
              subtitle={formatCurrency(data.peaks.sales.hour.revenueInr)}
              color="text-white"
            />
            <MetricCard
              title="Peak Traffic Day"
              value={`${data.peaks.traffic.day.label} (${data.peaks.traffic.day.sessions} sessions)`}
              color="text-white"
            />
            <MetricCard
              title="Peak Sales Day"
              value={`${data.peaks.sales.day.label} (${data.peaks.sales.day.count} sales)`}
              subtitle={formatCurrency(data.peaks.sales.day.revenueInr)}
              color="text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {chartConfigs && (
              <>
                {(Object.keys(chartConfigs) as AnalyticsChartKey[]).map((key) => {
                  const chart = chartConfigs[key];
                  return (
                    <div key={key} className="bg-[#1A2235] rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-white/70 text-sm font-medium">{chart.title}</h3>
                        <div className="flex items-center gap-2">
                          <select
                            value={chartStyleByKey[key] || "bar"}
                            onChange={(e) => setChartStyle(key, e.target.value as ChartStyle)}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/70 focus:outline-none"
                          >
                            <option value="bar">Bar</option>
                            <option value="line">Line</option>
                            <option value="pie">Pie</option>
                          </select>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                            {chart.sourceBadge}
                          </span>
                          <button
                            onClick={() => setExpandedChart(key)}
                            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Expand
                          </button>
                        </div>
                      </div>
                      <p className="text-white/40 text-xs mb-3">{chart.subtitle}</p>
                      {renderChartByStyle(key, chart.rows, chart.colorClass, chart.emptyText, 640, key.startsWith("sales"))}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {expandedChart && chartConfigs && (
            <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center">
              <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[#10192C] rounded-xl border border-white/15 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white text-lg font-semibold">{chartConfigs[expandedChart].title}</h3>
                    <select
                      value={chartStyleByKey[expandedChart] || "bar"}
                      onChange={(e) => setChartStyle(expandedChart, e.target.value as ChartStyle)}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none"
                    >
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="pie">Pie</option>
                    </select>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                      {chartConfigs[expandedChart].sourceBadge}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedChart(null)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-sm"
                  >
                    Close
                  </button>
                </div>
                <p className="text-white/50 text-sm mb-4">{chartConfigs[expandedChart].subtitle}</p>
                {renderChartByStyle(
                  expandedChart,
                  chartConfigs[expandedChart].rows,
                  chartConfigs[expandedChart].colorClass,
                  chartConfigs[expandedChart].emptyText,
                  1800,
                  expandedChart.startsWith("sales")
                )}
              </div>
            </div>
          )}

          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white/70 text-sm font-medium">Hourly Profitability Matrix</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">{profitabilitySourceBadge}</span>
                </div>
                <p className="text-white/40 text-xs mt-1">
                  Single date shows that day. Multi-date range shows weekday averages. Active mode: {dayMode === "business_1130_ist" ? "CST (11:30 IST treated as 12:00 AM)" : "IST calendar day"}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={matrixStartDate}
                  onChange={(e) => handleMatrixStartDateChange(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50 [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={matrixEndDate}
                  onChange={(e) => handleMatrixEndDateChange(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50 [color-scheme:dark]"
                />
                <button
                  type="button"
                  onClick={() => fetchProfitabilityMatrix(matrixStartDate, matrixEndDate, dayMode)}
                  disabled={matrixLoading}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${matrixLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <select
                  value={dayMode}
                  onChange={(e) => handleMatrixDayModeChange(e.target.value as MatrixDayMode)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                >
                  <option value="calendar_ist">Day Mode: IST (00:00-23:59)</option>
                  <option value="business_1130_ist">Day Mode: CST (11:30 IST → next 11:29)</option>
                </select>
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                  {[7, 14, 28].map((days) => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => applyProfitPeriod(days as 7 | 14 | 28)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        profitPeriodDays === days ? "bg-primary text-white" : "text-white/70 hover:bg-white/10"
                      }`}
                    >
                      Last {days}d
                    </button>
                  ))}
                </div>
                <select
                  value={profitMetric}
                  onChange={(e) => setProfitMetric(e.target.value as ProfitMetric)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                >
                  <option value="profit">Metric: Profit / Loss</option>
                  <option value="roas">Metric: ROAS</option>
                </select>
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setProfitView("table")}
                    className={`px-2 py-1 text-xs rounded ${profitView === "table" ? "bg-primary text-white" : "text-white/70 hover:bg-white/10"}`}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfitView("graph")}
                    className={`px-2 py-1 text-xs rounded ${profitView === "graph" ? "bg-primary text-white" : "text-white/70 hover:bg-white/10"}`}
                  >
                    Graph
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4">
              {!profitabilityMatrix ? (
                <p className="text-white/40 text-sm">No profitability data available for this range.</p>
              ) : profitView === "table" ? (
                <div className="overflow-auto max-h-[560px] border border-white/10 rounded-lg">
                  <table className="w-full min-w-[760px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#202A40] border-b border-white/10">
                        <th className="text-left text-white/60 text-xs font-medium px-3 py-2">Hour ({dayModeShortLabel})</th>
                        {profitabilityMatrix.columns.map((col) => (
                          <th key={col.key} className="text-right text-white/60 text-xs font-medium px-3 py-2">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {profitabilityMatrix.rows.map((row) => (
                        <tr key={row.hour} className="border-b border-white/5">
                          <td className="text-white/70 text-xs px-3 py-2 bg-white/5 whitespace-nowrap">{row.label}</td>
                          {row.cells.map((value, idx) => (
                            <td
                              key={`${row.hour}-${idx}`}
                              style={getHeatCellStyle(value)}
                              className={`text-right text-xs px-3 py-2 ${
                                profitMetric === "profit"
                                  ? value >= 0
                                    ? "text-green-300"
                                    : "text-red-300"
                                  : "text-cyan-200"
                              }`}
                            >
                              {profitMetric === "profit" ? value.toFixed(2) : `${value.toFixed(2)}x`}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-white/5 border-t border-white/10">
                        <td className="text-white font-semibold text-xs px-3 py-2">TOTAL / AVG</td>
                        {profitabilityMatrix.columnTotals.map((value, idx) => (
                          <td
                            key={`total-${idx}`}
                            className={`text-right text-xs font-semibold px-3 py-2 ${
                              profitMetric === "profit"
                                ? value >= 0
                                  ? "text-green-300"
                                  : "text-red-300"
                                : "text-cyan-200"
                            }`}
                          >
                            {profitMetric === "profit" ? value.toFixed(2) : `${value.toFixed(2)}x`}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#141C2F] rounded-lg border border-white/10 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-white/70 text-xs font-medium">{getMetricLabel()} by Hour (avg)</h4>
                      <select
                        value={chartStyleByKey["profit-hour"] || "bar"}
                        onChange={(e) => setChartStyle("profit-hour", e.target.value as ChartStyle)}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/70 focus:outline-none"
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="pie">Pie</option>
                      </select>
                    </div>
                    <p className="text-white/40 text-[11px] mb-2">Average across selected dates.</p>
                    {(() => {
                      const rows = profitabilityMatrix.graphByHour.map((item) => ({
                        label: item.label,
                        value: Number(item.value.toFixed(2)),
                        meta: getMetricFormattedValue(item.value),
                      }));
                      const style = chartStyleByKey["profit-hour"] || "bar";
                      if (profitMetric === "profit") {
                        if (style === "line") return renderLineTrend("profit-hour", rows, "#34d399", "No hourly profitability data", 720);
                        if (style === "pie") return renderPieTrend("profit-hour", rows, "No hourly profitability data");
                        return renderSignedTrendBars(rows, "bg-emerald-500/80", "bg-rose-500/80", "No hourly profitability data", 720);
                      }
                      return renderChartByStyle("profit-hour", rows, "bg-cyan-500/70", "No hourly profitability data", 720, false);
                    })()}
                  </div>
                  <div className="bg-[#141C2F] rounded-lg border border-white/10 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-white/70 text-xs font-medium">{getMetricLabel()} by Day</h4>
                      <select
                        value={chartStyleByKey["profit-day"] || "bar"}
                        onChange={(e) => setChartStyle("profit-day", e.target.value as ChartStyle)}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/70 focus:outline-none"
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="pie">Pie</option>
                      </select>
                    </div>
                    <p className="text-white/40 text-[11px] mb-2">
                      {profitabilityMatrix.aggregationMode === "single"
                        ? "Selected day total"
                        : profitabilityMatrix.aggregationMode === "daily"
                        ? "Per-day breakdown for selected range"
                        : "Weekday averages for selected period"}
                    </p>
                    {(() => {
                      const rows = profitabilityMatrix.graphByColumn.map((item) => ({
                        label: item.label,
                        value: Number(item.value.toFixed(2)),
                        meta: getMetricFormattedValue(item.value),
                      }));
                      const style = chartStyleByKey["profit-day"] || "bar";
                      if (profitMetric === "profit") {
                        if (style === "line") return renderLineTrend("profit-day", rows, "#84cc16", "No day-level profitability data", 360);
                        if (style === "pie") return renderPieTrend("profit-day", rows, "No day-level profitability data");
                        return renderSignedTrendBars(rows, "bg-lime-500/80", "bg-red-500/80", "No day-level profitability data", 360);
                      }
                      return renderChartByStyle("profit-day", rows, "bg-sky-500/70", "No day-level profitability data", 360, false);
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {sourceCards.map((item) => (
              <div key={item.key} className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/60 text-xs">{item.label}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.value.connected
                        ? "bg-green-500/20 text-green-400"
                        : item.value.configured
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {item.value.connected ? "Live" : item.value.configured ? "Configured" : "Missing"}
                  </span>
                </div>
                <p className="text-white/40 text-xs leading-relaxed">{item.value.message}</p>
              </div>
            ))}
          </div>

          {data.notes?.length > 0 && (
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10 space-y-1">
              {data.notes.map((note, idx) => (
                <p key={idx} className="text-white/50 text-xs">
                  - {note}
                </p>
              ))}
            </div>
          )}

          <div className="bg-[#1A2235] rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white/70 text-sm font-medium">Checkout Funnel</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">Visitors</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard title="Total Visitors" value={String(totalVisitors)} color="text-white" />
              <MetricCard title="Subscribed/Paid" value={String(totalPaid)} color="text-green-400" />
              <MetricCard title="Left Without Paying" value={String(totalDropOff)} color="text-red-400" />
              <MetricCard title="Conversion Rate" value={`${totalConversionRate.toFixed(2)}%`} color="text-amber-400" />
              <MetricCard title="Drop-off Rate" value={`${totalDropOffRate.toFixed(2)}%`} color="text-rose-300" />
            </div>
            {data.funnel?.paywallRoute && (
              <p className="text-white/35 text-xs mt-3">
                Paywall route used: {data.funnel.paywallRoute}
              </p>
            )}
          </div>

          <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="flex flex-wrap items-end gap-3 justify-between">
                <div>
                  <h3 className="text-white/70 text-sm font-medium">Route-Level Analytics</h3>
                  <p className="text-white/40 text-xs mt-1">
                    Visitors, bounce rate and engagement by route.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <select
                    value={routeViewMode}
                    onChange={(e) => setRouteViewMode(e.target.value as RouteViewMode)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                  >
                    <option value="workflow">View: Workflow</option>
                    <option value="performance">View: Performance</option>
                    <option value="custom">View: Custom</option>
                  </select>
                  {routeViewMode === "custom" && customViews.length > 0 && (
                    <select
                      value={activeCustomViewName}
                      onChange={(e) => selectCustomView(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                    >
                      {customViews.map((view) => (
                        <option key={view.name} value={view.name}>
                          {view.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCustomViewName) setCustomViewNameInput(activeCustomViewName);
                      setShowCustomRouteModal(true);
                    }}
                    className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs"
                  >
                    Edit Custom View
                  </button>
                  <input
                    type="text"
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    placeholder="Filter route..."
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowRouteDropdown((prev) => !prev)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs hover:bg-white/10 flex items-center gap-1"
                    >
                      Routes: {selectedRoutes.length === 0 ? "All" : selectedRoutes.length}
                      <ChevronDown className={`w-3 h-3 transition-transform ${showRouteDropdown ? "rotate-180" : ""}`} />
                    </button>
                    {showRouteDropdown && (
                      <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-[#10192C] border border-white/15 rounded-lg shadow-2xl z-30">
                        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                          <p className="text-white/60 text-xs">Select multiple routes</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRoutes(routeOptions)}
                              className="text-[11px] text-primary hover:text-primary/80"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRoutes([])}
                              className="text-[11px] text-white/60 hover:text-white/80"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                          {routeOptions.length === 0 ? (
                            <p className="text-white/40 text-xs px-2 py-2">No routes available</p>
                          ) : (
                            routeOptions.map((route) => {
                              const checked = selectedRoutes.includes(route);
                              return (
                                <button
                                  type="button"
                                  key={route}
                                  onClick={() =>
                                    setSelectedRoutes((prev) =>
                                      checked ? prev.filter((r) => r !== route) : [...prev, route]
                                    )
                                  }
                                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                                    checked ? "bg-primary/20 text-primary" : "text-white/75 hover:bg-white/5"
                                  }`}
                                >
                                  <input type="checkbox" readOnly checked={checked} className="accent-primary" />
                                  <span className="truncate">{route}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {routeViewMode === "performance" && (
                    <>
                      <select
                        value={routeSortBy}
                        onChange={(e) => setRouteSortBy(e.target.value as typeof routeSortBy)}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-primary/50"
                      >
                        <option value="viewers">Sort: Viewers</option>
                        <option value="pageViews">Sort: Page Views</option>
                        <option value="bounceRate">Sort: Bounce Rate</option>
                        <option value="avgSessionDurationSec">Sort: Avg Duration</option>
                        <option value="bounces">Sort: Bounces</option>
                        <option value="route">Sort: Route</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setRouteSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                        className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs"
                      >
                        {routeSortDir === "asc" ? "Asc" : "Desc"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {selectedRoutes.length > 0 && (
                <p className="text-white/35 text-xs mt-2">
                  Showing {selectedRoutes.length} selected route{selectedRoutes.length > 1 ? "s" : ""}.
                </p>
              )}
              {routeViewMode !== "performance" && (
                <p className="text-white/35 text-xs mt-1">
                  Sort mode: {routeViewMode === "workflow" ? "App workflow order" : `Custom route order${activeCustomViewName ? ` (${activeCustomViewName})` : ""}`}.
                </p>
              )}
            </div>
            <div className="overflow-x-auto overflow-y-auto h-[420px] md:h-[520px]">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-white/10 bg-[#202A40]">
                    <th className="text-left text-white/60 text-xs font-medium px-4 py-3">Route</th>
                    <th className="text-right text-white/60 text-xs font-medium px-4 py-3">Viewers</th>
                    <th className="text-right text-white/60 text-xs font-medium px-4 py-3">Page Views</th>
                    <th className="text-right text-white/60 text-xs font-medium px-4 py-3">Bounce Rate</th>
                    <th className="text-right text-white/60 text-xs font-medium px-4 py-3">Avg Duration</th>
                    <th className="text-right text-white/60 text-xs font-medium px-4 py-3">Bounces</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoutes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-white/40 py-8 text-sm">
                        No routes match this filter.
                      </td>
                    </tr>
                  ) : (
                    sortedRoutes.map((row) => (
                      <tr key={row.route} className="border-b border-white/5 hover:bg-white/5">
                        <td className="text-white/80 text-sm px-4 py-3">{row.route}</td>
                        <td className="text-white text-sm px-4 py-3 text-right">{row.viewers}</td>
                        <td className="text-white/80 text-sm px-4 py-3 text-right">{row.pageViews}</td>
                        <td className="text-red-400 text-sm px-4 py-3 text-right">{row.bounceRate.toFixed(2)}%</td>
                        <td className="text-blue-400 text-sm px-4 py-3 text-right">{formatDuration(row.avgSessionDurationSec)}</td>
                        <td className="text-rose-300 text-sm px-4 py-3 text-right">{row.bounces}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showCustomRouteModal && typeof window !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-[120] bg-black/70 p-4 flex items-center justify-center">
                <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-[#10192C] rounded-xl border border-white/15 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white text-lg font-semibold">Custom Route View</h3>
                    <p className="text-white/45 text-xs mt-1">Drag routes to control table order, then save as a named view.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomRouteModal(false)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mb-3">
                  <label className="text-white/55 text-xs mb-1 block">Custom View Name</label>
                  <input
                    type="text"
                    value={customViewNameInput}
                    onChange={(e) => setCustomViewNameInput(e.target.value)}
                    placeholder="e.g. Onboarding Flow"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={renameActiveCustomView}
                    disabled={!activeCustomViewName || !customViewNameInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs disabled:opacity-40"
                  >
                    Edit/Rename View
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomView(activeCustomViewName || customViewNameInput.trim())}
                    disabled={!activeCustomViewName && !customViewNameInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs disabled:opacity-40"
                  >
                    Delete View
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={resetCustomViewToWorkflow}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs"
                  >
                    Reset to Workflow
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomRouteOrder(routeOptions)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs"
                  >
                    Reset Alphabetical
                  </button>
                </div>

                <div className="space-y-1 max-h-[58vh] overflow-y-auto pr-1">
                  {customRouteOrder.map((route, idx) => (
                    <div
                      key={route}
                      draggable
                      onDragStart={() => handleDragStartRoute(route)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverRoute !== route) setDragOverRoute(route);
                      }}
                      onDrop={() => handleDropRoute(route)}
                      onDragEnd={() => {
                        setDraggedRoute(null);
                        setDragOverRoute(null);
                      }}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 border transition-colors ${
                        dragOverRoute === route && draggedRoute !== route ? "border-primary/70 bg-primary/10" : "border-white/10"
                      } ${draggedRoute === route ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="w-4 h-4 text-white/35 shrink-0 cursor-grab" />
                        <span className="text-white/35 text-xs w-6 shrink-0">{idx + 1}</span>
                        <span className="text-white/80 text-sm truncate">{route}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCustomRoute(route, "up")}
                          disabled={idx === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 text-xs disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCustomRoute(route, "down")}
                          disabled={idx === customRouteOrder.length - 1}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 text-xs disabled:opacity-40"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={saveNamedCustomView}
                    className="px-3 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm"
                  >
                    Save Custom View
                  </button>
                </div>
                </div>
              </div>,
              document.body
            )}
        </>
      )}
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

function MetaAdsSection({
  metaAds,
  metaLoading,
  metaDatePreset,
  setMetaDatePreset,
  showMetaCampaigns,
  setShowMetaCampaigns,
  formatCurrency,
  onRefresh,
  onCustomDateRefresh,
}: {
  metaAds: MetaAdsData | null;
  metaLoading: boolean;
  metaDatePreset: string;
  setMetaDatePreset: (v: string) => void;
  showMetaCampaigns: boolean;
  setShowMetaCampaigns: (v: boolean) => void;
  formatCurrency: (v: string | number) => string;
  onRefresh: () => void;
  onCustomDateRefresh: (startDate: string, endDate: string) => void;
}) {
  const [showInINR, setShowInINR] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(93.32); // Default fallback
  const [rateLoading, setRateLoading] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState<string>("93.32");
  
  // Custom date range for Meta Ads
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  const [metaStartDate, setMetaStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [metaEndDate, setMetaEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Fetch real-time exchange rate
  const fetchExchangeRate = async () => {
    try {
      setRateLoading(true);
      const res = await fetch("/api/exchange-rate");
      if (res.ok) {
        const data = await res.json();
        if (data.rate) {
          setExchangeRate(data.rate);
          setRateInput(data.rate.toFixed(2));
        }
      }
    } catch (err) {
      console.error("Failed to fetch exchange rate:", err);
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    fetchExchangeRate();
  }, []);

  const handleRateChange = (value: string) => {
    setRateInput(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      setExchangeRate(num);
    }
  };

  const formatNum = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString();
  };

  const formatMetaCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (showInINR) {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(num * exchangeRate);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const datePresetLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_3d: "Last 3 Days",
    last_7d: "Last 7 Days",
    last_14d: "Last 14 Days",
    last_30d: "Last 30 Days",
    this_month: "This Month",
    last_month: "Last Month",
    last_90d: "Last 90 Days",
  };

  // Handle custom date range fetch
  const handleCustomDateFetch = () => {
    if (metaStartDate && metaEndDate) {
      setUseCustomDateRange(true);
      onCustomDateRefresh(metaStartDate, metaEndDate);
    }
  };

  return (
    <section>
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white/70 text-sm font-medium flex items-center gap-2">
            <Megaphone className="w-4 h-4" /> Meta / Facebook Ads
            <span className="text-white/30 text-xs ml-2">(Timezone: Ad Account - IST)</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseCustomDateRange(!useCustomDateRange)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                useCustomDateRange 
                  ? "bg-blue-500/30 text-blue-300 border border-blue-500/50" 
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
              }`}
            >
              {useCustomDateRange ? "Custom Range" : "Custom Range"}
            </button>
            {!useCustomDateRange && (
              <select
                value={metaDatePreset}
                onChange={(e) => setMetaDatePreset(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary/50"
              >
                {Object.entries(datePresetLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            )}
            <button
              onClick={onRefresh}
              disabled={metaLoading}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-white ${metaLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        
        {/* Custom Date Range Picker */}
        {useCustomDateRange && (
          <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs">From:</label>
              <input
                type="date"
                value={metaStartDate}
                onChange={(e) => setMetaStartDate(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white/50 text-xs">To:</label>
              <input
                type="date"
                value={metaEndDate}
                onChange={(e) => setMetaEndDate(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={handleCustomDateFetch}
              disabled={metaLoading}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors disabled:opacity-50"
            >
              {metaLoading ? "Loading..." : "Apply"}
            </button>
          </div>
        )}
      </div>

      {metaLoading && !metaAds && (
        <div className="bg-[#1A2235] rounded-xl p-8 border border-white/10 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <p className="text-white/40 text-sm">Loading Meta Ads data...</p>
        </div>
      )}

      {metaAds && !metaAds.configured && (
        <div className="bg-[#1A2235] rounded-xl p-6 border border-white/10 text-center">
          <Megaphone className="w-10 h-10 text-blue-400/40 mx-auto mb-3" />
          <p className="text-white/60 text-sm mb-2">Meta Ads not configured</p>
          <p className="text-white/40 text-xs">
            Add <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300">META_ACCESS_TOKEN</code> and{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300">META_AD_ACCOUNT_IDS</code> (comma-separated), and optionally <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300">META_ACCESS_TOKENS_BY_ACCOUNT</code> for per-account tokens.
          </p>
        </div>
      )}

      {metaAds && metaAds.configured && metaAds.error && (
        <div className="bg-[#1A2235] rounded-xl p-6 border border-red-500/20 text-center">
          <ShieldAlert className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
          <p className="text-white/60 text-sm mb-1">Meta API Error</p>
          <p className="text-red-400/80 text-xs">{metaAds.error}</p>
        </div>
      )}

      {metaAds && metaAds.configured && !metaAds.error && metaAds.account && (
        <div className="space-y-4">
          {/* Ad Spend & Performance KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A2235] rounded-xl p-4 border border-blue-500/20"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs">Ad Spend</span>
                <button
                  onClick={() => setShowInINR(!showInINR)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 transition-colors text-blue-400 text-xs"
                  title={showInINR ? `Click to show USD (Rate: $1 = ₹${exchangeRate.toFixed(2)})` : `Click to show INR (Rate: $1 = ₹${exchangeRate.toFixed(2)})`}
                >
                  {showInINR ? "₹" : "$"}
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xl font-bold text-blue-400">{formatMetaCurrency(metaAds.account.spend)}</p>
              <p className="text-white/40 text-xs mt-1">{datePresetLabels[metaDatePreset]}</p>
              {showInINR && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-white/30 text-xs">$1 = ₹</span>
                  <input
                    type="number"
                    value={rateInput}
                    onChange={(e) => handleRateChange(e.target.value)}
                    className="w-16 bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-400"
                    step="0.01"
                    min="1"
                  />
                  <button
                    onClick={fetchExchangeRate}
                    disabled={rateLoading}
                    className="p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                    title="Fetch live rate"
                  >
                    <RefreshCw className={`w-3 h-3 text-white/60 ${rateLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A2235] rounded-xl p-4 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs">Impressions</span>
                <Eye className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-bold text-purple-400">{formatNum(metaAds.account.impressions)}</p>
              <p className="text-white/40 text-xs mt-1">CPM: {formatMetaCurrency(metaAds.account.cpm)}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A2235] rounded-xl p-4 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs">Link Clicks</span>
                <MousePointerClick className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-xl font-bold text-cyan-400">{formatNum(metaAds.account.linkClicks || metaAds.account.clicks)}</p>
              <p className="text-white/40 text-xs mt-1">CPC: {formatMetaCurrency(metaAds.account.costPerLinkClick || metaAds.account.cpc)}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A2235] rounded-xl p-4 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-xs">Reach</span>
                <Users className="w-4 h-4 text-green-400" />
              </div>
              <p className="text-xl font-bold text-green-400">{formatNum(metaAds.account.reach)}</p>
              <p className="text-white/40 text-xs mt-1">Freq: {metaAds.account.frequency.toFixed(2)}</p>
            </motion.div>
          </div>

          {/* Conversion Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
              <p className="text-white/50 text-xs mb-1">CTR</p>
              <p className="text-lg font-semibold text-white">{metaAds.account.ctr.toFixed(2)}%</p>
            </div>
            <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
              <p className="text-white/50 text-xs mb-1">Page Views</p>
              <p className="text-lg font-semibold text-white">{formatNum(metaAds.account.pageViews)}</p>
            </div>
            <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
              <p className="text-white/50 text-xs mb-1">Leads</p>
              <p className="text-lg font-semibold text-amber-400">{formatNum(metaAds.account.leads)}</p>
              {metaAds.account.costPerLead > 0 && (
                <p className="text-white/40 text-xs">CPL: {formatMetaCurrency(metaAds.account.costPerLead)}</p>
              )}
            </div>
            <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
              <p className="text-white/50 text-xs mb-1">Purchases</p>
              <p className="text-lg font-semibold text-green-400">{formatNum(metaAds.account.purchases)}</p>
              {metaAds.account.costPerPurchase > 0 && (
                <p className="text-white/40 text-xs">CPA: {formatMetaCurrency(metaAds.account.costPerPurchase)}</p>
              )}
            </div>
            <div className="bg-[#1A2235] rounded-xl p-3 border border-white/10">
              <p className="text-white/50 text-xs mb-1">ROAS</p>
              <p className="text-lg font-semibold text-white">
                {metaAds.account.spend > 0 && metaAds.account.purchases > 0
                  ? "—"
                  : "N/A"}
              </p>
              <p className="text-white/40 text-xs">Return on Ad Spend</p>
            </div>
          </div>

          {/* Daily Ad Spend Chart */}
          {metaAds.dailyBreakdown && metaAds.dailyBreakdown.length > 0 && (
            <div className="bg-[#1A2235] rounded-xl p-4 border border-white/10">
              <h3 className="text-white/60 text-xs mb-3">Daily Ad Spend</h3>
              <div className="flex items-end gap-1 h-32">
                {(() => {
                  const maxSpend = Math.max(...metaAds.dailyBreakdown!.map((d) => d.spend), 1);
                  return metaAds.dailyBreakdown!.map((day) => (
                    <div
                      key={day.date}
                      className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 transition-colors rounded-t relative group"
                      style={{ height: `${Math.max((day.spend / maxSpend) * 100, 2)}%` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {day.date}: {formatMetaCurrency(day.spend)}
                        <br />
                        {formatNum(day.impressions)} imp • {formatNum(day.clicks)} clicks
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <div className="flex justify-between mt-2 text-xs text-white/40">
                <span>{metaAds.dailyBreakdown[0]?.date}</span>
                <span>{metaAds.dailyBreakdown[metaAds.dailyBreakdown.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* Campaign Breakdown */}
          {metaAds.campaigns && metaAds.campaigns.length > 0 && (
            <div className="bg-[#1A2235] rounded-xl border border-white/10 overflow-hidden">
              <button
                onClick={() => setShowMetaCampaigns(!showMetaCampaigns)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-white/50" />
                  <span className="text-white/60 text-xs font-medium">
                    Campaign Breakdown ({metaAds.campaigns.length} campaigns)
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showMetaCampaigns ? "rotate-180" : ""}`} />
              </button>
              {showMetaCampaigns && (
                <div className="overflow-x-auto border-t border-white/10">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 text-xs font-medium px-4 py-2">Campaign</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">Spend</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">Impressions</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">Clicks</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">CTR</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">CPC</th>
                        <th className="text-right text-white/50 text-xs font-medium px-4 py-2">Reach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metaAds.campaigns.map((c) => (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="text-white/80 text-sm px-4 py-2 max-w-[200px] truncate">{c.name}</td>
                          <td className="text-blue-400 text-sm px-4 py-2 text-right font-medium">{formatMetaCurrency(c.spend)}</td>
                          <td className="text-white/70 text-sm px-4 py-2 text-right">{formatNum(c.impressions)}</td>
                          <td className="text-white/70 text-sm px-4 py-2 text-right">{formatNum(c.clicks)}</td>
                          <td className="text-white/70 text-sm px-4 py-2 text-right">{c.ctr.toFixed(2)}%</td>
                          <td className="text-white/70 text-sm px-4 py-2 text-right">{formatMetaCurrency(c.cpc)}</td>
                          <td className="text-white/70 text-sm px-4 py-2 text-right">{formatNum(c.reach)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Active Campaigns */}
          {metaAds.activeCampaigns && metaAds.activeCampaigns.length > 0 && (
            <div className="bg-[#1A2235] rounded-xl p-4 border border-green-500/20">
              <h3 className="text-white/60 text-xs mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {metaAds.activeCampaignCount} Active Campaign{metaAds.activeCampaignCount !== 1 ? "s" : ""}
              </h3>
              <div className="space-y-2">
                {metaAds.activeCampaigns.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-white/80 text-sm">{c.name}</p>
                      <p className="text-white/40 text-xs capitalize">{(c.objective || "").replace(/_/g, " ").toLowerCase()}</p>
                    </div>
                    <div className="text-right">
                      {c.dailyBudget && (
                        <p className="text-white/60 text-xs">{formatMetaCurrency(c.dailyBudget)}/day</p>
                      )}
                      {c.lifetimeBudget && (
                        <p className="text-white/60 text-xs">{formatMetaCurrency(c.lifetimeBudget)} lifetime</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
