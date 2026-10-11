"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { campaignNameKey, type TrackingCampaign, type TrackingChild } from "@/lib/tracking-dashboard";

type Column = { id: string; label: string; value: (row: TrackingCampaign) => string; align?: "right" };
type Props = { rows: TrackingCampaign[]; columns: Column[]; token: string | null; dates: { start: string; end: string }; refreshKey: string };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

function CampaignRow({ row, columns, token, dates, refreshKey }: { row: TrackingCampaign; columns: Column[]; token: string | null; dates: Props["dates"]; refreshKey: string }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<{ adsets: TrackingChild[]; ads: TrackingChild[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [openAdsets, setOpenAdsets] = useState<string[]>([]);

  useEffect(() => {
    if (!open || (children && loadedKey === refreshKey) || !token || !row.accountId || !row.campaignId) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ mode: "children", accountId: row.accountId, campaignId: row.campaignId, ...dates });
    fetch(`/api/admin/tracking/details?${params}`, { headers: { "x-admin-session": token }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Meta details unavailable"); return data; })
      .then((data: { adsets: TrackingChild[]; ads: TrackingChild[] }) => { setChildren(data); setLoadedKey(refreshKey); setError(""); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Meta details unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, children, loadedKey, refreshKey, token, row.accountId, row.campaignId, dates, retry]);

  const hierarchy = useMemo(() => {
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
  }, [children, row.adBreakdown]);

  const cells = (item: TrackingCampaign, level: 0 | 1 | 2) => columns.map((column) => <td key={column.id} title={column.value(item)} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"} ${column.id === "campaign" ? "font-medium text-white" : "text-slate-300"}`}>
    <span className={column.id === "campaign" ? "flex items-center gap-2" : "block truncate"} style={column.id === "campaign" ? { paddingLeft: `${level * 22}px` } : undefined}>
      {column.id === "campaign" && level > 0 && <span className="shrink-0 rounded border border-cyan-400/25 px-1 text-[10px] uppercase text-cyan-300">{level === 1 ? "Set" : "Ad"}</span>}
      <span className="truncate">{column.value(item)}</span>
    </span>
  </td>);

  return <Fragment>
    <tr onClick={() => setOpen(!open)} className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5">
      <td className="px-2 py-3 text-slate-500"><button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${row.campaignName}`} onClick={(event) => { event.stopPropagation(); setOpen(!open); }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>{cells(row, 0)}
    </tr>
    {open && loading && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">Loading Meta ad sets and ads…</td></tr>}
    {open && error && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-rose-300">{error} <button onClick={() => { setError(""); setRetry((value) => value + 1); }} className="ml-2 underline">Retry</button></td></tr>}
    {open && !row.accountId && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">This UTM campaign has no unique Meta match, so Meta ad sets and ads cannot be loaded.</td></tr>}
    {open && hierarchy && !hierarchy.adsets.length && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-4 text-xs text-slate-400">No ad sets were returned by Meta for this campaign.</td></tr>}
    {open && hierarchy?.adsets.map((adset) => {
      const ads = hierarchy.ads.filter((ad) => ad.parentId === adset.id);
      const adsetOpen = openAdsets.includes(adset.id);
      return <Fragment key={adset.id}>
        <tr onClick={() => setOpenAdsets((current) => adsetOpen ? current.filter((id) => id !== adset.id) : [...current, adset.id])} className="cursor-pointer border-b border-white/5 bg-[#111c2d] hover:bg-[#1a2a3c]">
          <td className="px-2 py-3 text-cyan-300">{ads.length ? adsetOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</td>{cells(adset, 1)}
        </tr>
        {adsetOpen && ads.map((ad) => <tr key={ad.id} className="border-b border-white/5 bg-[#0d1726]"><td className="px-2 py-3" />{cells(ad, 2)}</tr>)}
      </Fragment>;
    })}
    {open && hierarchy && row.orders > hierarchy.adsets.reduce((sum, item) => sum + item.orders, 0) && <tr><td colSpan={columns.length + 1} className="bg-[#111827] px-8 py-3 text-xs text-slate-500">{row.orders - hierarchy.adsets.reduce((sum, item) => sum + item.orders, 0)} campaign sale(s) lack a unique ad set ID or name. They remain in the campaign total.</td></tr>}
  </Fragment>;
}

export default function TrackingCampaignRows({ rows, columns, token, dates, refreshKey }: Props) {
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
    <tbody>{rows.map((row) => <CampaignRow key={row.key} row={row} columns={columns} token={token} dates={dates} refreshKey={refreshKey} />)}</tbody>
    <tfoot><tr className="border-t-2 border-cyan-400/40 bg-[#202d40] text-sm font-semibold"><td className="px-2 py-3" />{columns.map((column) => <td key={column.id} className={`max-w-[240px] px-3 py-3 tabular-nums ${column.align === "right" ? "text-right" : "text-left"}`} title={mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "Mixed account currencies; use Spend INR and AR metrics." : undefined}>{mixedCurrencies && ["spend", "cpc", "cpm", "metaCostPerPurchase", "metaPurchaseValue", "metaRoas", "dailyBudget", "lifetimeBudget"].includes(column.id) ? "—" : column.id === "spend" ? new Intl.NumberFormat("en-IN", { style: "currency", currency: total.currency, maximumFractionDigits: 2 }).format(total.spend) : column.id === "campaign" ? "Overall result" : column.id === "account" ? "All shown" : column.id === "refundAmount" ? money(total.refundAmount) : column.value(total)}</td>)}</tr></tfoot>
  </>;
}
