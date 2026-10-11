"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Columns3, GripVertical, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import type { TrackingActivity, TrackingCampaign, TrackingSale, TrackingSummary } from "@/lib/tracking-dashboard";
import type { TrackingSavedView, TrackingViewConfig } from "@/lib/tracking-views";
import TrackingDateRangePicker, { type TrackingRange } from "./TrackingDateRangePicker";
import TrackingCampaignRows from "./TrackingCampaignRows";
import TrackingHourlyModal from "./TrackingHourlyModal";
import TrackingHourlyTable from "./TrackingHourlyTable";
import { calculateProfitSheetGst, indianAdGstApplies } from "@/lib/profit-sheet-gst";

type LiveData = { sales: TrackingSale[]; todayCount: number; todayRevenue: number; fetchedAt: string };
type Column = { id: string; label: string; group: "Identity" | "Meta" | "AstroRekha"; value: (row: TrackingCampaign) => string; sort: (row: TrackingCampaign) => string | number; align?: "right" };

const inr = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const amount = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const count = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const decimal = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const ratio = (numerator: number, denominator: number | null) => denominator && denominator > 0 ? `${decimal(numerator / denominator)}×` : "—";
const pct = (numerator: number, denominator: number) => denominator > 0 ? `${decimal(numerator / denominator * 100)}%` : "—";
const labels = (values: string[]) => values.length ? values.slice(0, 2).join(", ") + (values.length > 2 ? ` +${values.length - 2}` : "") : "—";

