"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw, Settings, X } from "lucide-react";
import { US_SOULMATE_PROFIT_START, profitDay, shiftProfitDate, type SoulmateProfitRow } from "@/lib/us-soulmate-profit";
import { SoulmateAdAccountsDialog } from "./ad-accounts-dialog";

const control = "h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const formatDate = (date: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const money = (paise: number | null, currency = "USD") => paise === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(paise / 100);
const monthNames = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }));
type ColumnKey = "date" | "orders" | "received" | "refund" | "revenue" | "adsUsd" | "adsInr" | "adGst" | "balance" | "profit" | "roas" | "salesGst";
const columns: { key: ColumnKey; label: string; hint?: string }[] = [
  { key: "date", label: "Date" }, { key: "orders", label: "Orders" }, { key: "received", label: "Received" },
  { key: "refund", label: "Refund" }, { key: "revenue", label: "Revenue", hint: "Receipts less confirmed refunds" },
  { key: "adsInr", label: "Ads (USD)" },
  { key: "balance", label: "Account Balance" },
  { key: "profit", label: "Profit" }, { key: "roas", label: "ROAS" },
];

export function SoulmateProfitPanel() {
  const [today] = useState(() => profitDay(Date.now()));
  const [start, setStart] = useState(US_SOULMATE_PROFIT_START);
  const [end, setEnd] = useState(today);
  const [period, setPeriod] = useState("sinceLaunch");
  const [days, setDays] = useState<string[]>([]);
  const [roas, setRoas] = useState("all");
  const [, setRate] = useState("");
  const [, setAppliedRate] = useState<number | null>(null);
  const [, setRevision] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<SoulmateProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [picker, setPicker] = useState<"range" | "days" | null>(null);
  const [sort, setSort] = useState<{ key: ColumnKey; asc: boolean }>({ key: "date", asc: true });
  const rangeStart = days.length ? days[0] : start;
  const rangeEnd = days.length ? days[days.length - 1] : end;

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/admin/us-soulmate/profit?${new URLSearchParams({ start: rangeStart, end: rangeEnd })}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` }, signal: abort.signal, cache: "no-store",
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load profit sheet.");
      if (!abort.signal.aborted) { setRows(result.rows); setUpdatedAt(result.updatedAt || ""); setMissing(result.missing); setAccountCount(result.accountCount); setRevision(result.revision); setAppliedRate(result.exchangeRate); setRate(result.exchangeRate ? String(result.exchangeRate) : ""); }
    }).catch((cause) => { if (!abort.signal.aborted) setError(cause.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [rangeStart, rangeEnd, refresh]);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}`, "Content-Type": "application/json" });
  async function sync(mode: "last2" | "range", first?: string, last?: string) {
    setSyncing(true); setNotice("");
    try {
      const res = await fetch("/api/admin/us-soulmate/profit", { method: "POST", headers: authHeaders(), body: JSON.stringify({ mode, start: first, end: last }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setNotice(`Updated ${formatDate(data.syncedRange.start)} – ${formatDate(data.syncedRange.end)}. Other saved dates were kept.`);
      setRefresh((n) => n + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Refresh failed. Saved figures were kept."); }
    finally { setSyncing(false); }
  }
  function selectPeriod(value: string) {
    const year = Number(today.slice(0, 4));
    let first = today, last = today;
    if (value === "sinceLaunch") first = US_SOULMATE_PROFIT_START;
    else if (value === "yesterday") first = last = shiftProfitDate(today, -1);
    else if (value === "last7") first = shiftProfitDate(today, -6);
    else if (value === "last30") first = shiftProfitDate(today, -29);
    else if (value === "thisMonth") first = today.slice(0, 7) + "-01";
    else if (value.startsWith("q") || value.startsWith("month-")) {
      const month = value.startsWith("q") ? (Number(value.slice(1)) - 1) * 3 : Number(value.slice(6)) - 1;
      first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      last = new Date(Date.UTC(year, month + (value.startsWith("q") ? 3 : 1), 0)).toISOString().slice(0, 10);
      if (last > today) last = today;
    }
    setStart(first < US_SOULMATE_PROFIT_START ? US_SOULMATE_PROFIT_START : first); setEnd(last < US_SOULMATE_PROFIT_START ? US_SOULMATE_PROFIT_START : last); setDays([]); setPeriod(value);
  }

  const visible = rows.filter((row) => (!days.length || days.includes(row.date)) && (
    roas === "all" || (roas === "positive" && row.roas !== null && row.roas > 1) ||
    (roas === "negative" && row.roas !== null && row.roas <= 1) || (roas === "noads" && row.adsInr === 0) || (roas === "unavailable" && row.roas === null)
  )).sort((a, b) => {
    const left = a[sort.key] ?? null, right = b[sort.key] ?? null;
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    const result = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
    return sort.asc ? result : -result;
  });
  const total = (key: ColumnKey): number | null => visible.some((row) => row[key] === null) ? null : visible.reduce((sum, row) => sum + Number(row[key]), 0);
  const year = Number(today.slice(0, 4)), currentMonth = Number(today.slice(5, 7));
  const needsSync = [...new Set([...missing, ...rows.filter((r) => r.stale).map((r) => r.date)])].sort();
  const backfillStart = needsSync[0];
  const backfillEnd = backfillStart ? [rangeEnd, shiftProfitDate(backfillStart, 6)].sort()[0] : "";

  return <section className="space-y-4 py-6" aria-label="Soulmate profit sheet">
    <div className="flex justify-end"><button type="button" disabled={syncing} onClick={() => setAccountsOpen(true)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-primary hover:bg-white/5 disabled:opacity-40"><Settings size={15} />Ad Accounts<span className="rounded-full bg-primary px-1.5 text-xs text-white">{accountCount}</span></button></div>
    {accountsOpen && <SoulmateAdAccountsDialog close={() => setAccountsOpen(false)} saved={() => { setAccountsOpen(false); setRefresh((n) => n + 1); setNotice("Soulmate accounts saved. Refresh updates the latest two days; use Backfill for older dates."); }} />}
    <div className="rounded-xl border border-white/10 bg-[#1A2235] p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div><p className="mb-1 text-xs text-white/50">Custom Range</p><button type="button" aria-haspopup="dialog" className={control} onClick={() => setPicker("range")}>{formatDate(start)} – {formatDate(end)}</button></div>
        <div><p className="mb-1 text-xs text-white/50">Specific Days</p><button type="button" aria-haspopup="dialog" className={`${control} ${days.length ? "border-primary/40 text-primary" : ""}`} onClick={() => setPicker("days")}>{days.length ? `${days.length} days selected` : "Pick Days"}</button></div>
        <label className="text-xs text-white/50">Period<select aria-label="Period" value={period} onChange={(e) => selectPeriod(e.target.value)} className={`${control} mt-1 block`}>
          <option value="custom" disabled>Custom selection</option><option value="sinceLaunch">Since 15 Oct 2026</option><option value="today">Today</option><option value="yesterday" disabled={today <= US_SOULMATE_PROFIT_START}>Yesterday</option><option value="last7">Last 7 Days</option><option value="last30">Last 30 Days</option><option value="thisMonth">This Month</option>
          {[1, 2, 3, 4].map((q) => <option key={q} value={`q${q}`} disabled={(q - 1) * 3 + 1 > currentMonth || `${year}-${String(q * 3).padStart(2, "0")}-31` < US_SOULMATE_PROFIT_START}>Q{q} ({monthNames[(q - 1) * 3].slice(0, 3)}–{monthNames[q * 3 - 1].slice(0, 3)})</option>)}
          {monthNames.map((name, i) => <option key={name} value={`month-${i + 1}`} disabled={i + 1 > currentMonth || `${year}-${String(i + 1).padStart(2, "0")}-31` < US_SOULMATE_PROFIT_START}>{name} {year}</option>)}
        </select></label>
        <label className="text-xs text-white/50">ROAS Filter<select aria-label="ROAS Filter" value={roas} onChange={(e) => setRoas(e.target.value)} className={`${control} mt-1 block`}><option value="all">All</option><option value="positive">Profitable (ROAS &gt; 1)</option><option value="negative">Loss (ROAS ≤ 1)</option><option value="noads">No Ads</option><option value="unavailable">ROAS unavailable</option></select></label>
        <div className="text-xs text-white/50">Reporting currency: USD</div>
        <button type="button" disabled={loading || syncing} onClick={() => sync("last2")} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-white transition-colors hover:bg-primary/80 disabled:opacity-50"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} />{syncing ? "Refreshing…" : "Refresh"}</button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/40">Each reporting day covers 11:30 AM IST to 11:29 AM IST the next day. Only verified live Soulmate purchases made in production are included.</p>
      <p className="mt-2 text-xs text-white/40">Saved rows load from Supabase. Refresh updates only the latest two reporting days.</p>
    </div>
    {notice && <p role="status" className="text-sm text-amber-200">{notice}</p>}
    {!loading && needsSync.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm"><span className="text-amber-200">{needsSync.length} dates need an initial sync or recalculation.</span><button type="button" disabled={syncing} className={control} onClick={() => sync("range", backfillStart, backfillEnd)}>Backfill {formatDate(backfillStart)} – {formatDate(backfillEnd)}</button></div>}

    {picker && <ProfitDatePicker key={picker} mode={picker} start={start} end={end} days={days} max={today} close={() => setPicker(null)} apply={(first, last, selection) => { setStart(first); setEnd(last); setDays(selection); setPeriod("custom"); setPicker(null); }} />}
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A2235]">
      <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">US Soulmate Profit Sheet — {days.length ? `${days.length} selected days` : `${formatDate(start)} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`}</h2><p className="mt-1 text-xs text-white/45">Profit = receipts − confirmed refunds − tax − ad spend, before processing and fulfilment costs. ROAS = net receipts ÷ ad spend.{!accountCount ? " Add US Soulmate ad accounts to calculate spend, profit and ROAS." : ""}</p></div>
      {error && <p role="alert" className="px-4 py-4 text-sm text-red-300">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm">
        <caption className="sr-only">Soulmate daily receipts and profit. A dash means the data is unavailable.</caption>
        <thead className="border-b border-white/10 bg-white/5 text-xs text-white/65"><tr>{columns.map(({ key, label, hint }, i) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.asc ? "ascending" : "descending" : "none"} className="px-4 py-5 text-right font-medium"><button type="button" title={hint} onClick={() => setSort({ key, asc: sort.key === key ? !sort.asc : true })} className={`flex w-full items-center gap-2 ${i ? "justify-end" : "justify-start"}`}>{label}{sort.key === key ? sort.asc ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} className="text-white/30" />}</button></th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={columns.length} className="py-16 text-center text-white/50">Loading Soulmate sales…</td></tr> : error ? null : visible.length ? visible.map((row) => <tr key={row.date} className="border-b border-white/10 odd:bg-white/[0.025] hover:bg-white/[0.045]">
          {columns.map(({ key }, i) => <td key={key} className={`whitespace-nowrap px-4 py-4 ${i ? "text-right" : "text-left"} ${(key === "received" && row.received > 0) || (key === "profit" && (row.profit ?? 0) >= 0) ? "text-emerald-400" : ["refund", "adsInr", "adsUsd"].includes(key) || (key === "profit" && (row.profit ?? 0) < 0) ? "text-red-300" : key === "salesGst" || key === "adGst" ? "text-amber-400" : row[key] === null ? "text-white/30" : "text-white/75"}`}>
            {key === "date" ? <>{formatDate(row.date, { day: "numeric", month: "short", year: "numeric" })}<span className="mt-1 block text-xs text-white/40">{formatDate(row.date, { weekday: "short" })}{row.stale ? " · Recalculate" : ""}</span></> : key === "orders" ? row.orders : key === "roas" ? row.roas === null ? "—" : `${row.roas.toFixed(2)}×` : money(row[key] as number | null, key === "adsUsd" || key === "balance" ? "USD" : "USD")}
          </td>)}
        </tr>) : <tr><td colSpan={columns.length} className="py-16 text-center text-white/50">No saved days match these filters. Use Refresh or Backfill to populate missing dates.</td></tr>}</tbody>
        {!loading && !error && visible.length > 0 && <tfoot className="bg-white/5 font-medium"><tr>{columns.map(({ key }, i) => <td key={key} className={`px-4 py-4 ${i ? "text-right" : "text-left"} text-white/80`}>{key === "date" ? `Total · ${visible.length} days` : key === "orders" ? total(key) : key === "balance" ? "—" : key === "roas" ? total("adsInr") && total("revenue") !== null ? `${(total("revenue")! / total("adsInr")!).toFixed(2)}×` : "—" : money(total(key), key === "adsUsd" ? "USD" : "USD")}</td>)}</tr></tfoot>}
      </table></div>
    </div>
    {updatedAt && <p className="text-xs text-white/35">Last refreshed {new Date(updatedAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST. Balances are snapshots taken during refresh, not daily costs; historical balances are never backfilled.</p>}
  </section>;
}

function ProfitDatePicker({ mode, start, end, days, max, close, apply }: { mode: "range" | "days"; start: string; end: string; days: string[]; max: string; close: () => void; apply: (start: string, end: string, days: string[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(start.slice(0, 7) + "-01");
  const [first, setFirst] = useState(start), [last, setLast] = useState(end), [selection, setSelection] = useState(days);
  const [pickingEnd, setPickingEnd] = useState(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const moveMonth = (delta: number) => { const date = new Date(`${month}T00:00:00Z`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1)).toISOString().slice(0, 10); };
  const rangeValid = first && last && first >= US_SOULMATE_PROFIT_START && first <= last && last <= max && Date.parse(last) - Date.parse(first) < 366 * 86400000;
  const selectionValid = selection.length > 0 && Date.parse(selection[selection.length - 1]) - Date.parse(selection[0]) < 366 * 86400000;
  return <dialog ref={dialog} onCancel={close} onClick={(e) => { if (e.target === dialog.current) close(); }} aria-labelledby="profit-date-picker-title" className="w-[680px] max-w-[94vw] rounded-2xl border border-white/15 bg-[#1A2235] p-5 text-white shadow-2xl backdrop:bg-black/60 [color-scheme:dark]">
    <div className="flex items-center justify-between"><h2 id="profit-date-picker-title" className="font-medium">{mode === "range" ? "Custom Range" : "Specific Days"}</h2><button type="button" aria-label="Close date picker" onClick={close} className="rounded-md p-2 hover:bg-white/10"><X size={17} /></button></div>
    <div className="my-3 flex items-center justify-between"><button type="button" aria-label="Previous month" disabled={month.slice(0, 7) <= US_SOULMATE_PROFIT_START.slice(0, 7)} className={`${control} disabled:opacity-30`} onClick={() => setMonth(moveMonth(-1))}><ChevronLeft size={16} /></button><p className="text-sm text-white/60">{mode === "range" ? "Select start and end dates" : "Select individual dates"}</p><button type="button" aria-label="Next month" disabled={month.slice(0, 7) >= max.slice(0, 7)} className={`${control} disabled:opacity-30`} onClick={() => setMonth(moveMonth(1))}><ChevronRight size={16} /></button></div>
    <div className="grid gap-5 sm:grid-cols-2">{[month, moveMonth(1)].map((monthStart) => {
      const date = new Date(`${monthStart}T00:00:00Z`), offset = (date.getUTCDay() + 6) % 7;
      const count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      return <div key={monthStart}><p className="mb-3 text-sm text-white/80">{formatDate(monthStart, { month: "long", year: "numeric" })}</p><div className="grid grid-cols-7 gap-1">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="py-1 text-center text-xs text-white/35">{d}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}{Array.from({ length: count }, (_, i) => {
        const day = shiftProfitDate(monthStart, i);
        const selected = mode === "days" ? selection.includes(day) : day >= first && day <= last;
        return <button type="button" key={day} aria-label={formatDate(day, { day: "numeric", month: "long", year: "numeric" })} aria-pressed={selected} disabled={day > max || day < US_SOULMATE_PROFIT_START} className={`h-9 rounded-md text-sm transition-colors disabled:opacity-20 ${selected ? "bg-primary/25 text-rose-200" : "text-white/70 hover:bg-white/10"}`} onClick={() => {
          if (mode === "days") setSelection((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
          else if (!pickingEnd || day < first) { setFirst(day); setLast(day); setPickingEnd(true); }
          else { setLast(day); setPickingEnd(false); }
        }}>{i + 1}</button>;
      })}</div></div>;
    })}</div>
    {mode === "range" ? <div className="mt-5 grid grid-cols-2 gap-3"><label className="text-xs text-white/50">From<input aria-label="Range start" type="date" min={US_SOULMATE_PROFIT_START} max={max} value={first} onChange={(e) => setFirst(e.target.value)} className={`${control} mt-1 w-full`} /></label><label className="text-xs text-white/50">Through<input aria-label="Range end" type="date" min={first} max={max} value={last} onChange={(e) => setLast(e.target.value)} className={`${control} mt-1 w-full`} /></label></div> : <p className="mt-4 text-sm text-white/60">{selection.length} days selected</p>}
    <div className="mt-5 flex justify-end gap-2">{mode === "days" && <button type="button" className={control} onClick={() => apply(start, end, [])}>Clear selection</button>}<button type="button" className={control} onClick={close}>Cancel</button><button type="button" disabled={mode === "days" ? !selectionValid : !rangeValid} onClick={() => apply(mode === "days" ? selection[0] : first, mode === "days" ? selection[selection.length - 1] : last, mode === "days" ? selection : [])} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-30">Apply dates</button></div>
  </dialog>;
}
