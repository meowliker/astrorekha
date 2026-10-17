"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Columns3, GripVertical, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import { accountTrackingDayMode, trackingDate, trackingWindowLabel, type TrackingActivity, type TrackingCampaign, type TrackingDayMode, type TrackingSale, type TrackingSummary } from "@/lib/tracking-dashboard";
import type { TrackingSavedView, TrackingViewConfig } from "@/lib/soulmate-tracking-views";
import TrackingDateRangePicker, { type TrackingRange } from "./TrackingDateRangePicker";
import TrackingCampaignRows from "./TrackingCampaignRows";
import TrackingHourlyModal from "./TrackingHourlyModal";
import TrackingHourlyTable from "./TrackingHourlyTable";
import { buildTrackingHourlyTable, type TrackingHourlyMetric } from "@/lib/tracking-hourly-table";
import { hourlyBudgetMarkers } from "@/lib/tracking-budget-markers";

type LiveData = { sales: TrackingSale[]; todayCount: number; todayRevenue: number; fetchedAt: string };
type Column = { id: string; label: string; group: "Identity" | "Meta" | "AstroRekha"; value: (row: TrackingCampaign) => string; sort: (row: TrackingCampaign) => string | number; align?: "right" };
type AccountTiming = "us" | "india";
const ACCOUNT_TIMING_STORAGE_KEY = "ar_soulmate_tracking_account_timing_v1";
const BID_COLUMN_MIGRATION_KEY = "ar_soulmate_tracking_bid_column_migrated_v1";

const inr = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const amount = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const count = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const decimal = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const ratio = (numerator: number, denominator: number | null) => denominator && denominator > 0 ? `${decimal(numerator / denominator)}×` : "—";
const businessRoas = (row: TrackingCampaign) => {
  const value = ratio(row.revenue, row.spendInr);
  return value !== "—" && !row.metaPurchaseWindowAligned ? `≈${value}` : value;
};
const pct = (numerator: number, denominator: number) => denominator > 0 ? `${decimal(numerator / denominator * 100)}%` : "—";
const labels = (values: string[]) => values.length ? values.slice(0, 2).join(", ") + (values.length > 2 ? ` +${values.length - 2}` : "") : "—";

const COLUMNS: Column[] = [
  { id: "campaign", label: "Campaign", group: "Identity", value: (r) => r.campaignName, sort: (r) => r.campaignName },
  { id: "account", label: "Ad account", group: "Identity", value: (r) => r.accountName, sort: (r) => r.accountName },
  { id: "campaignId", label: "Campaign ID", group: "Identity", value: (r) => r.campaignId || "—", sort: (r) => r.campaignId || "" },
  { id: "status", label: "Status", group: "Identity", value: (r) => r.status || "—", sort: (r) => r.status || "" },
  { id: "budget", label: "Budget", group: "Meta", value: (r) => r.dailyBudget != null ? `${amount(r.dailyBudget, r.currency)} / day` : r.lifetimeBudget != null ? `${amount(r.lifetimeBudget, r.currency)} lifetime` : "—", sort: (r) => r.dailyBudget ?? r.lifetimeBudget ?? 0, align: "right" },
  { id: "bid", label: "Bid", group: "Meta", value: (r) => r.bidAmount == null ? "—" : amount(r.bidAmount, r.currency), sort: (r) => r.bidAmount ?? 0, align: "right" },
  { id: "objective", label: "Objective", group: "Identity", value: (r) => r.objective?.replace(/_/g, " ") || "—", sort: (r) => r.objective || "" },
  { id: "spend", label: "Meta spend", group: "Meta", value: (r) => r.accountId ? amount(r.spend, r.currency) : "—", sort: (r) => r.spend, align: "right" },
  { id: "spendInr", label: "Spend INR", group: "Meta", value: (r) => r.spendInr == null ? "—" : inr(r.spendInr), sort: (r) => r.spendInr || 0, align: "right" },
  { id: "dailyBudget", label: "Daily budget", group: "Meta", value: (r) => r.dailyBudget == null ? "—" : amount(r.dailyBudget, r.currency), sort: (r) => r.dailyBudget || 0, align: "right" },
  { id: "lifetimeBudget", label: "Lifetime budget", group: "Meta", value: (r) => r.lifetimeBudget == null ? "—" : amount(r.lifetimeBudget, r.currency), sort: (r) => r.lifetimeBudget || 0, align: "right" },
  { id: "impressions", label: "Impressions", group: "Meta", value: (r) => count(r.impressions), sort: (r) => r.impressions, align: "right" },
  { id: "reach", label: "Reach", group: "Meta", value: (r) => count(r.reach), sort: (r) => r.reach, align: "right" },
  { id: "frequency", label: "Frequency", group: "Meta", value: (r) => r.reach ? decimal(r.impressions / r.reach) : "—", sort: (r) => r.reach ? r.impressions / r.reach : 0, align: "right" },
  { id: "clicks", label: "Clicks", group: "Meta", value: (r) => count(r.clicks), sort: (r) => r.clicks, align: "right" },
  { id: "linkClicks", label: "Link clicks", group: "Meta", value: (r) => count(r.linkClicks), sort: (r) => r.linkClicks, align: "right" },
  { id: "linkCtr", label: "Link CTR", group: "Meta", value: (r) => pct(r.linkClicks, r.impressions), sort: (r) => r.impressions ? r.linkClicks / r.impressions : 0, align: "right" },
  { id: "ctr", label: "CTR", group: "Meta", value: (r) => pct(r.clicks, r.impressions), sort: (r) => r.impressions ? r.clicks / r.impressions : 0, align: "right" },
  { id: "cpc", label: "Meta CPC", group: "Meta", value: (r) => r.clicks ? amount((r.metaCalendarSpend ?? r.spend) / r.clicks, r.currency) : "—", sort: (r) => r.clicks ? (r.metaCalendarSpend ?? r.spend) / r.clicks : 0, align: "right" },
  { id: "cpm", label: "CPM", group: "Meta", value: (r) => r.impressions ? amount((r.metaCalendarSpend ?? r.spend) / r.impressions * 1000, r.currency) : "—", sort: (r) => r.impressions ? (r.metaCalendarSpend ?? r.spend) / r.impressions * 1000 : 0, align: "right" },
  { id: "landingPageViews", label: "Landing views", group: "Meta", value: (r) => count(r.landingPageViews), sort: (r) => r.landingPageViews, align: "right" },
  { id: "addToCarts", label: "Add to carts", group: "Meta", value: (r) => count(r.addToCarts), sort: (r) => r.addToCarts, align: "right" },
  { id: "checkouts", label: "Checkouts", group: "Meta", value: (r) => count(r.checkouts), sort: (r) => r.checkouts, align: "right" },
  { id: "leads", label: "Leads", group: "Meta", value: (r) => count(r.leads), sort: (r) => r.leads, align: "right" },
  { id: "metaPurchases", label: "Meta purchases", group: "Meta", value: (r) => r.metaPurchaseWindowAligned ? count(r.metaPurchases) : "—", sort: (r) => r.metaPurchaseWindowAligned ? r.metaPurchases : -1, align: "right" },
  { id: "metaCostPerPurchase", label: "Meta cost / purchase", group: "Meta", value: (r) => r.metaPurchaseWindowAligned && r.metaPurchases ? amount((r.metaCalendarSpend ?? r.spend) / r.metaPurchases, r.currency) : "—", sort: (r) => r.metaPurchaseWindowAligned && r.metaPurchases ? (r.metaCalendarSpend ?? r.spend) / r.metaPurchases : -1, align: "right" },
  { id: "metaPurchaseValue", label: "Meta purchase value", group: "Meta", value: (r) => r.metaPurchaseWindowAligned ? amount(r.metaPurchaseValue, r.currency) : "—", sort: (r) => r.metaPurchaseWindowAligned ? r.metaPurchaseValue : -1, align: "right" },
  { id: "metaRoas", label: "Meta ROAS", group: "Meta", value: (r) => r.metaPurchaseWindowAligned ? ratio(r.metaPurchaseValue, r.metaCalendarSpend ?? r.spend) : "—", sort: (r) => r.metaPurchaseWindowAligned && (r.metaCalendarSpend ?? r.spend) ? r.metaPurchaseValue / (r.metaCalendarSpend ?? r.spend) : -1, align: "right" },
  { id: "orders", label: "Soulmate sales", group: "AstroRekha", value: (r) => count(r.orders), sort: (r) => r.orders, align: "right" },
  { id: "utmVisits", label: "Soulmate UTM visits", group: "AstroRekha", value: (r) => r.utmVisits == null ? "—" : count(r.utmVisits), sort: (r) => r.utmVisits || 0, align: "right" },
  { id: "conversionRate", label: "Soulmate CVR", group: "AstroRekha", value: (r) => r.utmVisits != null ? pct(r.orders, r.utmVisits) : "—", sort: (r) => r.utmVisits ? r.orders / r.utmVisits : 0, align: "right" },
  { id: "grossRevenue", label: "Soulmate gross sales", group: "AstroRekha", value: (r) => inr(r.grossRevenue), sort: (r) => r.grossRevenue, align: "right" },
  { id: "refunds", label: "Refunds", group: "AstroRekha", value: (r) => count(r.refunds), sort: (r) => r.refunds, align: "right" },
  { id: "refundAmount", label: "Refund amount", group: "AstroRekha", value: (r) => inr(r.refundAmount), sort: (r) => r.refundAmount, align: "right" },
  { id: "revenue", label: "Soulmate net sales", group: "AstroRekha", value: (r) => inr(r.revenue), sort: (r) => r.revenue, align: "right" },
  { id: "utmRoas", label: "Soulmate ROAS", group: "AstroRekha", value: businessRoas, sort: (r) => r.spendInr ? r.revenue / r.spendInr : 0, align: "right" },
  { id: "cpa", label: "Soulmate CPA", group: "AstroRekha", value: (r) => r.orders && r.spendInr != null ? inr(r.spendInr / r.orders) : "—", sort: (r) => r.orders && r.spendInr ? r.spendInr / r.orders : 0, align: "right" },
  { id: "aov", label: "AOV", group: "AstroRekha", value: (r) => r.orders ? inr(r.grossRevenue / r.orders) : "—", sort: (r) => r.orders ? r.grossRevenue / r.orders : 0, align: "right" },
  { id: "utmSource", label: "UTM source", group: "AstroRekha", value: (r) => labels(r.utmSources), sort: (r) => r.utmSources.join(",") },
  { id: "utmMedium", label: "UTM medium", group: "AstroRekha", value: (r) => labels(r.utmMediums), sort: (r) => r.utmMediums.join(",") },
  { id: "utmTerm", label: "UTM term / ad set", group: "AstroRekha", value: (r) => labels(r.utmTerms), sort: (r) => r.utmTerms.join(",") },
  { id: "utmContent", label: "UTM content / ad", group: "AstroRekha", value: (r) => labels(r.utmContents), sort: (r) => r.utmContents.join(",") },
];
const PRESETS: Record<string, string[]> = {
  Performance: ["campaign", "account", "status", "budget", "bid", "spendInr", "impressions", "clicks", "ctr", "cpc", "metaPurchases", "metaCostPerPurchase", "metaRoas", "utmVisits", "orders", "conversionRate", "revenue", "utmRoas", "cpa"],
  Attribution: ["campaign", "account", "campaignId", "utmSource", "utmMedium", "utmTerm", "utmContent", "orders", "grossRevenue", "refundAmount", "revenue", "utmRoas"],
  All: COLUMNS.map((column) => column.id),
};
const DEFAULT_COLUMNS = PRESETS.Performance;