const COLUMNS: Column[] = [
  { id: "campaign", label: "Campaign", group: "Identity", value: (r) => r.campaignName, sort: (r) => r.campaignName },
  { id: "account", label: "Ad account", group: "Identity", value: (r) => r.accountName, sort: (r) => r.accountName },
  { id: "campaignId", label: "Campaign ID", group: "Identity", value: (r) => r.campaignId || "—", sort: (r) => r.campaignId || "" },
  { id: "status", label: "Status", group: "Identity", value: (r) => r.status || "—", sort: (r) => r.status || "" },
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
  { id: "metaPurchases", label: "Meta purchases", group: "Meta", value: (r) => count(r.metaPurchases), sort: (r) => r.metaPurchases, align: "right" },
  { id: "metaCostPerPurchase", label: "Meta cost / purchase", group: "Meta", value: (r) => r.metaPurchases ? amount((r.metaCalendarSpend ?? r.spend) / r.metaPurchases, r.currency) : "—", sort: (r) => r.metaPurchases ? (r.metaCalendarSpend ?? r.spend) / r.metaPurchases : 0, align: "right" },
  { id: "metaPurchaseValue", label: "Meta purchase value", group: "Meta", value: (r) => amount(r.metaPurchaseValue, r.currency), sort: (r) => r.metaPurchaseValue, align: "right" },
  { id: "metaRoas", label: "Meta ROAS", group: "Meta", value: (r) => ratio(r.metaPurchaseValue, r.metaCalendarSpend ?? r.spend), sort: (r) => (r.metaCalendarSpend ?? r.spend) ? r.metaPurchaseValue / (r.metaCalendarSpend ?? r.spend) : 0, align: "right" },
  { id: "orders", label: "AR sales", group: "AstroRekha", value: (r) => count(r.orders), sort: (r) => r.orders, align: "right" },
  { id: "grossRevenue", label: "AR gross sales", group: "AstroRekha", value: (r) => inr(r.grossRevenue), sort: (r) => r.grossRevenue, align: "right" },
  { id: "refunds", label: "Refunds", group: "AstroRekha", value: (r) => count(r.refunds), sort: (r) => r.refunds, align: "right" },
  { id: "refundAmount", label: "Refund amount", group: "AstroRekha", value: (r) => inr(r.refundAmount), sort: (r) => r.refundAmount, align: "right" },
  { id: "revenue", label: "AR net sales", group: "AstroRekha", value: (r) => inr(r.revenue), sort: (r) => r.revenue, align: "right" },
  { id: "utmRoas", label: "AR ROAS", group: "AstroRekha", value: (r) => ratio(r.revenue, r.spendInr), sort: (r) => r.spendInr ? r.revenue / r.spendInr : 0, align: "right" },
  { id: "cpa", label: "AR CPA", group: "AstroRekha", value: (r) => r.orders && r.spendInr != null ? inr(r.spendInr / r.orders) : "—", sort: (r) => r.orders && r.spendInr ? r.spendInr / r.orders : 0, align: "right" },
  { id: "aov", label: "AOV", group: "AstroRekha", value: (r) => r.orders ? inr(r.grossRevenue / r.orders) : "—", sort: (r) => r.orders ? r.grossRevenue / r.orders : 0, align: "right" },
  { id: "utmSource", label: "UTM source", group: "AstroRekha", value: (r) => labels(r.utmSources), sort: (r) => r.utmSources.join(",") },
  { id: "utmMedium", label: "UTM medium", group: "AstroRekha", value: (r) => labels(r.utmMediums), sort: (r) => r.utmMediums.join(",") },
  { id: "utmTerm", label: "UTM term / ad set", group: "AstroRekha", value: (r) => labels(r.utmTerms), sort: (r) => r.utmTerms.join(",") },
  { id: "utmContent", label: "UTM content / ad", group: "AstroRekha", value: (r) => labels(r.utmContents), sort: (r) => r.utmContents.join(",") },
];
const PRESETS: Record<string, string[]> = {
  Performance: ["campaign", "account", "status", "spendInr", "impressions", "clicks", "ctr", "cpc", "metaPurchases", "metaCostPerPurchase", "metaRoas", "orders", "revenue", "utmRoas", "cpa"],
  Attribution: ["campaign", "account", "campaignId", "utmSource", "utmMedium", "utmTerm", "utmContent", "orders", "grossRevenue", "refundAmount", "revenue", "utmRoas"],
  All: COLUMNS.map((column) => column.id),
};
const DEFAULT_COLUMNS = PRESETS.Performance;

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - (11 * 60 + 30) * 60_000));
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function displayIst(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function TrackingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [dates, setDates] = useState({ start: businessToday(), end: businessToday() });
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountId, setAccountId] = useState("all");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [activeScope, setActiveScope] = useState<"campaign" | "adset" | "ad" | "all">("all");
  const [activities, setActivities] = useState<TrackingActivity[]>([]);
  const [activityWarnings, setActivityWarnings] = useState<string[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [hourCampaignKey, setHourCampaignKey] = useState<string | null>(null);
  const [hourSpend, setHourSpend] = useState<number[] | null>(null);
  const [hourSpendError, setHourSpendError] = useState("");
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
  const [hourDate, setHourDate] = useState(dates.end);
  const [hourMetric, setHourMetric] = useState<"orders" | "revenue">("orders");
  const [newSaleIds, setNewSaleIds] = useState<string[]>([]);
  const [toastSales, setToastSales] = useState<TrackingSale[]>([]);
  const seenSales = useRef<Set<string> | null>(null);
  const toastTimers = useRef<Map<string, number>>(new Map());
  const summaryRequest = useRef(0);
  const liveLoading = useRef(false);
  const reconciliationLoading = useRef(false);
  const metaAutoLoading = useRef(false);

  useEffect(() => {
    const session = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");
    if (!session || !expiry || new Date(expiry) <= new Date()) { router.replace("/admin/login"); return; }
    setToken(session);
    try {
      const stored = JSON.parse(localStorage.getItem("ar_tracking_columns_v1") || "null");
      if (Array.isArray(stored)) {
        const valid = stored.filter((id: unknown) => typeof id === "string" && COLUMNS.some((column) => column.id === id));
        if (valid.length) {
          const unique = Array.from(new Set(valid));
          // Migrate the previous default while preserving deliberately reordered layouts.
          if (unique[0] === "account" && unique[1] === "campaign") unique.splice(0, 2, "campaign", "account");
          setColumnIds(unique);
          localStorage.setItem("ar_tracking_columns_v1", JSON.stringify(unique));
        }
      }
    } catch { /* Use the default view. */ }
  }, [router]);

  const fetchSummary = useCallback(async (session: string, range: typeof dates, quiet = false) => {
    const request = ++summaryRequest.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end });
      const response = await fetch(`/api/admin/tracking?${params}`, { headers: { "x-admin-session": session }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tracking data unavailable");
      if (request === summaryRequest.current) { setSummary(data as TrackingSummary); setError(""); }
    } catch (cause) { if (request === summaryRequest.current) setError(cause instanceof Error ? cause.message : "Tracking data unavailable"); }
    finally { if (request === summaryRequest.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  const fetchLive = useCallback(async (session: string) => {
    if (liveLoading.current) return;
    liveLoading.current = true;
    try {
      const response = await fetch("/api/admin/tracking?mode=live", { headers: { "x-admin-session": session }, cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as LiveData;
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
    finally { liveLoading.current = false; }
  }, []);

  useEffect(() => {
    if (!token) return;
    void fetchSummary(token, dates);
  }, [token, dates, fetchSummary]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      setActivityLoading(true);
      try {
        const params = new URLSearchParams({ mode: "activities", ...dates, accountId });
        const response = await fetch(`/api/admin/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Meta action log unavailable");
        if (active) { setActivities(data.activities || []); setActivityWarnings(data.warnings || []); }
      } catch (cause) { if (active) setActivityWarnings([cause instanceof Error ? cause.message : "Meta action log unavailable"]); }
      finally { if (active) setActivityLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), dates.end === businessToday() ? 60_000 : 300_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, dates, accountId]);
  useEffect(() => {
    const row = summary?.campaigns.find((item) => item.key === hourCampaignKey);
    if (!token || !row || !row.accountId || !row.campaignId) { setHourSpend(null); setHourSpendError(""); return; }
    const controller = new AbortController();
    setHourSpend(null); setHourSpendError("");
    const params = new URLSearchParams({ mode: "hourly", start: hourDate, end: hourDate, accountId: row.accountId, campaignId: row.campaignId });
    fetch(`/api/admin/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Hourly spend unavailable"); return data; })
      .then((data: { spendInr: number[] }) => setHourSpend(data.spendInr))
      .catch((cause) => { if (!controller.signal.aborted) setHourSpendError(cause instanceof Error ? cause.message : "Hourly spend unavailable"); });
    return () => controller.abort();
  }, [token, summary, hourCampaignKey, hourDate]);
  const fetchViews = useCallback(async (session: string) => {
    await fetch("/api/admin/tracking/views", { headers: { "x-admin-session": session }, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Unable to load saved views"); return response.json(); })
      .then((data: { views: TrackingSavedView[] }) => setSavedViews(data.views || []))
      .catch(() => setViewError("Saved views could not be loaded."));
  }, []);
  useEffect(() => { if (token) void fetchViews(token); }, [token, fetchViews]);
  useEffect(() => {
    if (!token) return;
    void fetchLive(token);
    const timer = window.setInterval(() => void fetchLive(token), 5_000);
    return () => window.clearInterval(timer);
  }, [token, fetchLive]);
  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || metaAutoLoading.current) return;
      metaAutoLoading.current = true;
      try { await fetchSummary(token, dates, true); }
      finally { metaAutoLoading.current = false; }
    }, dates.end === businessToday() ? 60_000 : 300_000);
    return () => window.clearInterval(timer);
  }, [token, dates, fetchSummary]);
  useEffect(() => {
    if (!token) return;
    const reconcile = async () => {
      if (document.visibilityState !== "visible" || reconciliationLoading.current) return;
      reconciliationLoading.current = true;
      try {
        const response = await fetch("/api/admin/tracking/reconcile", { method: "POST", headers: { "x-admin-session": token }, cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { recovered?: number };
        if (result.recovered) { await Promise.all([fetchLive(token), fetchSummary(token, dates, true)]); }
      } catch { /* The existing hourly PayU reconciliation remains the fallback. */ }
      finally { reconciliationLoading.current = false; }
    };
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 60_000);
    return () => window.clearInterval(timer);
  }, [token, dates, fetchLive, fetchSummary]);
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
    localStorage.setItem("ar_tracking_columns_v1", JSON.stringify(next));
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
  const currentViewConfig = (): TrackingViewConfig => ({ columnIds, sort, accountId, search, hourMetric, activeOnly, activeScope });
  const applyView = (view: TrackingSavedView) => {
    setColumns(view.columnIds);
    setSort(view.sort);
    setAccountId(view.accountId);
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
      const response = await fetch("/api/admin/tracking/views", {
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
      const response = await fetch(`/api/admin/tracking/views?id=${encodeURIComponent(selectedViewId)}`, { method: "DELETE", headers: { "x-admin-session": token } });
      if (!response.ok) throw new Error("Unable to delete view");
      setSavedViews((current) => current.filter((view) => view.id !== selectedViewId));
      setSelectedViewId(null); setViewName("");
    } catch (cause) { setViewError(cause instanceof Error ? cause.message : "Unable to delete view"); }
    finally { setViewBusy(false); }
  };

  const filtered = useMemo(() => {
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
  }, [summary, accountId, search, sort, activeOnly, activeScope]);

  const visibleTotals = useMemo(() => {
    const rows = accountId === "all" ? summary?.campaigns || [] : (summary?.campaigns || []).filter((row) => row.accountId === accountId);
    return {
      spend: rows.reduce((sum, row) => sum + (row.spendInr || 0), 0),
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      matched: rows.reduce((sum, row) => sum + (row.accountId ? row.orders : 0), 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      refunds: rows.reduce((sum, row) => sum + row.refundAmount, 0),
    };
  }, [summary, accountId]);
  const visibleProfit = useMemo(() => {
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
      gst += indianAdGstApplies(day) ? calculateProfitSheetGst(revenue, 0.18, indianSpend).gst : revenue * 0.05;
    }
    return visibleTotals.revenue - visibleTotals.spend - gst;
  }, [summary, accountId, dates, visibleTotals.revenue, visibleTotals.spend]);

  const hourly = useMemo(() => {
    const visible = new Set(filtered.map((row) => row.key));
    const rows = (summary?.hourly || []).filter((item) => item.date === hourDate && visible.has(item.campaignKey));
    const byCampaign = new Map<string, number[]>();
    const totals = Array.from({ length: 24 }, () => 0);
    for (const row of rows) {
      const value = hourMetric === "orders" ? row.orders : row.revenue;
      const hours = byCampaign.get(row.campaignKey) || Array.from({ length: 24 }, () => 0);
      hours[row.hour] += value;
      totals[row.hour] += value;
      byCampaign.set(row.campaignKey, hours);
    }
    return { totals, campaigns: filtered.map((row) => ({ key: row.key, name: row.campaignName, hours: byCampaign.get(row.key) || Array.from({ length: 24 }, () => 0) })).sort((a, b) => b.hours.reduce((sum, n) => sum + n, 0) - a.hours.reduce((sum, n) => sum + n, 0)) };
  }, [summary, filtered, hourDate, hourMetric]);
  const hourDates = useMemo(() => Array.from(
    { length: Math.floor((Date.parse(dates.end) - Date.parse(dates.start)) / 86_400_000) + 1 },
    (_, index) => new Date(Date.parse(`${dates.start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10)
  ), [dates]);
  const hourCampaign = summary?.campaigns.find((row) => row.key === hourCampaignKey) || null;

  function applyDates(range: TrackingRange) {
    setSummary(null);
    setDates(range);
    setHourDate(range.end);
    setError("");
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-slate-100">
      {hourCampaign && <TrackingHourlyModal campaign={hourCampaign} day={hourDate} hours={summary?.hourly || []} spend={hourSpend} error={hourSpendError} onClose={() => setHourCampaignKey(null)} />}
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>{toastSales.map((sale) => <motion.div key={sale.id} role="status" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.2 }} className="pointer-events-auto rounded-xl border border-emerald-400/35 bg-[#1b2437] p-4 shadow-2xl shadow-black/50">
          <div className="flex items-start gap-3"><div className="rounded-full bg-emerald-400/15 p-2 text-emerald-300"><ShoppingBag size={17} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">New sale · {sale.productType}</div><p className="mt-1 break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought {sale.productName}</p>{sale.campaign && <p className="mt-2 whitespace-normal break-words text-xs text-slate-400">Campaign: {sale.campaign}</p>}<div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">{displayIst(sale.at)} IST</span><span className="font-semibold text-emerald-300">{inr(sale.amount)}</span></div></div><button aria-label="Dismiss sale notification" onClick={() => { const timer = toastTimers.current.get(sale.id); if (timer) window.clearTimeout(timer); toastTimers.current.delete(sale.id); setToastSales((current) => current.filter((item) => item.id !== sale.id)); }} className="text-slate-500 hover:text-white"><X size={16} /></button></div>
        </motion.div>)}</AnimatePresence>
      </div>
      <div className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <button onClick={() => router.push("/admin")} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Admin</button>
            <h1 className="text-3xl font-semibold tracking-tight">Tracking</h1>
            <p className="mt-1 text-sm text-slate-400">Meta campaign performance and AstroRekha paid orders, joined by saved UTMs.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <TrackingDateRangePicker value={dates} maxDate={businessToday()} onChange={applyDates} />
            <button onClick={() => token && void fetchSummary(token, dates, true)} title="Refresh Meta and orders" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {summary?.warnings?.length ? <div className="mb-5 border-l-2 border-amber-400/70 pl-3 text-xs text-amber-100/75">{summary.warnings.join(" · ")}</div> : null}

        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Meta spend · INR", inr(visibleTotals.spend)],
            ["Paid orders", count(visibleTotals.orders)],
            ["Net sales", inr(visibleTotals.revenue)],
            ["Profit after GST & ads", visibleProfit == null ? "—" : inr(visibleProfit)],
            ["Blended ROAS", ratio(visibleTotals.revenue, visibleTotals.spend)],
            ["Matched to Meta", `${visibleTotals.matched} / ${visibleTotals.orders}`],
          ].map(([label, value]) => <div key={label} className="bg-[#141b2b] px-4 py-4"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{value}</div></div>)}
        </div>
        <p className="-mt-4 mb-6 text-xs text-slate-500">Profit follows the Profit Sheet: confirmed net sales minus live Meta spend and net GST, including Indian ad GST credit. Matched to Meta counts paid orders whose campaign ID or unique UTM name matches a Meta campaign; unmatched orders still count in AR sales.</p>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 space-y-7">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Ad accounts</h2><p className="text-xs text-slate-500">Select an account to focus the campaign table and hourly sales.</p></div>
                <span className="text-xs text-slate-500">{summary ? `Direct Meta API · refreshes every ${dates.end === businessToday() ? "60s" : "5m"} · fetched ${displayIst(summary.fetchedAt)} IST` : "Loading Meta"}</span>
              </div>
              <div className="overflow-x-auto border-y border-white/10">
                <div className="flex min-w-max gap-0">
                  <button onClick={() => setAccountId("all")} className={`min-w-48 border-r border-white/10 px-4 py-3 text-left ${accountId === "all" ? "bg-white/10" : "hover:bg-white/5"}`}><div className="text-sm font-medium">All accounts</div><div className="mt-1 text-xs text-slate-400">{summary?.accounts.length || 0} connected</div></button>
                  {(summary?.accounts || []).map((account) => {
                    const rows = summary?.campaigns.filter((row) => row.accountId === account.id) || [];
                    const spend = rows.reduce((sum, row) => sum + (row.spendInr || 0), 0);
                    const orders = rows.reduce((sum, row) => sum + row.orders, 0);
                    return <button key={account.id} onClick={() => setAccountId(account.id)} className={`min-w-56 border-r border-white/10 px-4 py-3 text-left ${accountId === account.id ? "bg-white/10" : "hover:bg-white/5"}`}><div className="truncate text-sm font-medium">{account.name}</div><div className="mt-1 text-xs tabular-nums text-slate-400">{inr(spend)} · {orders} orders · {account.currency}</div>{account.error && <div className="mt-1 text-xs text-rose-300">Meta unavailable</div>}</button>;
                  })}
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Campaigns <span className="ml-2 text-sm font-normal text-slate-500">{filtered.length}</span></h2><p className="text-xs text-slate-500">Expand a campaign for Meta ad sets, then an ad set for ads. AR sales use saved UTMs.</p></div>
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
                        <p className="mt-2 text-[11px] text-slate-500">Columns, account, active filter, search, sort, and hourly metric are shared with admins. Dates stay separate.</p>{viewError && <p role="alert" className="mt-2 text-xs text-rose-300">{viewError}</p>}
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
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead className="sticky top-0 bg-[#1b2437] text-xs text-slate-400">
                    <tr><th className="w-8 px-2 py-3" />{activeColumns.map((column) =>
                      <th key={column.id}
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
                  <TrackingCampaignRows key={`${dates.start}:${dates.end}`} rows={filtered} columns={activeColumns} token={token} dates={dates} refreshKey={summary?.fetchedAt || ""} activeOnly={activeOnly} activeScope={activeScope} />
                </table>
                {!loading && filtered.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No campaigns or UTM orders for these filters.</div>}
                {loading && <div className="p-10 text-center text-sm text-slate-500">Loading campaigns and orders…</div>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Drag column headers to reorder them. Meta spend and AR sales use the Profit Sheet 11:30 AM IST business day; other Meta insight metrics use each account&apos;s calendar reporting window. Direct Meta API data refreshes every 60 seconds for today, but Meta reporting itself can lag. USD spend is converted with {summary?.fxRateSource || "the saved Profit Sheet rate"}; other currencies show no INR ROAS.</p>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Hourly sales by campaign</h2><p className="text-xs text-slate-500">Hourly windows begin at 11:30 AM IST, matching the Profit Sheet. Refunds reduce revenue in the window recorded.</p></div><div className="flex items-center gap-2"><select aria-label="Hourly breakdown day" value={hourDate} onChange={(event) => setHourDate(event.target.value)} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm">{hourDates.map((day) => <option key={day} value={day}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}</option>)}</select><select value={hourMetric} onChange={(event) => setHourMetric(event.target.value as "orders" | "revenue")} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm"><option value="orders">Orders</option><option value="revenue">Net sales</option></select></div></div>
              <TrackingHourlyTable rows={hourly.campaigns} totals={hourly.totals} metric={hourMetric} onOpen={setHourCampaignKey} />
            </section>
          </main>

          <aside className="min-w-0">
            <div className="sticky top-5 overflow-hidden rounded-xl border border-white/10 bg-[#141b2b]">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={18} className="text-[#e51b50]" /> Live sales</h2><span className="flex items-center gap-1 text-xs text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> {newSaleIds.length ? `${newSaleIds.length} new` : "5s refresh"}</span></div>
                <div className="mt-4 flex items-end justify-between"><div><div className="text-xs text-slate-500">Business day · 11:30 AM IST</div><div className="text-3xl font-semibold tabular-nums">{live?.todayCount ?? "—"}</div></div><div className="text-right"><div className="text-xs text-slate-500">Gross sales</div><div className="text-lg font-medium tabular-nums">{live ? inr(live.todayRevenue) : "—"}</div></div></div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">{live?.sales.map((sale) => <div key={sale.id} className={`border-b border-white/5 px-4 py-3 transition-colors duration-700 ${newSaleIds.includes(sale.id) ? "bg-[#e51b50]/20" : ""}`}><div className="flex gap-3"><div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><ShoppingBag size={15} /></div><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought <span className="font-medium text-white">{sale.productName}</span></p><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span>{sale.productType}</span><span className="shrink-0">{displayIst(sale.at)}</span></div>{sale.campaign && <p className="mt-1 whitespace-normal break-words text-[11px] text-slate-400">Campaign: {sale.campaign}</p>}</div></div><div className="mt-1 text-right text-xs font-semibold text-emerald-300">{inr(sale.amount)}</div></div>)}{!live?.sales.length && <div className="px-4 py-8 text-center text-sm text-slate-500">No paid sales in this business day yet.</div>}</div>
            </div>
          </aside>
        </div>
        <section className="mt-8 border-t border-white/10 pt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Meta action log</h2><p className="text-xs text-slate-500">Campaign, ad set and ad edits recorded by Meta for the selected date range and account.</p></div><span className="text-xs text-slate-500">{activityLoading ? "Refreshing…" : `${activities.length} changes shown`}</span></div>
          {activityWarnings.length > 0 && <div role="alert" className="mb-3 border-l-2 border-amber-400/70 pl-3 text-xs text-amber-200">{activityWarnings.join(" · ")}</div>}
          <div className="max-h-[520px] overflow-auto rounded-xl border border-white/10 bg-[#141b2b]"><table className="w-full min-w-[740px] text-sm"><thead className="sticky top-0 bg-[#1b2437] text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Time · IST</th><th className="px-4 py-3 text-left">Account</th><th className="px-4 py-3 text-left">Changed by</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Campaign / ad set / ad</th><th className="px-4 py-3 text-left">Change</th></tr></thead><tbody>{activities.map((item) => <tr key={item.id} className="border-t border-white/5"><td className="whitespace-nowrap px-4 py-3 text-slate-400">{item.at ? displayIst(item.at) : "—"}</td><td className="px-4 py-3 text-slate-400">{item.accountName}</td><td className="px-4 py-3 text-slate-300">{item.actor}</td><td className="px-4 py-3 text-white">{item.action}</td><td className="px-4 py-3 text-slate-300">{item.objectType && <span className="mr-2 rounded border border-cyan-400/25 px-1.5 py-0.5 text-[10px] uppercase text-cyan-300">{item.objectType}</span>}{item.object}</td><td className="px-4 py-3 text-cyan-200">{item.detail || "—"}</td></tr>)}</tbody></table>{!activities.length && !activityLoading && <div className="px-5 py-8 text-center text-sm text-slate-500">No Meta edits were returned for this range.</div>}</div>
          <p className="mt-2 text-xs text-slate-500">Read directly from Meta account activities. Meta may omit or delay some history, and older changes outside the selected range are excluded.</p>
        </section>
      </div>
    </div>
  );
}
