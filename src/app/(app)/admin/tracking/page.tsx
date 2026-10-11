"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Columns3, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import type { TrackingCampaign, TrackingSale, TrackingSummary } from "@/lib/tracking-dashboard";

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
  { id: "account", label: "Ad account", group: "Identity", value: (r) => r.accountName, sort: (r) => r.accountName },
  { id: "campaign", label: "Campaign", group: "Identity", value: (r) => r.campaignName, sort: (r) => r.campaignName },
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
  { id: "cpc", label: "CPC", group: "Meta", value: (r) => r.clicks ? amount(r.spend / r.clicks, r.currency) : "—", sort: (r) => r.clicks ? r.spend / r.clicks : 0, align: "right" },
  { id: "cpm", label: "CPM", group: "Meta", value: (r) => r.impressions ? amount(r.spend / r.impressions * 1000, r.currency) : "—", sort: (r) => r.impressions ? r.spend / r.impressions * 1000 : 0, align: "right" },
  { id: "landingPageViews", label: "Landing views", group: "Meta", value: (r) => count(r.landingPageViews), sort: (r) => r.landingPageViews, align: "right" },
  { id: "addToCarts", label: "Add to carts", group: "Meta", value: (r) => count(r.addToCarts), sort: (r) => r.addToCarts, align: "right" },
  { id: "checkouts", label: "Checkouts", group: "Meta", value: (r) => count(r.checkouts), sort: (r) => r.checkouts, align: "right" },
  { id: "leads", label: "Leads", group: "Meta", value: (r) => count(r.leads), sort: (r) => r.leads, align: "right" },
  { id: "metaPurchases", label: "Meta purchases", group: "Meta", value: (r) => count(r.metaPurchases), sort: (r) => r.metaPurchases, align: "right" },
  { id: "metaCostPerPurchase", label: "Meta cost / purchase", group: "Meta", value: (r) => r.metaPurchases ? amount(r.spend / r.metaPurchases, r.currency) : "—", sort: (r) => r.metaPurchases ? r.spend / r.metaPurchases : 0, align: "right" },
  { id: "metaPurchaseValue", label: "Meta purchase value", group: "Meta", value: (r) => amount(r.metaPurchaseValue, r.currency), sort: (r) => r.metaPurchaseValue, align: "right" },
  { id: "metaRoas", label: "Meta ROAS", group: "Meta", value: (r) => ratio(r.metaPurchaseValue, r.spend), sort: (r) => r.spend ? r.metaPurchaseValue / r.spend : 0, align: "right" },
  { id: "orders", label: "UTM orders", group: "AstroRekha", value: (r) => count(r.orders), sort: (r) => r.orders, align: "right" },
  { id: "grossRevenue", label: "Gross sales", group: "AstroRekha", value: (r) => inr(r.grossRevenue), sort: (r) => r.grossRevenue, align: "right" },
  { id: "refunds", label: "Refunds", group: "AstroRekha", value: (r) => count(r.refunds), sort: (r) => r.refunds, align: "right" },
  { id: "refundAmount", label: "Refund amount", group: "AstroRekha", value: (r) => inr(r.refundAmount), sort: (r) => r.refundAmount, align: "right" },
  { id: "revenue", label: "Net sales", group: "AstroRekha", value: (r) => inr(r.revenue), sort: (r) => r.revenue, align: "right" },
  { id: "utmRoas", label: "UTM ROAS", group: "AstroRekha", value: (r) => ratio(r.revenue, r.spendInr), sort: (r) => r.spendInr ? r.revenue / r.spendInr : 0, align: "right" },
  { id: "cpa", label: "UTM CPA", group: "AstroRekha", value: (r) => r.orders && r.spendInr != null ? inr(r.spendInr / r.orders) : "—", sort: (r) => r.orders && r.spendInr ? r.spendInr / r.orders : 0, align: "right" },
  { id: "aov", label: "AOV", group: "AstroRekha", value: (r) => r.orders ? inr(r.grossRevenue / r.orders) : "—", sort: (r) => r.orders ? r.grossRevenue / r.orders : 0, align: "right" },
  { id: "utmSource", label: "UTM source", group: "AstroRekha", value: (r) => labels(r.utmSources), sort: (r) => r.utmSources.join(",") },
  { id: "utmMedium", label: "UTM medium", group: "AstroRekha", value: (r) => labels(r.utmMediums), sort: (r) => r.utmMediums.join(",") },
  { id: "utmTerm", label: "UTM term / ad set", group: "AstroRekha", value: (r) => labels(r.utmTerms), sort: (r) => r.utmTerms.join(",") },
  { id: "utmContent", label: "UTM content / ad", group: "AstroRekha", value: (r) => labels(r.utmContents), sort: (r) => r.utmContents.join(",") },
];
const PRESETS: Record<string, string[]> = {
  Performance: ["account", "campaign", "status", "spendInr", "impressions", "clicks", "ctr", "cpc", "metaPurchases", "metaCostPerPurchase", "metaRoas", "orders", "revenue", "utmRoas", "cpa"],
  Attribution: ["account", "campaign", "campaignId", "utmSource", "utmMedium", "utmTerm", "utmContent", "orders", "grossRevenue", "refundAmount", "revenue", "utmRoas"],
  All: COLUMNS.map((column) => column.id),
};
const DEFAULT_COLUMNS = PRESETS.Performance;

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() - (11 * 60 + 30) * 60_000));
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function dateDaysAgo(days: number) {
  const date = new Date(`${businessToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function displayIst(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function hourLabel(bucket: number) {
  const minutes = (11 * 60 + 30 + bucket * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default function TrackingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [dates, setDates] = useState({ start: dateDaysAgo(6), end: businessToday() });
  const [draft, setDraft] = useState(dates);
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountId, setAccountId] = useState("all");
  const [search, setSearch] = useState("");
  const [columnIds, setColumnIds] = useState<string[]>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sort, setSort] = useState({ id: "spendInr", desc: true });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hourDate, setHourDate] = useState(dates.end);
  const [hourMetric, setHourMetric] = useState<"orders" | "revenue">("orders");
  const [newSaleIds, setNewSaleIds] = useState<string[]>([]);
  const [toastSales, setToastSales] = useState<TrackingSale[]>([]);
  const seenSales = useRef<Set<string> | null>(null);
  const toastTimers = useRef<Map<string, number>>(new Map());
  const summaryRequest = useRef(0);
  const liveLoading = useRef(false);

  useEffect(() => {
    const session = localStorage.getItem("admin_session_token");
    const expiry = localStorage.getItem("admin_session_expiry");
    if (!session || !expiry || new Date(expiry) <= new Date()) { router.replace("/admin/login"); return; }
    setToken(session);
    try {
      const stored = JSON.parse(localStorage.getItem("ar_tracking_columns_v1") || "null");
      if (Array.isArray(stored)) {
        const valid = stored.filter((id: unknown) => typeof id === "string" && COLUMNS.some((column) => column.id === id));
        if (valid.length) setColumnIds(Array.from(new Set(valid)));
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
    void fetchLive(token);
    const timer = window.setInterval(() => void fetchLive(token), 5_000);
    return () => window.clearInterval(timer);
  }, [token, fetchLive]);
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
  const activeColumns = columnIds.map((id) => COLUMNS.find((column) => column.id === id)).filter((column): column is Column => !!column);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (summary?.campaigns || []).filter((row) =>
      (accountId === "all" || row.accountId === accountId) &&
      (!needle || [row.campaignName, row.campaignId, row.accountName, ...row.utmTerms, ...row.utmContents].join(" ").toLowerCase().includes(needle))
    );
    const column = COLUMNS.find((item) => item.id === sort.id);
    return rows.sort((a, b) => {
      const av = column?.sort(a) ?? 0;
      const bv = column?.sort(b) ?? 0;
      const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.desc ? -comparison : comparison;
    });
  }, [summary, accountId, search, sort]);

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

  const hourly = useMemo(() => {
    const visible = new Set((summary?.campaigns || []).filter((row) => accountId === "all" || row.accountId === accountId).map((row) => row.key));
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
    const names = new Map((summary?.campaigns || []).map((row) => [row.key, row.campaignName]));
    return { totals, campaigns: Array.from(byCampaign.entries()).sort((a, b) => b[1].reduce((sum, n) => sum + n, 0) - a[1].reduce((sum, n) => sum + n, 0)).map(([key, hours]) => ({ key, name: names.get(key) || key, hours })) };
  }, [summary, accountId, hourDate, hourMetric]);
  const maxHour = hourly.campaigns.reduce((max, row) => Math.max(max, ...row.hours), Math.max(1, ...hourly.totals));

  function applyRange() {
    if (draft.start > draft.end || draft.end > businessToday() || (Date.parse(draft.end) - Date.parse(draft.start)) / 86_400_000 > 30) {
      setError("Choose a valid date range of up to 31 days."); return;
    }
    setDates(draft);
    setHourDate(draft.end);
  }
  function preset(days: number) {
    const next = { start: dateDaysAgo(days - 1), end: businessToday() };
    setDraft(next); setDates(next); setHourDate(next.end);
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-slate-100">
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>{toastSales.map((sale) => <motion.div key={sale.id} role="status" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.2 }} className="pointer-events-auto rounded-xl border border-emerald-400/35 bg-[#1b2437] p-4 shadow-2xl shadow-black/50">
          <div className="flex items-start gap-3"><div className="rounded-full bg-emerald-400/15 p-2 text-emerald-300"><ShoppingBag size={17} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">New sale · {sale.productType}</div><p className="mt-1 break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought {sale.productName}</p><div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">{displayIst(sale.at)} IST</span><span className="font-semibold text-emerald-300">{inr(sale.amount)}</span></div></div><button aria-label="Dismiss sale notification" onClick={() => { const timer = toastTimers.current.get(sale.id); if (timer) window.clearTimeout(timer); toastTimers.current.delete(sale.id); setToastSales((current) => current.filter((item) => item.id !== sale.id)); }} className="text-slate-500 hover:text-white"><X size={16} /></button></div>
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
            <button onClick={() => preset(1)} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">Today</button>
            <button onClick={() => preset(7)} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">7 days</button>
            <button onClick={() => preset(30)} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">30 days</button>
            <label className="text-xs text-slate-400">From<input type="date" value={draft.start} max={draft.end} onChange={(event) => setDraft({ ...draft, start: event.target.value })} className="mt-1 block rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-slate-400">To<input type="date" value={draft.end} min={draft.start} max={businessToday()} onChange={(event) => setDraft({ ...draft, end: event.target.value })} className="mt-1 block rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm text-white" /></label>
            <button onClick={applyRange} className="rounded-lg bg-[#e51b50] px-4 py-2 text-sm font-semibold hover:bg-[#f02a5e]">Apply</button>
            <button onClick={() => token && void fetchSummary(token, dates, true)} title="Refresh Meta and orders" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {summary?.warnings?.length ? <div className="mb-5 border-l-2 border-amber-400/70 pl-3 text-xs text-amber-100/75">{summary.warnings.join(" · ")}</div> : null}

        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-5">
          {[
            ["Meta spend · INR", inr(visibleTotals.spend)],
            ["Paid orders", count(visibleTotals.orders)],
            ["Net sales", inr(visibleTotals.revenue)],
            ["Blended ROAS", ratio(visibleTotals.revenue, visibleTotals.spend)],
            ["Matched to Meta", `${visibleTotals.matched} / ${visibleTotals.orders}`],
          ].map(([label, value]) => <div key={label} className="bg-[#141b2b] px-4 py-4"><div className="text-xs uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{value}</div></div>)}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 space-y-7">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Ad accounts</h2><p className="text-xs text-slate-500">Select an account to focus the campaign table and hourly sales.</p></div>
                <span className="text-xs text-slate-500">{summary ? `Meta fetched ${displayIst(summary.fetchedAt)} IST` : "Loading Meta"}</span>
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
                <div><h2 className="text-lg font-semibold">Campaigns <span className="ml-2 text-sm font-normal text-slate-500">{filtered.length}</span></h2><p className="text-xs text-slate-500">Meta metrics and paid-order UTMs are separate sources. Click a row for ad set and ad names from UTMs.</p></div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2"><Search size={15} className="text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaign or ad" className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-600" /></label>
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
                  <thead className="sticky top-0 bg-[#1b2437] text-xs text-slate-400"><tr><th className="w-8 px-2 py-3" />{activeColumns.map((column) => <th key={column.id} className={`whitespace-nowrap border-b border-white/10 px-3 py-3 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}><button onClick={() => setSort({ id: column.id, desc: sort.id === column.id ? !sort.desc : true })} className="inline-flex items-center gap-1 hover:text-white">{column.label}{sort.id === column.id && <span>{sort.desc ? "↓" : "↑"}</span>}</button></th>)}</tr></thead>
                  <tbody>{filtered.map((row) => <Fragment key={row.key}><tr onClick={() => setExpanded(expanded === row.key ? null : row.key)} className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"><td className="px-2 py-3 text-slate-500"><button type="button" aria-label={`${expanded === row.key ? "Collapse" : "Expand"} ${row.campaignName}`} onClick={(event) => { event.stopPropagation(); setExpanded(expanded === row.key ? null : row.key); }}>{expanded === row.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>{activeColumns.map((column) => <td key={column.id} title={column.value(row)} className={`max-w-[240px] truncate px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"} ${column.id === "campaign" ? "font-medium text-white" : "text-slate-300"}`}>{column.value(row)}</td>)}</tr>{expanded === row.key && <tr key={`${row.key}:detail`} className="bg-[#111827]"><td colSpan={activeColumns.length + 1} className="px-5 py-4"><div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-400"><span>Match: {row.attribution === "meta_id" ? "saved campaign ID" : row.attribution === "utm_id" ? "UTM campaign ID" : row.attribution === "unique_name" ? "unique campaign name" : row.attribution === "utm_only" ? "UTM only" : "no matched sales"}</span><span>Campaign ID: {row.campaignId || "—"}</span><span>Currency: {row.currency}</span></div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">UTM ad set / ad breakdown</h3>{row.adBreakdown.length ? <div className="max-h-48 overflow-auto"><table className="w-full text-xs"><thead className="text-slate-500"><tr><th className="py-1 text-left">utm_term · ad set</th><th className="py-1 text-left">utm_content · ad</th><th className="py-1 text-right">Orders</th><th className="py-1 text-right">Gross sales</th></tr></thead><tbody>{row.adBreakdown.slice().sort((a, b) => b.revenue - a.revenue).map((item, index) => <tr key={`${item.term}:${item.content}:${index}`} className="border-t border-white/5"><td className="py-2 pr-3">{item.term}</td><td className="py-2 pr-3">{item.content}</td><td className="py-2 text-right">{item.orders}</td><td className="py-2 text-right">{inr(item.revenue)}</td></tr>)}</tbody></table></div> : <p className="text-xs text-slate-500">No attributed orders in this range.</p>}</td></tr>}</Fragment> )}</tbody>
                </table>
                {!loading && filtered.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No campaigns or UTM orders for these filters.</div>}
                {loading && <div className="p-10 text-center text-sm text-slate-500">Loading campaigns and orders…</div>}
              </div>
              <p className="mt-2 text-xs text-slate-500">Meta spend uses each account&apos;s calendar dates and timezone. Paid-order dates and hourly sales use the Profit Sheet 11:30 AM IST business day. USD spend is converted with {summary?.fxRateSource || "the saved Profit Sheet rate"}; other currencies show no INR ROAS.</p>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Hourly sales by campaign</h2><p className="text-xs text-slate-500">Hourly windows begin at 11:30 AM IST, matching the Profit Sheet. Refunds reduce revenue in the window recorded.</p></div><div className="flex items-center gap-2"><input type="date" min={dates.start} max={dates.end} value={hourDate} onChange={(event) => setHourDate(event.target.value)} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm" /><select value={hourMetric} onChange={(event) => setHourMetric(event.target.value as "orders" | "revenue")} className="rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm"><option value="orders">Orders</option><option value="revenue">Net sales</option></select></div></div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]"><table className="min-w-[1550px] w-full border-collapse text-xs"><thead className="bg-[#1b2437] text-slate-500"><tr><th className="sticky left-0 z-10 min-w-48 bg-[#1b2437] px-3 py-3 text-left">Campaign</th>{Array.from({ length: 24 }, (_, hour) => <th key={hour} title={`${hourLabel(hour)}–${hourLabel(hour + 1)} IST`} className="min-w-12 px-1 py-3 text-center">{hourLabel(hour)}</th>)}</tr></thead><tbody><tr className="border-b border-white/10 font-semibold"><td className="sticky left-0 bg-[#141b2b] px-3 py-3">All shown campaigns</td>{hourly.totals.map((value, hour) => <td key={hour} title={hourMetric === "revenue" ? inr(value) : `${value} orders`} className="px-1 py-3 text-center tabular-nums">{value ? hourMetric === "orders" ? count(value) : decimal(value) : "·"}</td>)}</tr>{hourly.campaigns.map((row) => <tr key={row.key} className="border-b border-white/5 hover:bg-white/5"><td title={row.name} className="sticky left-0 max-w-48 truncate bg-[#141b2b] px-3 py-2">{row.name}</td>{row.hours.map((value, hour) => <td key={hour} title={hourMetric === "revenue" ? inr(value) : `${value} orders`} style={{ backgroundColor: value > 0 ? `rgba(229,27,80,${Math.min(0.55, 0.12 + Math.abs(value) / maxHour * 0.43)})` : undefined }} className="px-1 py-2 text-center tabular-nums text-slate-200">{value ? hourMetric === "orders" ? count(value) : decimal(value) : "·"}</td>)}</tr>)}</tbody></table>{!hourly.campaigns.length && <div className="p-6 text-center text-xs text-slate-500">No paid sales for this date and account filter.</div>}</div>
            </section>
          </main>

          <aside className="min-w-0">
            <div className="sticky top-5 overflow-hidden rounded-xl border border-white/10 bg-[#141b2b]">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={18} className="text-[#e51b50]" /> Live sales</h2><span className="flex items-center gap-1 text-xs text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> {newSaleIds.length ? `${newSaleIds.length} new` : "5s refresh"}</span></div>
                <div className="mt-4 flex items-end justify-between"><div><div className="text-xs text-slate-500">Business day · 11:30 AM IST</div><div className="text-3xl font-semibold tabular-nums">{live?.todayCount ?? "—"}</div></div><div className="text-right"><div className="text-xs text-slate-500">Gross sales</div><div className="text-lg font-medium tabular-nums">{live ? inr(live.todayRevenue) : "—"}</div></div></div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">{live?.sales.map((sale) => <div key={sale.id} className={`border-b border-white/5 px-4 py-3 transition-colors duration-700 ${newSaleIds.includes(sale.id) ? "bg-[#e51b50]/20" : ""}`}><div className="flex gap-3"><div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><ShoppingBag size={15} /></div><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{sale.email}</p><p className="mt-1 text-xs text-slate-300">bought <span className="font-medium text-white">{sale.productName}</span></p><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span className="truncate">{sale.productType}{sale.campaign ? ` · ${sale.campaign}` : ""}</span><span className="shrink-0">{displayIst(sale.at)}</span></div></div></div><div className="mt-1 text-right text-xs font-semibold text-emerald-300">{inr(sale.amount)}</div></div>)}{!live?.sales.length && <div className="px-4 py-8 text-center text-sm text-slate-500">No paid sales in this business day yet.</div>}</div>
              <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-500">New paid orders appear here and in a top-right notification after payment confirmation. The listed time is the transaction time. Only admins can view customer emails.</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