function selectCampaigns(summary: TrackingSummary | null, accountId: string, search: string, sort: { id: string; desc: boolean }, activeOnly: boolean) {
  const needle = search.trim().toLowerCase();
  const rows = (summary?.campaigns || []).filter((row) =>
    (accountId === "all" || row.accountId === accountId) &&
    (!activeOnly || row.status === "ACTIVE") &&
    (!needle || [row.campaignName, row.campaignId, row.accountName, ...row.utmTerms, ...row.utmContents].join(" ").toLowerCase().includes(needle))
  );
  const column = COLUMNS.find((item) => item.id === sort.id);
  return rows.sort((a, b) => {
    const av = column?.sort(a) ?? 0;
    const bv = column?.sort(b) ?? 0;
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sort.desc ? -comparison : comparison;
  });
}

function totalsFor(summary: TrackingSummary | null, accountId: string) {
  const rows = accountId === "all" ? summary?.campaigns || [] : (summary?.campaigns || []).filter((row) => row.accountId === accountId);
  return {
    spend: rows.reduce((sum, row) => sum + (row.spendInr || 0), 0),
    orders: rows.reduce((sum, row) => sum + row.orders, 0),
    matched: rows.reduce((sum, row) => sum + (row.accountId ? row.orders : 0), 0),
    revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
  };
}

