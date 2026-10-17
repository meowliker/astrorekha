"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { campaignNameKey, type TrackingActivity, type TrackingCampaign, type TrackingChild, type TrackingDayMode } from "@/lib/tracking-dashboard";
import type { MetaBudget } from "@/lib/tracking-meta-budget";
import type { MetaBid } from "@/lib/tracking-meta-bid";
import TrackingBudgetDialog, { type BudgetTarget } from "./TrackingBudgetDialog";
import TrackingBidDialog, { type BidTarget } from "./TrackingBidDialog";

type Column = { id: string; label: string; value: (row: TrackingCampaign) => string; align?: "right" };
type Props = { rows: TrackingCampaign[]; columns: Column[]; token: string | null; dates: { start: string; end: string }; dayMode: TrackingDayMode; refreshKey: string; activeOnly: boolean; activeScope: "campaign" | "adset" | "ad" | "all"; onMetaEditSaved: (activity: TrackingActivity) => void };
type ChildData = { adsets: TrackingChild[]; ads: TrackingChild[] };
type CachedChildren = { data: ChildData; fetchedAt: number };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const metaMoney = (minor: number, currency: string, digits: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency, useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
const CACHE_TTL = 60_000;
const META_PURCHASE_COLUMNS = new Set(["metaPurchases", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas"]);
const META_WINDOW_UNAVAILABLE = "Meta purchase attribution is unavailable for this selected window because the ad account's reporting day does not match it exactly.";

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

function CampaignRow({ row, columns, token, dates, dayMode, refreshKey, activeOnly, activeScope, onMetaEditSaved }: { row: TrackingCampaign; columns: Column[]; token: string | null; dates: Props["dates"]; dayMode: TrackingDayMode; refreshKey: string; activeOnly: boolean; activeScope: Props["activeScope"]; onMetaEditSaved: Props["onMetaEditSaved"] }) {
  const cacheKey = `ar_soulmate_tracking_children_v3:${dayMode}:${dates.start}:${dates.end}:${row.accountId}:${row.campaignId}`;
  const [open, setOpen] = useState(false);
  const [cached, setCached] = useState<CachedChildren | null>(() => readCachedChildren(cacheKey));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedRetry, setLoadedRetry] = useState(0);
  const [openAdsets, setOpenAdsets] = useState<string[]>([]);
  const [budgetTarget, setBudgetTarget] = useState<BudgetTarget | null>(null);
  const [bidTarget, setBidTarget] = useState<BidTarget | null>(null);

  function savedBudget(budget: MetaBudget, previousAmountMinor: number) {
    if (budget.level === "adset") setCached((current) => {
      if (!current) return current;
      const amount = budget.amountMinor / 10 ** budget.fractionDigits;
      const next = { ...current, data: { ...current.data, adsets: current.data.adsets.map((item) => item.id === budget.id ? { ...item, dailyBudget: budget.type === "daily" ? amount : null, lifetimeBudget: budget.type === "lifetime" ? amount : null } : item) } };
      try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Keep the in-memory result. */ }
      return next;
    });
    onMetaEditSaved({ id: `local:${crypto.randomUUID()}`, accountId: budget.accountId, accountName: row.accountName,
      at: new Date().toISOString(), actor: "You", action: `${budget.level === "campaign" ? "Campaign" : "Ad set"} budget updated`,
      object: budget.name, objectType: budget.level === "campaign" ? "Campaign" : "Ad set", objectId: budget.id,
      campaignId: budget.level === "campaign" ? budget.id : row.campaignId,
      detail: `${metaMoney(previousAmountMinor, budget.currency, budget.fractionDigits)} → ${metaMoney(budget.amountMinor, budget.currency, budget.fractionDigits)}`,
      budgetChange: { before: previousAmountMinor / 10 ** budget.fractionDigits, after: budget.amountMinor / 10 ** budget.fractionDigits, currency: budget.currency } });
  }

  function savedBid(bid: MetaBid, previousAmountMinor: number) {
    setCached((current) => {
      if (!current) return current;
      const next = { ...current, data: { ...current.data, adsets: current.data.adsets.map((item) => item.id === bid.id ? { ...item, bidAmount: bid.amountMinor == null ? null : bid.amountMinor / 10 ** bid.fractionDigits, bidStrategy: bid.strategy } : item) } };
      try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Keep the in-memory result. */ }
      return next;
    });
    onMetaEditSaved({ id: `local:${crypto.randomUUID()}`, accountId: bid.accountId, accountName: row.accountName,
      at: new Date().toISOString(), actor: "You", action: "Ad set bid updated", object: bid.name,
      objectType: "Ad set", objectId: bid.id, campaignId: bid.campaignId,
      detail: `${metaMoney(previousAmountMinor, bid.currency, bid.fractionDigits)} → ${metaMoney(bid.amountMinor!, bid.currency, bid.fractionDigits)}` });
  }

  useEffect(() => {
    if (!open || !token || !row.accountId || !row.campaignId) return;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL && loadedRetry === retry) return;
    const controller = new AbortController();
    if (!cached) setLoading(true);
    const params = new URLSearchParams({ mode: "children", accountId: row.accountId, campaignId: row.campaignId, dayMode, ...dates });
    fetch(`/api/admin/soulmate/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Meta details unavailable"); return data; })
      .then((data: ChildData) => {
        const next = { data, fetchedAt: Date.now() };
        setCached(next); setLoadedRetry(retry); setError(""); setLoading(false);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Keep the in-memory result. */ }
      })
      .catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Meta details unavailable"); setLoading(false); } });
    return () => controller.abort();
  }, [open, cached, refreshKey, token, row.accountId, row.campaignId, dates, dayMode, retry, loadedRetry, cacheKey]);

  const hierarchy = useMemo(() => {
    const children = cached?.data;
    if (!children) return null;
    const adsets = children.adsets.map((item) => ({ ...item, metaPurchaseWindowAligned: row.metaPurchaseWindowAligned }));
    const ads = children.ads.map((item) => ({ ...item, metaPurchaseWindowAligned: row.metaPurchaseWindowAligned }));
    for (const item of row.adBreakdown) {
      const adset = matchUnique(adsets, item.adsetId, item.term);
      const ad = matchUnique(ads, item.adId, item.content, adset?.id);
      const parent = adset || (ad ? adsets.find((candidate) => candidate.id === ad.parentId) : null);
      if (parent) addOrder(parent, item, Boolean(item.adsetId || item.adId));
      if (ad) addOrder(ad, item, Boolean(item.adId));
    }
    if (row.utmVisits != null) {
      for (const item of [...adsets, ...ads]) item.utmVisits = 0;
      for (const visit of row.utmVisitBreakdown || []) {
        const adset = matchUnique(adsets, visit.adsetId, visit.term);
        const ad = matchUnique(ads, visit.adId, visit.content, adset?.id);
        const parent = adset || (ad ? adsets.find((candidate) => candidate.id === ad.parentId) : null);
        if (parent) parent.utmVisits = (parent.utmVisits || 0) + visit.visits;
        if (ad) ad.utmVisits = (ad.utmVisits || 0) + visit.visits;
      }
    }
    adsets.sort((a, b) => (b.spendInr || 0) - (a.spendInr || 0));
    ads.sort((a, b) => (b.spendInr || 0) - (a.spendInr || 0));
    return { adsets, ads };
  }, [cached, row.adBreakdown, row.utmVisitBreakdown, row.utmVisits, row.metaPurchaseWindowAligned]);
  const shownAds = hierarchy?.ads.filter((item) => !activeOnly || !["ad", "all"].includes(activeScope) || item.status === "ACTIVE") || [];
  const shownAdsets = hierarchy?.adsets.filter((item) =>
    !activeOnly || activeScope === "campaign" ||
    (item.status === "ACTIVE" && (activeScope !== "ad" || shownAds.some((ad) => ad.parentId === item.id)))
  ) || [];

  const cells = (item: TrackingCampaign, level: 0 | 1 | 2) => columns.map((column) => <td key={column.id} title={column.id === "bid" ? level === 0 ? "Meta bids are set on ad sets. Expand this campaign to view or edit them." : level === 1 && item.bidAmount == null ? "This ad set has no manual bid." : column.value(item) : META_PURCHASE_COLUMNS.has(column.id) && !item.metaPurchaseWindowAligned ? META_WINDOW_UNAVAILABLE : column.value(item)} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"} ${column.id === "campaign" ? "font-medium text-white" : "text-slate-300"}`}>
    {column.id === "budget" ? <span className="inline-flex items-center gap-2 whitespace-nowrap">{column.value(item) === "—" ? (!item.accountId || level === 2 ? "—" : level === 0 ? "At ad set" : "At campaign") : column.value(item)}{token && item.accountId && (level === 1 || (level === 0 && item.campaignId)) && (item.dailyBudget != null || item.lifetimeBudget != null) && <button type="button" aria-label={`Edit ${level === 0 ? "campaign" : "ad set"} budget for ${item.campaignName}`} title="Edit budget in Meta" onClick={(event) => { event.stopPropagation(); setBudgetTarget({ accountId: item.accountId!, id: level === 0 ? item.campaignId! : (item as TrackingChild).id, level: level === 0 ? "campaign" : "adset", name: item.campaignName }); }} className="rounded border border-cyan-400/30 p-1 text-cyan-300 hover:bg-cyan-400/10"><Pencil size={12} /></button>}</span> : column.id === "bid" ? <span className="inline-flex items-center gap-2 whitespace-nowrap">{!item.accountId ? "—" : level === 0 || level === 2 ? "At ad set" : item.bidAmount == null ? "Automatic" : column.value(item)}{token && level === 1 && item.accountId && item.bidAmount != null && <button type="button" aria-label={`Edit bid for ad set ${item.campaignName}`} title="Edit bid in Meta" onClick={(event) => { event.stopPropagation(); setBidTarget({ accountId: item.accountId!, adsetId: (item as TrackingChild).id, name: item.campaignName }); }} className="rounded border border-cyan-400/30 p-1 text-cyan-300 hover:bg-cyan-400/10"><Pencil size={12} /></button>}</span> :
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
    {bidTarget && token && <TrackingBidDialog target={bidTarget} token={token} onClose={() => setBidTarget(null)} onSaved={savedBid} />}
  </Fragment>;
}

export default function TrackingCampaignRows({ rows, columns, token, dates, dayMode, refreshKey, activeOnly, activeScope, onMetaEditSaved }: Props) {
  const currencies = Array.from(new Set(rows.filter((row) => row.accountId).map((row) => row.currency)));
  const mixedCurrencies = currencies.length > 1;
  const metaPurchaseWindowAligned = rows.some((row) => row.accountId) && rows.filter((row) => row.accountId).every((row) => row.metaPurchaseWindowAligned === true);
  const total = useMemo(() => rows.reduce<TrackingCampaign>((sum, row) => {
    for (const key of ["spend", "metaCalendarSpend", "impressions", "reach", "clicks", "linkClicks", "landingPageViews", "addToCarts", "checkouts", "metaPurchases", "metaPurchaseValue", "leads", "orders", "grossRevenue", "refunds", "refundAmount", "revenue"] as const) sum[key] = (sum[key] || 0) + (row[key] || 0);
    if (row.utmVisits != null) sum.utmVisits = (sum.utmVisits || 0) + row.utmVisits;
    sum.spendInr = (sum.spendInr || 0) + (row.spendInr || 0);
    sum.dailyBudget = (sum.dailyBudget || 0) + (row.dailyBudget || 0);
    sum.lifetimeBudget = (sum.lifetimeBudget || 0) + (row.lifetimeBudget || 0);
    return sum;
  }, {
    key: "total", accountId: null, accountName: "All shown", currency: currencies[0] || "INR", campaignId: null,
    campaignName: "Overall result", objective: null, status: null, dailyBudget: null, lifetimeBudget: null, bidAmount: null, bidStrategy: null,
    spend: 0, metaCalendarSpend: 0, spendInr: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
    landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0, metaPurchaseValue: 0, metaPurchaseWindowAligned,
    leads: 0, orders: 0, grossRevenue: 0, refunds: 0, refundAmount: 0, revenue: 0,
    utmSources: [], utmMediums: [], utmTerms: [], utmContents: [], attribution: "none", adBreakdown: [],
  }), [rows, currencies, metaPurchaseWindowAligned]);
  const attributedOrders = rows.filter((row) => row.key !== "unattributed" && row.utmVisits != null).reduce((sum, row) => sum + row.orders, 0);
  const conversionRate = total.utmVisits ? `${(attributedOrders / total.utmVisits * 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%` : "—";

  return <>
    <tbody>{rows.map((row) => <CampaignRow key={row.key} row={row} columns={columns} token={token} dates={dates} dayMode={dayMode} refreshKey={refreshKey} activeOnly={activeOnly} activeScope={activeScope} onMetaEditSaved={onMetaEditSaved} />)}</tbody>
    <tfoot><tr className="border-t-2 border-cyan-400/40 bg-[#202d40] text-sm font-semibold"><td className="px-2 py-3" />{columns.map((column) => <td key={column.id} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"}`} title={column.id === "budget" || column.id === "bid" ? "Campaign and ad set budgets or bids cannot be combined reliably in this total." : META_PURCHASE_COLUMNS.has(column.id) && !metaPurchaseWindowAligned ? META_WINDOW_UNAVAILABLE : mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "Mixed account currencies; use Spend INR and AR metrics." : undefined}>{column.id === "budget" || column.id === "bid" ? "—" : column.id === "conversionRate" ? conversionRate : mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "—" : column.id === "spend" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: total.currency, maximumFractionDigits: 2 }).format(total.spend) : column.id === "campaign" ? "Overall result" : column.id === "account" ? "All shown" : column.id === "refundAmount" ? money(total.refundAmount) : column.value(total)}</td>)}</tr></tfoot>
  </>;
}
