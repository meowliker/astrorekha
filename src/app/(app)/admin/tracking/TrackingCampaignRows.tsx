"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { campaignNameKey, type TrackingCampaign, type TrackingChild } from "@/lib/tracking-dashboard";
import type { MetaBudget } from "@/lib/tracking-meta-budget";
import TrackingBudgetDialog, { type BudgetTarget } from "./TrackingBudgetDialog";

type Column = { id: string; label: string; value: (row: TrackingCampaign) => string; align?: "right" };
type Props = { rows: TrackingCampaign[]; columns: Column[]; token: string | null; dates: { start: string; end: string }; refreshKey: string; activeOnly: boolean; activeScope: "campaign" | "adset" | "ad" | "all"; onBudgetSaved: () => void };
type ChildData = { adsets: TrackingChild[]; ads: TrackingChild[] };
type CachedChildren = { data: ChildData; fetchedAt: number };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CACHE_TTL = 60_000;

function readCachedChildren(key: string): CachedChildren | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || "null") as CachedChildren | null;
    return saved?.data?.adsets && saved?.data?.ads && Date.now() - saved.fetchedAt < 24 * 60 * 60_000 ? saved : null;
  } catch { return null; }
}

function matchUnique<T extends TrackingChild>(rows: T[], id: string | null, name: string, parentId?: string): T | null {
  const candidates = parentId ? rows.filter((row) => row.parentId === parentId) : rows;
  if (id) return candidates.find((row) => row.id === id) || null;
  if (!name || name === "—") return null;
  const matches = candidates.filter((row) => campaignNameKey(row.campaignName) === campaignNameKey(name));
  return matches.length === 1 ? matches[0] : null;
}

function addOrder(target: TrackingChild, item: TrackingCampaign["adBreakdown"][number], byId: boolean) {
  target.orders += item.orders;
  target.grossRevenue += item.grossRevenue;
  target.refunds += item.refunds;
  target.refundAmount += item.refundAmount;
  target.revenue += item.revenue;
  target.attribution = byId ? "meta_id" : "unique_name";
}