function profitFor(summary: TrackingSummary | null, accountId: string, dates: TrackingRange, totals: ReturnType<typeof totalsFor>) {
  if (!summary) return null;
  if (accountId === "all") return summary.totals.profit;
  if (summary.accounts.find((account) => account.id === accountId)?.error) return null;
  const accountRows = summary.campaigns.filter((row) => row.accountId === accountId);
  if (accountRows.some((row) => row.spendInr == null && row.spend > 0)) return null;
  const keys = new Set(accountRows.map((row) => row.key));
  let gst = 0;
  for (let day = dates.start; day <= dates.end; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    const revenue = summary.hourly.filter((item) => item.date === day && keys.has(item.campaignKey)).reduce((sum, item) => sum + item.revenue, 0);
    const indianSpend = summary.accountDailySpendInr[accountId]?.[day]?.indian || 0;
    gst += revenue * 18 / 118 + indianSpend * 0.18;
  }
  return totals.revenue - totals.spend - gst;
}

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - (11 * 60 + 30) * 60_000));
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function calendarToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function displayIst(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function TrackingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [dates, setDates] = useState(() => {
    const today = businessToday();
    return { start: today, end: today };
  });
  const [datesCustomized, setDatesCustomized] = useState(false);
  const [summaries, setSummaries] = useState<Partial<Record<TrackingDayMode, TrackingSummary>>>({});
  const [accountCatalog, setAccountCatalog] = useState<TrackingSummary["accounts"]>([]);
  const [live, setLive] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [accountId, setAccountId] = useState("all");
  const [allTiming, setAllTiming] = useState<"us" | "india" | "both">("us");
  const [accountTimings, setAccountTimings] = useState<Record<string, AccountTiming>>({});
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [activeScope, setActiveScope] = useState<"campaign" | "adset" | "ad" | "all">("all");
  const [activities, setActivities] = useState<TrackingActivity[]>([]);
  const [localActivities, setLocalActivities] = useState<TrackingActivity[]>([]);
  const [activityWarnings, setActivityWarnings] = useState<string[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [hourSelection, setHourSelection] = useState<{ key: string; dayMode: TrackingDayMode } | null>(null);
  const [exactHourlySpend, setExactHourlySpend] = useState<Partial<Record<TrackingDayMode, { day: string; hourlySpendInr: Record<string, number[]>; failedAccountIds: string[] }>>>({});
  const [exactHourlyError, setExactHourlyError] = useState<Partial<Record<TrackingDayMode, string>>>({});
  const [columnIds, setColumnIds] = useState<string[]>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<TrackingSavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState("");
  const [viewBusy, setViewBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; before: boolean } | null>(null);
  const [sort, setSort] = useState({ id: "spendInr", desc: true });
  const hourDate = dates.end;
  const [hourMetric, setHourMetric] = useState<TrackingHourlyMetric>("orders");
  const [liveDayMode, setLiveDayMode] = useState<TrackingDayMode>("business_1130_ist");
  const [newSaleIds, setNewSaleIds] = useState<string[]>([]);
  const [toastSales, setToastSales] = useState<TrackingSale[]>([]);
  const seenSales = useRef<Set<string> | null>(null);
  const toastTimers = useRef<Map<string, number>>(new Map());
  const summaryRequest = useRef<Record<TrackingDayMode, number>>({ business_1130_ist: 0, calendar_ist: 0 });
  const refreshCount = useRef(0);
  const liveLoading = useRef(false);
  const liveRequest = useRef(0);
  const reconciliationLoading = useRef(false);
  const metaAutoLoading = useRef(false);
  const knownAccounts = accountCatalog.length ? accountCatalog : summaries.business_1130_ist?.accounts || summaries.calendar_ist?.accounts || [];
  const accountDefaultMode = accountTrackingDayMode(knownAccounts.find((account) => account.id === accountId)?.timezone);
  const accountDefaultTiming: AccountTiming = accountDefaultMode === "calendar_ist" ? "india" : "us";
  const selectedAccountTiming = accountTimings[accountId] || accountDefaultTiming;
  const primaryMode: TrackingDayMode = accountId === "all"
    ? allTiming === "india" ? "calendar_ist" : "business_1130_ist"
    : selectedAccountTiming === "india" ? "calendar_ist" : "business_1130_ist";
  const showBoth = accountId === "all" && allTiming === "both";
  const maxDate = primaryMode === "calendar_ist" && !showBoth ? calendarToday() : businessToday();
  const secondaryMode: TrackingDayMode = "calendar_ist";
  const businessSummary = summaries.business_1130_ist;
  const indianSummary = summaries.calendar_ist;
  const summary = summaries[primaryMode] || null;
  const secondarySummary = showBoth ? summaries[secondaryMode] || null : null;

  useEffect(() => {
    if (!datesCustomized && dates.start === dates.end && dates.end !== maxDate) {
      applyDates({ start: maxDate, end: maxDate });
    } else if (dates.end > maxDate) {
      applyDates({ start: maxDate, end: maxDate });
    }
  }, [datesCustomized, dates.start, dates.end, maxDate]);

  useEffect(() => {
    const session = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");
    if (!session || !expiry || new Date(expiry) <= new Date()) { router.replace("/admin/login"); return; }
    setToken(session);
    try {
      const stored = JSON.parse(localStorage.getItem("ar_soulmate_tracking_columns_v1") || "null");
      if (Array.isArray(stored)) {
        const valid = stored.filter((id: unknown) => typeof id === "string" && COLUMNS.some((column) => column.id === id));
        if (valid.length) {
          const unique = Array.from(new Set(valid));
          // Migrate the previous default while preserving deliberately reordered layouts.
          if (unique[0] === "account" && unique[1] === "campaign") unique.splice(0, 2, "campaign", "account");
          // Expose the new Budget column in existing local layouts.
          if (!unique.includes("budget") && unique.includes("status") && unique.includes("spendInr")) unique.splice(unique.indexOf("status") + 1, 0, "budget");
          if (localStorage.getItem(BID_COLUMN_MIGRATION_KEY) !== "1" && !unique.includes("bid") && unique.includes("budget")) unique.splice(unique.indexOf("budget") + 1, 0, "bid");
          if (!unique.includes("utmVisits") && unique.includes("conversionRate")) unique.splice(unique.indexOf("conversionRate"), 0, "utmVisits");
          setColumnIds(unique);
          localStorage.setItem("ar_soulmate_tracking_columns_v1", JSON.stringify(unique));
        }
      }
    } catch { /* Use the default view. */ }
    localStorage.setItem(BID_COLUMN_MIGRATION_KEY, "1");
    try {
      const stored = JSON.parse(localStorage.getItem(ACCOUNT_TIMING_STORAGE_KEY) || "null");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        setAccountTimings(Object.fromEntries(Object.entries(stored).filter(([id, timing]) => /^\d+$/.test(id) && (timing === "us" || timing === "india"))) as Record<string, AccountTiming>);
      }
    } catch { /* Use each account's Meta timezone. */ }
  }, [router]);

  const fetchSummary = useCallback(async (session: string, range: typeof dates, dayMode: TrackingDayMode, quiet = false) => {
    const request = ++summaryRequest.current[dayMode];
    if (quiet) { refreshCount.current++; setRefreshing(true); }
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end, dayMode });
      const response = await fetch(`/api/admin/soulmate/tracking?${params}`, { headers: { "x-admin-session": session }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tracking data unavailable");
      if (request === summaryRequest.current[dayMode]) { setSummaries((current) => ({ ...current, [dayMode]: data as TrackingSummary })); setAccountCatalog((data as TrackingSummary).accounts); setError(""); }
    } catch (cause) { if (request === summaryRequest.current[dayMode]) setError(cause instanceof Error ? cause.message : "Tracking data unavailable"); }
    finally { if (quiet) { refreshCount.current = Math.max(0, refreshCount.current - 1); setRefreshing(refreshCount.current > 0); } }
  }, []);

  const fetchExactHourly = useCallback((session: string, day: string, dayMode: TrackingDayMode) => {
    const controller = new AbortController();
    setExactHourlySpend((current) => { const next = { ...current }; delete next[dayMode]; return next; });
    setExactHourlyError((current) => ({ ...current, [dayMode]: "" }));
    const params = new URLSearchParams({ mode: "hourly-spend", day, dayMode });
    fetch(`/api/admin/soulmate/tracking?${params}`, { headers: { "x-admin-session": session }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Hourly spend unavailable"); return data; })
      .then((data: { hourlySpendInr: Record<string, number[]>; failedAccountIds?: string[]; warnings?: string[] }) => {
        if (controller.signal.aborted) return;
        setExactHourlySpend((current) => ({ ...current, [dayMode]: { day, hourlySpendInr: data.hourlySpendInr, failedAccountIds: data.failedAccountIds || [] } }));
        setExactHourlyError((current) => ({ ...current, [dayMode]: (data.warnings || []).join(" · ") }));
      })
      .catch((cause) => { if (!controller.signal.aborted) setExactHourlyError((current) => ({ ...current, [dayMode]: cause instanceof Error ? cause.message : "Hourly spend unavailable" })); });
    return () => controller.abort();
  }, []);

  const fetchLive = useCallback(async (session: string, dayMode: TrackingDayMode) => {
    if (liveLoading.current) return;
    const request = liveRequest.current;
    liveLoading.current = true;
    try {
      const params = new URLSearchParams({ mode: "live", dayMode });
      const response = await fetch(`/api/admin/soulmate/tracking?${params}`, { headers: { "x-admin-session": session }, cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as LiveData;
      if (request !== liveRequest.current) return;
      const ids = new Set(data.sales.map((sale) => sale.id));
      if (seenSales.current) {
        const fresh = data.sales.filter((sale) => !seenSales.current?.has(sale.id));
        if (fresh.length) {
          setNewSaleIds(fresh.map((sale) => sale.id));
          setToastSales((current) => [...fresh, ...current].slice(0, 4));
          for (const sale of fresh) {
            const timer = window.setTimeout(() => {
              setToastSales((current) => current.filter((item) => item.id !== sale.id));
              toastTimers.current.delete(sale.id);
            }, 8_000);
            toastTimers.current.set(sale.id, timer);
          }
        }
      }
      seenSales.current = new Set([...(seenSales.current || []), ...ids]);
      setLive(data);
    } catch { /* Preserve the last successful live feed. */ }
    finally { if (request === liveRequest.current) liveLoading.current = false; }
  }, []);

  const changeLiveTiming = (dayMode: TrackingDayMode) => {
    liveRequest.current++;
    liveLoading.current = false;
    seenSales.current = null;
    setLive(null);
    setNewSaleIds([]);
    setToastSales([]);
    for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
    toastTimers.current.clear();
    setLiveDayMode(dayMode);
  };

  useEffect(() => {
    if (!token || dates.end > businessToday()) return;
    void fetchSummary(token, dates, "business_1130_ist");
  }, [token, dates, fetchSummary]);
  useEffect(() => {
    if (!token || (primaryMode !== "calendar_ist" && !showBoth) || summaries.calendar_ist) return;
    void fetchSummary(token, dates, "calendar_ist");
  }, [token, dates, primaryMode, showBoth, summaries.calendar_ist, fetchSummary]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      setActivityLoading(true);
      try {
        const params = new URLSearchParams({ mode: "activities", ...dates, accountId, dayMode: primaryMode, ...(showBoth ? { includeBoth: "1" } : {}) });
        const response = await fetch(`/api/admin/soulmate/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Meta action log unavailable");
        if (active) { setActivities(data.activities || []); setActivityWarnings(data.warnings || []); }
      } catch (cause) { if (active) setActivityWarnings([cause instanceof Error ? cause.message : "Meta action log unavailable"]); }
      finally { if (active) setActivityLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, dates, accountId, primaryMode, showBoth, activityRefresh]);
  useEffect(() => {
    if (!token || !businessSummary || (primaryMode !== "business_1130_ist" && !showBoth) || hourDate < dates.start || hourDate > dates.end) return;
    return fetchExactHourly(token, hourDate, "business_1130_ist");
  }, [token, businessSummary, primaryMode, showBoth, hourDate, dates.start, dates.end, fetchExactHourly]);
  useEffect(() => {
    if (!token || !indianSummary || (primaryMode !== "calendar_ist" && !showBoth) || hourDate < dates.start || hourDate > dates.end) return;
    return fetchExactHourly(token, hourDate, "calendar_ist");
  }, [token, indianSummary, primaryMode, showBoth, hourDate, dates.start, dates.end, fetchExactHourly]);
  const fetchViews = useCallback(async (session: string) => {
    await fetch("/api/admin/soulmate/tracking/views", { headers: { "x-admin-session": session }, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Unable to load saved views"); return response.json(); })
      .then((data: { views: TrackingSavedView[] }) => setSavedViews(data.views || []))
      .catch(() => setViewError("Saved views could not be loaded."));
  }, []);
  useEffect(() => { if (token) void fetchViews(token); }, [token, fetchViews]);
  useEffect(() => {
    if (!token) return;
    void fetchLive(token, liveDayMode);
    const timer = window.setInterval(() => void fetchLive(token, liveDayMode), 5_000);
    return () => window.clearInterval(timer);
  }, [token, liveDayMode, fetchLive]);
  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || metaAutoLoading.current) return;
      metaAutoLoading.current = true;
      try { await Promise.all((showBoth ? ["business_1130_ist", "calendar_ist"] as TrackingDayMode[] : [primaryMode]).map((mode) => fetchSummary(token, dates, mode, true))); }
      finally { metaAutoLoading.current = false; }
    }, 300_000);
    return () => window.clearInterval(timer);
  }, [token, dates, fetchSummary, primaryMode, showBoth]);
  useEffect(() => {
    if (!token) return;
    const reconcile = async () => {
      if (document.visibilityState !== "visible" || reconciliationLoading.current) return;
      reconciliationLoading.current = true;
      try {
        const response = await fetch("/api/admin/soulmate/tracking/reconcile", { method: "POST", headers: { "x-admin-session": token }, cache: "no-store" });
        if (!response.ok) return;
      } catch { /* The existing hourly PayU reconciliation remains the fallback. */ }
      finally { reconciliationLoading.current = false; }
    };
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 60_000);
    return () => window.clearInterval(timer);
  }, [token]);
  useEffect(() => {
    const timers = toastTimers.current;
    return () => { for (const timer of timers.values()) window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!newSaleIds.length) return;
    const timer = window.setTimeout(() => setNewSaleIds([]), 6_000);
    return () => window.clearTimeout(timer);
  }, [newSaleIds]);

  const setColumns = (ids: string[]) => {
    const next = ids.length ? ids : ["campaign"];
    setColumnIds(next);
    localStorage.setItem("ar_soulmate_tracking_columns_v1", JSON.stringify(next));
  };
  const toggleColumn = (id: string) => setColumns(columnIds.includes(id) ? columnIds.filter((item) => item !== id) : [...columnIds, id]);
  const moveColumn = (id: string, direction: number) => {
    const index = columnIds.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= columnIds.length) return;
    const next = [...columnIds];
    [next[index], next[target]] = [next[target], next[index]];
    setColumns(next);
  };
  const reorderColumn = (fromId: string, toId: string, before: boolean) => {
    if (fromId === toId) return;
    const next = [...columnIds];
    const from = next.indexOf(fromId);
    if (from < 0 || !next.includes(toId)) return;
    next.splice(from, 1);
    next.splice(next.indexOf(toId) + (before ? 0 : 1), 0, fromId);
    setColumns(next);
  };
  const activeColumns = columnIds.map((id) => COLUMNS.find((column) => column.id === id)).filter((column): column is Column => !!column);
  const selectedView = savedViews.find((view) => view.id === selectedViewId);
  const changeAccountTiming = (id: string, timing: AccountTiming) => {
    const defaultMode = accountTrackingDayMode(knownAccounts.find((account) => account.id === id)?.timezone);
    const defaultTiming = defaultMode === "calendar_ist" ? "india" : "us";
    const next = { ...accountTimings };
    if (timing === defaultTiming) delete next[id];
    else next[id] = timing;
    setAccountTimings(next);
    localStorage.setItem(ACCOUNT_TIMING_STORAGE_KEY, JSON.stringify(next));
  };
  const currentViewConfig = (): TrackingViewConfig => ({ columnIds, sort, accountId, search, hourMetric, activeOnly, activeScope, allTiming, accountTiming: accountId === "all" ? undefined : selectedAccountTiming });
  const applyView = (view: TrackingSavedView) => {
    setColumns(view.columnIds);
    setSort(view.sort);
    setAccountId(view.accountId);
    setAllTiming(view.allTiming || "us");
    if (view.accountId !== "all" && view.accountTiming) changeAccountTiming(view.accountId, view.accountTiming);
    setSearch(view.search);
    setActiveOnly(view.activeOnly === true);
    setActiveScope(view.activeScope || "all");
    setHourMetric(view.hourMetric);
    setSelectedViewId(view.id);
    setViewName(view.name);
    setViewError("");
    setViewsOpen(false);
  };
  const saveView = async (update: boolean) => {
    if (!token || viewBusy) return;
    const name = viewName.trim();
    if (!name) { setViewError("Enter a view name."); return; }
    setViewBusy(true); setViewError("");
    try {
      const response = await fetch("/api/admin/soulmate/tracking/views", {
        method: update ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-admin-session": token },
        body: JSON.stringify({ id: update ? selectedViewId : undefined, name, config: currentViewConfig() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save view");
      const view = data.view as TrackingSavedView;
      setSavedViews((current) => [...current.filter((item) => item.id !== view.id), view].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedViewId(view.id);
      setViewName(view.name);
    } catch (cause) { setViewError(cause instanceof Error ? cause.message : "Unable to save view"); }
    finally { setViewBusy(false); }
  };
  const deleteView = async () => {
    if (!token || !selectedViewId || viewBusy) return;
    setViewBusy(true); setViewError("");
    try {
      const response = await fetch(`/api/admin/soulmate/tracking/views?id=${encodeURIComponent(selectedViewId)}`, { method: "DELETE", headers: { "x-admin-session": token } });
      if (!response.ok) throw new Error("Unable to delete view");
      setSavedViews((current) => current.filter((view) => view.id !== selectedViewId));
      setSelectedViewId(null); setViewName("");
    } catch (cause) { setViewError(cause instanceof Error ? cause.message : "Unable to delete view"); }
    finally { setViewBusy(false); }
  };

  const filtered = useMemo(() => selectCampaigns(summary, accountId, search, sort, activeOnly), [summary, accountId, search, sort, activeOnly]);
  const secondaryFiltered = useMemo(() => selectCampaigns(secondarySummary, accountId, search, sort, activeOnly), [secondarySummary, accountId, search, sort, activeOnly]);
  const visibleTotals = useMemo(() => totalsFor(summary, accountId), [summary, accountId]);
  const visibleProfit = useMemo(() => profitFor(summary, accountId, dates, visibleTotals), [summary, accountId, dates, visibleTotals]);
  const secondaryTotals = useMemo(() => totalsFor(secondarySummary, accountId), [secondarySummary, accountId]);
  const secondaryProfit = useMemo(() => profitFor(secondarySummary, accountId, dates, secondaryTotals), [secondarySummary, accountId, dates, secondaryTotals]);

  const hourlyFor = (dayMode: TrackingDayMode, data: TrackingSummary | null, rows: TrackingCampaign[]) => {
    const exact = exactHourlySpend[dayMode]?.day === hourDate ? exactHourlySpend[dayMode] : null;
    const failed = new Set(exact?.failedAccountIds || []);
    const hourly = buildTrackingHourlyTable(data ? { hourly: data.hourly,
      hourlyUtmVisits: data.hourlyUtmVisits, utmVisitsAvailable: data.utmVisitsAvailable,
      hourlySpendInr: exact ? Object.fromEntries(Object.entries(exact.hourlySpendInr).map(([key, values]) => [key, { [hourDate]: values }])) : {} } : null,
      rows, hourDate, hourMetric, exact !== null, failed);
    return { hourly, exact, failed };
  };
  const primaryHourly = hourlyFor(primaryMode, summary, filtered);
  const secondaryHourly = showBoth ? hourlyFor(secondaryMode, secondarySummary, secondaryFiltered) : null;
  const visibleActivities = useMemo(() => {
    const pending = localActivities.filter((item) => {
      if (accountId !== "all" && item.accountId !== accountId) return false;
      const at = new Date(item.at);
      if (Number.isNaN(at.getTime())) return false;
      const days = showBoth ? [trackingDate(at, "business_1130_ist"), trackingDate(at, "calendar_ist")] : [trackingDate(at, primaryMode)];
      return days.some((day) => day >= dates.start && day <= dates.end) && !activities.some((fromMeta) =>
        fromMeta.accountId === item.accountId && fromMeta.objectId === item.objectId && fromMeta.action === item.action &&
        fromMeta.detail === item.detail && Math.abs(Date.parse(fromMeta.at) - at.getTime()) < 10 * 60_000);
    });
    return [...activities, ...pending].sort((a, b) => b.at.localeCompare(a.at));
  }, [activities, localActivities, accountId, dates.start, dates.end, primaryMode, showBoth]);
  const modalSummary = hourSelection ? summaries[hourSelection.dayMode] || null : null;
  const modalExact = hourSelection ? exactHourlySpend[hourSelection.dayMode] : null;
  const hourCampaign = modalSummary?.campaigns.find((row) => row.key === hourSelection?.key) || null;
  const hourSpend = hourCampaign?.accountId && modalExact?.day === hourDate && !modalExact.failedAccountIds.includes(hourCampaign.accountId) ? modalExact.hourlySpendInr[hourCampaign.key] || Array(24).fill(0) : null;
  const hourVisits = modalSummary?.utmVisitsAvailable ? modalSummary.hourlyUtmVisits[hourCampaign?.key || ""]?.[hourDate] || Array(24).fill(0) : null;

  function applyDates(range: TrackingRange) {
    summaryRequest.current.business_1130_ist++;
    summaryRequest.current.calendar_ist++;
    setSummaries({});
    setExactHourlySpend({});
    setDates(range);
    setError("");
  }

  const summaryCards = (dayMode: TrackingDayMode, data: TrackingSummary | null, totals: ReturnType<typeof totalsFor>, profit: number | null) => {
    const estimated = (data?.campaigns || []).some((row) => row.accountId && (accountId === "all" || row.accountId === accountId) && !row.metaPurchaseWindowAligned && (row.spendInr || 0) > 0);
    return <div key={dayMode} className="mb-6">
      {showBoth && <h2 className="mb-2 text-sm font-semibold text-cyan-200">{trackingWindowLabel(dayMode)}</h2>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Meta spend · INR", data ? data.accounts.length ? inr(totals.spend) : "—" : "…"],
          ["Paid orders", data ? count(totals.orders) : "…"],
          ["Net sales", data ? inr(totals.revenue) : "…"],
          ["Profit after GST & ads", data ? profit == null ? "—" : inr(profit) : "…"],
          ["Blended ROAS", data ? `${estimated ? "≈" : ""}${ratio(totals.revenue, totals.spend)}` : "…"],
          ["Matched to Meta", data ? `${totals.matched} / ${totals.orders}` : "…"],
        ].map(([label, value]) => <div key={label} className="bg-[#141b2b] px-4 py-4"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{value}</div></div>)}
      </div>
    </div>;
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-slate-100">
      {hourCampaign && hourSelection && <TrackingHourlyModal campaign={hourCampaign} day={hourDate} dayMode={hourSelection.dayMode} hours={modalSummary?.hourly || []} spend={hourSpend} visits={hourVisits} error={!hourCampaign.accountId ? "No matched Meta campaign for this row" : exactHourlyError[hourSelection.dayMode] || ""} onClose={() => setHourSelection(null)} />}
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>{toastSales.map((sale) => <motion.div key={sale.id} role="status" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.2 }} className="pointer-events-auto rounded-xl border border-emerald-400/35 bg-[#1b2437] p-4 shadow-2xl shadow-black/50">
          <div className="flex items-start gap-3"><div className="rounded-full bg-emerald-400/15 p-2 text-emerald-300"><ShoppingBag size={17} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">New sale · {sale.productType}</div><p className="mt-1 break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought {sale.productName}</p>{sale.campaign && <p className="mt-2 whitespace-normal break-words text-xs text-slate-400">Campaign: {sale.campaign}</p>}<div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">{displayIst(sale.at)} IST</span><span className="font-semibold text-emerald-300">{inr(sale.amount)}</span></div></div><button aria-label="Dismiss sale notification" onClick={() => { const timer = toastTimers.current.get(sale.id); if (timer) window.clearTimeout(timer); toastTimers.current.delete(sale.id); setToastSales((current) => current.filter((item) => item.id !== sale.id)); }} className="text-slate-500 hover:text-white"><X size={16} /></button></div>
        </motion.div>)}</AnimatePresence>
      </div>
      <div className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <button onClick={() => router.push("/admin")} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Admin</button>
            <h1 className="text-3xl font-semibold tracking-tight">Soulmate Tracking</h1>
            <p className="mt-1 text-sm text-slate-400">Soulmate campaign performance and verified paid orders, joined by saved UTMs.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <TrackingDateRangePicker value={dates} maxDate={maxDate} onChange={(range) => { setDatesCustomized(true); applyDates(range); }} />
            <button onClick={() => token && void Promise.all((showBoth ? ["business_1130_ist", "calendar_ist"] as TrackingDayMode[] : [primaryMode]).map((mode) => fetchSummary(token, dates, mode, true)))} title="Refresh Meta and orders" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {[summary, secondarySummary].filter((item): item is TrackingSummary => !!item).flatMap((item) => item.warnings).length ? <div className="mb-5 border-l-2 border-amber-400/70 pl-3 text-xs text-amber-100/75">{Array.from(new Set([summary, secondarySummary].filter((item): item is TrackingSummary => !!item).flatMap((item) => item.warnings))).join(" · ")}</div> : null}

        {summaryCards(primaryMode, summary, visibleTotals, visibleProfit)}
        {showBoth && summaryCards(secondaryMode, secondarySummary, secondaryTotals, secondaryProfit)}
        <p className="-mt-4 mb-6 text-xs text-slate-500">Profit deducts included sales GST, ad spend and Indian ad GST using the Soulmate Profit Sheet formula. Matched to Meta counts paid orders whose campaign ID or unique UTM name matches a Meta campaign; unmatched orders still count in Soulmate sales.</p>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 space-y-7">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Ad accounts</h2><p className="text-xs text-slate-500">Each account starts with its Meta timezone. Choose either reporting window below.</p></div>
                <span className="text-xs text-slate-500">{summary ? `Direct Meta API · refreshes every 5m or manually · fetched ${displayIst(summary.fetchedAt)} IST` : "Loading Meta"}</span>
              </div>
              <div className="overflow-x-auto border-y border-white/10">
                <div className="flex min-w-max gap-0">
                  <button onClick={() => setAccountId("all")} className={`min-w-48 border-r border-white/10 px-4 py-3 text-left ${accountId === "all" ? "bg-white/10" : "hover:bg-white/5"}`}><div className="text-sm font-medium">All accounts</div><div className="mt-1 text-xs text-slate-400">{knownAccounts.length} connected</div></button>
                  {knownAccounts.map((account) => {
                    const rows = summary?.campaigns.filter((row) => row.accountId === account.id) || [];
                    const spend = rows.reduce((sum, row) => sum + (row.spendInr || 0), 0);
                    const orders = rows.reduce((sum, row) => sum + row.orders, 0);
                    return <button key={account.id} onClick={() => setAccountId(account.id)} className={`min-w-56 border-r border-white/10 px-4 py-3 text-left ${accountId === account.id ? "bg-white/10" : "hover:bg-white/5"}`}><div className="truncate text-sm font-medium">{account.name}</div><div className="mt-1 text-xs text-cyan-300">Default: {accountTrackingDayMode(account.timezone) === "calendar_ist" ? "Indian timing" : "US timing"}</div><div className="mt-1 text-xs tabular-nums text-slate-400">{summary ? `${inr(spend)} · ${orders} orders · ${account.currency}` : "Loading selected timing…"}</div>{account.error && <div className="mt-1 text-xs text-rose-300">Meta unavailable</div>}</button>;
                  })}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3"><label htmlFor="account-timing" className="text-sm text-slate-300">{accountId === "all" ? "All accounts timing" : "Account timing"}</label><select id="account-timing" value={accountId === "all" ? allTiming : selectedAccountTiming} onChange={(event) => accountId === "all" ? setAllTiming(event.target.value as typeof allTiming) : changeAccountTiming(accountId, event.target.value as AccountTiming)} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm"><option value="us">US · 11:30 AM IST{accountId !== "all" && accountDefaultTiming === "us" ? " (default)" : ""}</option><option value="india">Indian · 12:00 AM IST{accountId !== "all" && accountDefaultTiming === "india" ? " (default)" : ""}</option>{accountId === "all" && <option value="both">Both</option>}</select><span className="text-xs text-slate-500">{accountId === "all" ? "Each table uses its own reporting window." : "Saved for this account in this browser."}</span></div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Campaigns <span className="ml-2 text-sm font-normal text-slate-500">{filtered.length}</span></h2><p className="text-xs text-slate-500">Expand a campaign for Meta ad sets, then an ad set for ads. Soulmate sales use saved UTMs.</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} className="accent-cyan-400" /> Active only</label>
                  <select aria-label="Active filter level" title="Choose which levels must be active" value={activeScope} onChange={(event) => setActiveScope(event.target.value as typeof activeScope)} disabled={!activeOnly} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm disabled:opacity-50"><option value="all">All levels</option><option value="campaign">Campaigns</option><option value="adset">Ad sets</option><option value="ad">Ads</option></select>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2"><Search size={15} className="text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaign or ad" className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-600" /></label>
                  <div className="relative">
                    <button onClick={() => { if (!viewsOpen && token) void fetchViews(token); setViewsOpen(!viewsOpen); setColumnsOpen(false); }} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm hover:bg-white/5">{selectedView?.name || "Saved views"} <ChevronDown size={14} /></button>
                    {viewsOpen && <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-white/15 bg-[#1b2437] p-3 shadow-2xl">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Shared views</div>
                      <div className="max-h-44 space-y-1 overflow-y-auto">{savedViews.length ? savedViews.map((view) => <button key={view.id} onClick={() => applyView(view)} className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-white/10 ${selectedViewId === view.id ? "bg-cyan-400/10 text-cyan-200" : "text-slate-200"}`}>{view.name}</button>) : <p className="px-2 py-2 text-xs text-slate-500">No shared views yet.</p>}</div>
                      <div className="mt-3 border-t border-white/10 pt-3"><label className="text-xs text-slate-400">View name<input value={viewName} onChange={(event) => setViewName(event.target.value)} maxLength={60} placeholder="My campaign view" className="mt-1 w-full rounded border border-white/10 bg-[#141b2b] px-2 py-2 text-sm text-white outline-none focus:border-cyan-400/50" /></label>
                        <div className="mt-2 flex flex-wrap gap-2"><button disabled={viewBusy} onClick={() => void saveView(false)} className="rounded bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-[#0A0E1A] disabled:opacity-50">Save new</button>{selectedView && <><button disabled={viewBusy} onClick={() => void saveView(true)} className="rounded border border-white/15 px-2.5 py-1.5 text-xs disabled:opacity-50">Update</button><button disabled={viewBusy} onClick={() => void deleteView()} className="rounded border border-rose-400/30 px-2.5 py-1.5 text-xs text-rose-300 disabled:opacity-50">Delete</button></>}</div>
                        <p className="mt-2 text-[11px] text-slate-500">Columns, account, timing, active filter, search, sort, and hourly metric are shared with admins. Dates stay separate.</p>{viewError && <p role="alert" className="mt-2 text-xs text-rose-300">{viewError}</p>}
                      </div>
                    </div>}
                  </div>
                  <div className="relative">
                    <button onClick={() => setColumnsOpen(!columnsOpen)} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm hover:bg-white/5"><Columns3 size={15} /> Columns <ChevronDown size={14} /></button>
                    {columnsOpen && <div className="absolute right-0 top-11 z-30 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-white/15 bg-[#1b2437] p-3 shadow-2xl">
                      <div className="mb-3 flex gap-1">{Object.keys(PRESETS).map((name) => <button key={name} onClick={() => setColumns(PRESETS[name])} className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10">{name}</button>)}</div>
                      {(["Identity", "Meta", "AstroRekha"] as const).map((group) => <div key={group} className="mb-3"><div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</div>{COLUMNS.filter((column) => column.group === group).map((column) => <div key={column.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-white/5"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={columnIds.includes(column.id)} onChange={() => toggleColumn(column.id)} className="accent-[#e51b50]" /><span className="truncate">{column.label}</span></label>{columnIds.includes(column.id) && <><button aria-label={`Move ${column.label} left`} onClick={() => moveColumn(column.id, -1)} className="text-slate-500 hover:text-white"><ArrowUp size={13} /></button><button aria-label={`Move ${column.label} right`} onClick={() => moveColumn(column.id, 1)} className="text-slate-500 hover:text-white"><ArrowDown size={13} /></button></>}</div>)}</div>)}
                    </div>}
                  </div>
                </div>
              </div>
              {(showBoth ? [{ dayMode: primaryMode, data: summary, rows: filtered }, { dayMode: secondaryMode, data: secondarySummary, rows: secondaryFiltered }] : [{ dayMode: primaryMode, data: summary, rows: filtered }]).map(({ dayMode, data, rows }) => <div key={dayMode} className="mb-6">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-cyan-200">{trackingWindowLabel(dayMode)}</h3><span className="text-xs text-slate-500">{rows.length} campaigns</span></div>
              {rows.some((row) => row.accountId && !row.metaPurchaseWindowAligned) && <p className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">Meta purchase figures show “—” for accounts whose Meta reporting day does not match this window. Soulmate sales use exact payment times; “≈” marks ROAS with spend allocated across a Meta clock-hour boundary.</p>}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead className="sticky top-0 bg-[#1b2437] text-xs text-slate-400">
                    <tr><th className="w-8 px-2 py-3" />{activeColumns.map((column) =>
                      <th key={column.id}
                        title={["metaPurchases", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas"].includes(column.id) ? "Shown only when the Meta ad account day exactly matches this table's reporting window." : undefined}
                        draggable
                        onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.id); setDraggingId(column.id); }}
                        onDragEnd={() => { setDraggingId(null); setDragOver(null); }}
                        onDragOver={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const before = event.clientX < rect.left + rect.width / 2; setDragOver((current) => current?.id === column.id && current.before === before ? current : { id: column.id, before }); }}
                        onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain") || draggingId; const rect = event.currentTarget.getBoundingClientRect(); if (source) reorderColumn(source, column.id, event.clientX < rect.left + rect.width / 2); setDraggingId(null); setDragOver(null); }}
                        onDragLeave={() => setDragOver((current) => current?.id === column.id ? null : current)}
                        className={`relative whitespace-nowrap border-b border-white/10 px-3 py-3 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                        {dragOver?.id === column.id && draggingId !== column.id && <span aria-hidden="true" className={`pointer-events-none absolute inset-y-1 w-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)] ${dragOver.before ? "left-0" : "right-0"}`} />}
                        <div className={`inline-flex items-center gap-1 ${column.align === "right" ? "justify-end" : "justify-start"}`}>
                          <span title={`Drag ${column.label} to reposition`} aria-label={`Drag ${column.label} to reposition`} className="cursor-grab touch-none text-slate-500 hover:text-white active:cursor-grabbing"><GripVertical size={14} /></span>
                          <button onClick={() => setSort({ id: column.id, desc: sort.id === column.id ? !sort.desc : true })} className="inline-flex items-center gap-1 hover:text-white">{column.label}{sort.id === column.id && <span>{sort.desc ? "↓" : "↑"}</span>}</button>
                        </div>
                      </th>)}</tr>
                  </thead>
                  {data && <TrackingCampaignRows key={`${dayMode}:${dates.start}:${dates.end}`} rows={rows} columns={activeColumns} token={token} dates={dates} dayMode={dayMode} refreshKey={data.fetchedAt} activeOnly={activeOnly} activeScope={activeScope} onMetaEditSaved={(activity) => { setLocalActivities((current) => [activity, ...current]); setActivityRefresh((value) => value + 1); if (token) void Promise.all((showBoth ? ["business_1130_ist", "calendar_ist"] as TrackingDayMode[] : [dayMode]).map((mode) => fetchSummary(token, dates, mode, true))); }} />}
                </table>
                {data && rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No campaigns or UTM orders for these filters.</div>}
                {!data && <div className="p-10 text-center text-sm text-slate-500">Loading campaigns and orders…</div>}
              </div>
              </div>)}
              <p className="mt-2 text-xs text-slate-500">Drag column headers to reorder them. Meta spend, Soulmate sales and UTM visits follow the time window named above. Meta purchases and Meta ROAS appear only when the account reporting day matches that window exactly; “—” means unavailable. For other account timezones, Meta spend is allocated from whole-hour totals and “≈” marks ROAS using that spend. Soulmate CVR is paid orders divided by tagged site arrivals; visits without campaign tags or blocked analytics are excluded. Historical visits use saved Soulmate landing URLs where available. Other Meta insight metrics use each account&apos;s calendar reporting window. Meta refreshes every 5 minutes or manually; live sales refresh every 5 seconds. USD spend uses {summary?.fxRateSource || "the saved Profit Sheet rate"}.</p>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Hourly sales by campaign</h2><p className="text-xs text-slate-500">Soulmate orders and tagged site arrivals use recorded times. CVR is orders ÷ Soulmate UTM visits in each window. Meta spend is reported by clock hour.{dates.start !== dates.end ? " Hours shown are for the final day of the selected range." : ""}</p><p className="mt-1 text-xs text-slate-500"><span className="text-emerald-300">↑</span> Budget increased · <span className="text-rose-300">↓</span> Budget decreased. Hover over a marked cell for the amount.</p></div><select aria-label="Hourly breakdown metric" value={hourMetric} onChange={(event) => setHourMetric(event.target.value as TrackingHourlyMetric)} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm"><option value="orders">Orders</option><option value="revenue">Net sales</option><option value="roas">ROAS</option><option value="cvr">Soulmate CVR</option></select></div>
              {(showBoth ? [{ dayMode: primaryMode, data: summary, table: primaryHourly }, { dayMode: secondaryMode, data: secondarySummary, table: secondaryHourly }] : [{ dayMode: primaryMode, data: summary, table: primaryHourly }]).map(({ dayMode, data, table }) => <div key={dayMode} className="mb-6">
                <h3 className="mb-2 text-sm font-semibold text-cyan-200">{trackingWindowLabel(dayMode)}</h3>
                {exactHourlyError[dayMode] && <p className="mb-2 text-xs text-amber-300">{exactHourlyError[dayMode]}</p>}
                {data && !table?.exact && !exactHourlyError[dayMode] && <p className="mb-2 text-xs text-cyan-300">Loading selected-day Meta spend…</p>}
                {data && table ? <TrackingHourlyTable rows={table.hourly.campaigns} totals={table.hourly.totals} totalDetails={table.hourly.totalDetails} metric={hourMetric} dayMode={dayMode} budgetMarkers={hourlyBudgetMarkers(visibleActivities, dayMode === primaryMode ? filtered : secondaryFiltered, hourDate, dayMode)} onOpen={(key) => setHourSelection({ key, dayMode })} /> : <div className="rounded-xl border border-white/10 bg-[#141b2b] p-8 text-center text-sm text-slate-500">Loading hourly results…</div>}
              </div>)}
            </section>
          </main>

          <aside className="min-w-0">
            <div className="sticky top-5 overflow-hidden rounded-xl border border-white/10 bg-[#141b2b]">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={18} className="text-[#e51b50]" /> Live sales</h2><span className="flex items-center gap-1 text-xs text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> {newSaleIds.length ? `${newSaleIds.length} new` : "5s refresh"}</span></div>
                <label htmlFor="live-sales-timing" className="mt-4 block text-xs text-slate-400">Sales timing</label>
                <select id="live-sales-timing" value={liveDayMode} onChange={(event) => changeLiveTiming(event.target.value as TrackingDayMode)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#1b2437] px-3 py-2 text-sm text-white"><option value="business_1130_ist">US · from 11:30 AM IST</option><option value="calendar_ist">Indian · from 12:00 AM IST</option></select>
                <div className="mt-4 flex items-end justify-between"><div><div className="text-xs text-slate-500">{liveDayMode === "calendar_ist" ? "Today · 12:00 AM IST" : "Business day · 11:30 AM IST"}</div><div className="text-3xl font-semibold tabular-nums">{live?.todayCount ?? "—"}</div></div><div className="text-right"><div className="text-xs text-slate-500">Gross sales</div><div className="text-lg font-medium tabular-nums">{live ? inr(live.todayRevenue) : "—"}</div></div></div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">{live?.sales.map((sale) => <div key={sale.id} className={`border-b border-white/5 px-4 py-3 transition-colors duration-700 ${newSaleIds.includes(sale.id) ? "bg-[#e51b50]/20" : ""}`}><div className="flex gap-3"><div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><ShoppingBag size={15} /></div><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought <span className="font-medium text-white">{sale.productName}</span></p><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{sale.productType}</span><span className="shrink-0">{displayIst(sale.at)}</span></div>{sale.campaign && <p className="mt-1 whitespace-normal break-words text-[11px] text-slate-400">Campaign: {sale.campaign}</p>}</div></div><div className="mt-1 text-right text-xs font-semibold text-emerald-300">{inr(sale.amount)}</div></div>)}{!live?.sales.length && <div className="px-4 py-8 text-center text-sm text-slate-500">No paid sales in this {liveDayMode === "calendar_ist" ? "Indian day" : "business day"} yet.</div>}</div>
            </div>
          </aside>
        </div>
        <section className="mt-8 border-t border-white/10 pt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Meta action log</h2><p className="text-xs text-slate-500">Campaign, ad set and ad edits for the selected date range and account.</p></div><span className="text-xs text-slate-500">{activityLoading ? "Refreshing…" : `${visibleActivities.length} changes shown`}</span></div>
          {activityWarnings.length > 0 && <div role="alert" className="mb-3 border-l-2 border-amber-400/70 pl-3 text-xs text-amber-200">{activityWarnings.join(" · ")}</div>}
          <div className="max-h-[520px] overflow-auto rounded-xl border border-white/10 bg-[#141b2b]"><table className="w-full min-w-[740px] text-sm"><thead className="sticky top-0 bg-[#1b2437] text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Time · IST</th><th className="px-4 py-3 text-left">Account</th><th className="px-4 py-3 text-left">Changed by</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Campaign / ad set / ad</th><th className="px-4 py-3 text-left">Change</th></tr></thead><tbody>{visibleActivities.map((item) => <tr key={item.id} className="border-t border-white/5"><td className="whitespace-nowrap px-4 py-3 text-slate-400">{item.at ? displayIst(item.at) : "—"}</td><td className="px-4 py-3 text-slate-400">{item.accountName}</td><td className="px-4 py-3 text-slate-300">{item.actor}</td><td className="px-4 py-3 text-white">{item.action}</td><td className="px-4 py-3 text-slate-300">{item.objectType && <span className="mr-2 rounded border border-cyan-400/25 px-1.5 py-0.5 text-[10px] uppercase text-cyan-300">{item.objectType}</span>}{item.object}</td><td className="px-4 py-3 text-cyan-200">{item.detail || "—"}</td></tr>)}</tbody></table>{!visibleActivities.length && !activityLoading && <div className="px-5 py-8 text-center text-sm text-slate-500">No Meta edits were returned for this range.</div>}</div>
          <p className="mt-2 text-xs text-slate-500">Read directly from Meta account activities. Meta may omit or delay some history, and older changes outside the selected range are excluded.</p>
        </section>
      </div>
    </div>
  );
}