function CampaignRow({ row, columns, token, dates, refreshKey, activeOnly, activeScope, onBudgetSaved }: { row: TrackingCampaign; columns: Column[]; token: string | null; dates: Props["dates"]; refreshKey: string; activeOnly: boolean; activeScope: Props["activeScope"]; onBudgetSaved: () => void }) {
  const cacheKey = `ar_tracking_children_v1:${dates.start}:${dates.end}:${row.accountId}:${row.campaignId}`;
  const [open, setOpen] = useState(false);
  const [cached, setCached] = useState<CachedChildren | null>(() => readCachedChildren(cacheKey));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedRetry, setLoadedRetry] = useState(0);
  const [openAdsets, setOpenAdsets] = useState<string[]>([]);
  const [budgetTarget, setBudgetTarget] = useState<BudgetTarget | null>(null);

  function savedBudget(budget: MetaBudget) {
    if (budget.level === "adset") setCached((current) => {
      if (!current) return current;
      const amount = budget.amountMinor / 10 ** budget.fractionDigits;
      const next = { ...current, data: { ...current.data, adsets: current.data.adsets.map((item) => item.id === budget.id ? { ...item, dailyBudget: budget.type === "daily" ? amount : null, lifetimeBudget: budget.type === "lifetime" ? amount : null } : item) } };
      try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Keep the in-memory result. */ }
      return next;
    });
    onBudgetSaved();
  }

  useEffect(() => {
    if (!open || !token || !row.accountId || !row.campaignId) return;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL && loadedRetry === retry) return;
    const controller = new AbortController();
    if (!cached) setLoading(true);
    const params = new URLSearchParams({ mode: "children", accountId: row.accountId, campaignId: row.campaignId, ...dates });
    fetch(`/api/admin/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Meta details unavailable"); return data; })
      .then((data: ChildData) => {
        const next = { data, fetchedAt: Date.now() };
        setCached(next); setLoadedRetry(retry); setError(""); setLoading(false);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Keep the in-memory result. */ }
      })
      .catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Meta details unavailable"); setLoading(false); } });
    return () => controller.abort();
  }, [open, cached, refreshKey, token, row.accountId, row.campaignId, dates, retry, loadedRetry, cacheKey]);

  const hierarchy = useMemo(() => {
    const children = cached?.data;
    if (!children) return null;
    const adsets = children.adsets.map((item) => ({ ...item }));
    const ads = children.ads.map((item) => ({ ...item }));
    for (const item of row.adBreakdown) {
      const adset = matchUnique(adsets, item.adsetId, item.term);
      const ad = matchUnique(ads, item.adId, item.content, adset?.id);
      const parent = adset || (ad ? adsets.find((candidate) => candidate.id === ad.parentId) : null);
      if (parent) addOrder(parent, item, Boolean(item.adsetId || item.adId));
      if (ad) addOrder(ad, item, Boolean(item.adId));
    }
    adsets.sort((a, b) => (b.spendInr || 0) - (a.spendInr || 0));
    ads.sort((a, b) => (b.spendInr || 0) - (a.spendInr || 0));
    return { adsets, ads };
  }, [cached, row.adBreakdown]);
  const shownAds = hierarchy?.ads.filter((item) => !activeOnly || !["ad", "all"].includes(activeScope) || item.status === "ACTIVE") || [];
  const shownAdsets = hierarchy?.adsets.filter((item) =>
    !activeOnly || activeScope === "campaign" ||
    (item.status === "ACTIVE" && (activeScope !== "ad" || shownAds.some((ad) => ad.parentId === item.id)))
  ) || [];

  const cells = (item: TrackingCampaign, level: 0 | 1 | 2) => columns.map((column) => <td key={column.id} title={column.value(item)} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"} ${column.id === "campaign" ? "font-medium text-white" : "text-slate-300"}`}>
    {column.id === "budget" ? <span className="inline-flex items-center gap-2 whitespace-nowrap">{column.value(item) === "—" ? (!item.accountId || level === 2 ? "—" : level === 0 ? "At ad set" : "At campaign") : column.value(item)}{token && item.accountId && (level === 1 || (level === 0 && item.campaignId)) && (item.dailyBudget != null || item.lifetimeBudget != null) && <button type="button" aria-label={`Edit ${level === 0 ? "campaign" : "ad set"} budget for ${item.campaignName}`} title="Edit budget in Meta" onClick={(event) => { event.stopPropagation(); setBudgetTarget({ accountId: item.accountId!, id: level === 0 ? item.campaignId! : (item as TrackingChild).id, level: level === 0 ? "campaign" : "adset", name: item.campaignName }); }} className="rounded border border-cyan-400/30 p-1 text-cyan-300 hover:bg-cyan-400/10"><Pencil size={12} /></button>}</span> :
    <span className={column.id === "campaign" ? "flex items-center gap-2" : "block truncate"} style={column.id === "campaign" ? { paddingLeft: `${level * 22}px` } : undefined}>
      {column.id === "campaign" && level > 0 && <span className="shrink-0 rounded border border-cyan-400/25 px-1 text-[10px] uppercase text-cyan-300">{level === 1 ? "Set" : "Ad"}</span>}
      <span className="truncate">{column.value(item)}</span>
    </span>}
  </td>);

  return <Fragment>
    <tr onClick={() => setOpen(!open)} className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5">
      <td className="px-2 py-3 text-slate-500"><button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${row.campaignName}`} onClick={(event) => { event.stopPropagation(); setOpen(!open); }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>{cells(row, 0)}
    </tr>
    {open && loading && !cached && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">Loading Meta ad sets and ads…</td></tr>}
    {open && error && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-rose-300">{error} <button onClick={() => { setError(""); setRetry((value) => value + 1); }} className="ml-2 underline">Retry</button></td></tr>}
    {open && !row.accountId && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">This UTM campaign has no unique Meta match, so Meta ad sets and ads cannot be loaded.</td></tr>}
    {open && hierarchy && !shownAdsets.length && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">{activeOnly && activeScope !== "campaign" ? "No matching active ad sets or ads in this campaign." : "No ad sets were returned by Meta for this campaign."}</td></tr>}
    {open && shownAdsets.map((adset) => {
      const ads = shownAds.filter((ad) => ad.parentId === adset.id);
      const adsetOpen = openAdsets.includes(adset.id);
      return <Fragment key={adset.id}>
        <tr onClick={() => setOpenAdsets((current) => adsetOpen ? current.filter((id) => id !== adset.id) : [...current, adset.id])} className="cursor-pointer border-b border-white/5 bg-[#111c2d] hover:bg-[#1a2a3c]">
          <td className="px-2 py-3 text-cyan-300">{ads.length ? adsetOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</td>{cells(adset, 1)}
        </tr>
        {adsetOpen && ads.map((ad) => <tr key={ad.id} className="border-b border-white/5 bg-[#0d1726]"><td className="px-2 py-3" />{cells(ad, 2)}</tr>)}
      </Fragment>;
    })}
    {open && hierarchy && row.orders > hierarchy.adsets.reduce((sum, item) => sum + item.orders, 0) && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-3 text-xs text-slate-500">{row.orders - hierarchy.adsets.reduce((sum, item) => sum + item.orders, 0)} campaign sale(s) lack a unique ad set ID or name. They remain in the campaign total.</td></tr>}
    {budgetTarget && token && <TrackingBudgetDialog target={budgetTarget} token={token} onClose={() => setBudgetTarget(null)} onSaved={savedBudget} />}
  </Fragment>;
}

export default function TrackingCampaignRows({ rows, columns, token, dates, refreshKey, activeOnly, activeScope, onBudgetSaved }: Props) {
  const currencies = Array.from(new Set(rows.filter((row) => row.accountId).map((row) => row.currency)));
  const mixedCurrencies = currencies.length > 1;
  const total = useMemo(() => rows.reduce<TrackingCampaign>((sum, row) => {
    for (const key of ["spend", "metaCalendarSpend", "impressions", "reach", "clicks", "linkClicks", "landingPageViews", "addToCarts", "checkouts", "metaPurchases", "metaPurchaseValue", "leads", "orders", "grossRevenue", "refunds", "refundAmount", "revenue"] as const) sum[key] = (sum[key] || 0) + (row[key] || 0);
    sum.spendInr = (sum.spendInr || 0) + (row.spendInr || 0);
    sum.dailyBudget = (sum.dailyBudget || 0) + (row.dailyBudget || 0);
    sum.lifetimeBudget = (sum.lifetimeBudget || 0) + (row.lifetimeBudget || 0);
    return sum;
  }, {
    key: "total", accountId: null, accountName: "All shown", currency: currencies[0] || "INR", campaignId: null,
    campaignName: "Overall result", objective: null, status: null, dailyBudget: null, lifetimeBudget: null,
    spend: 0, metaCalendarSpend: 0, spendInr: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
    landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0, metaPurchaseValue: 0,
    leads: 0, orders: 0, grossRevenue: 0, refunds: 0, refundAmount: 0, revenue: 0,
    utmSources: [], utmMediums: [], utmTerms: [], utmContents: [], attribution: "none", adBreakdown: [],
  }), [rows, currencies]);

  return <>
    <tbody>{rows.map((row) => <CampaignRow key={row.key} row={row} columns={columns} token={token} dates={dates} refreshKey={refreshKey} activeOnly={activeOnly} activeScope={activeScope} onBudgetSaved={onBudgetSaved} />)}</tbody>
    <tfoot><tr className="border-t-2 border-cyan-400/40 bg-[#202d40] text-sm font-semibold"><td className="px-2 py-3" />{columns.map((column) => <td key={column.id} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"}`} title={column.id === "budget" ? "Campaign and ad set budgets cannot be combined reliably in this total." : mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "Mixed account currencies; use Spend INR and AR metrics." : undefined}>{column.id === "budget" ? "—" : mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "—" : column.id === "spend" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: total.currency, maximumFractionDigits: 2 }).format(total.spend) : column.id === "campaign" ? "Overall result" : column.id === "account" ? "All shown" : column.id === "refundAmount" ? money(total.refundAmount) : column.value(total)}</td>)}</tr></tfoot>
  </>;
}
