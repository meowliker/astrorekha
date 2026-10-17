"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackingHourlyCell, TrackingHourlyMetric } from "@/lib/tracking-hourly-table";
import type { TrackingDayMode } from "@/lib/tracking-dashboard";
import type { TrackingBudgetMarker } from "@/lib/tracking-budget-markers";

type HourRow = { key: string; name: string; hours: Array<number | null>; details: TrackingHourlyCell[] };
type Props = { rows: HourRow[]; totals: Array<number | null>; totalDetails: TrackingHourlyCell[];
  metric: TrackingHourlyMetric; dayMode: TrackingDayMode; budgetMarkers: Record<string, TrackingBudgetMarker[][]>; onOpen: (key: string) => void };

function hourLabel(bucket: number, dayMode: TrackingDayMode) {
  const minutes = ((dayMode === "calendar_ist" ? 0 : 11 * 60 + 30) + bucket * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TrackingHourlyTable({ rows, totals, totalDetails, metric, dayMode, budgetMarkers, onOpen }: Props) {
  const [hover, setHover] = useState<{ name: string; hour: number; cell: TrackingHourlyCell; changes: TrackingBudgetMarker[]; left: number; top: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = null; setHover(null); };
  const show = (element: HTMLElement, name: string, hour: number, cell: TrackingHourlyCell, changes: TrackingBudgetMarker[], delay = 1400) => {
    hide();
    const rect = element.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => {
      setHover({ name, hour, cell, changes,
        left: Math.max(8, Math.min(window.innerWidth - 244, rect.left + rect.width / 2 - 118)),
        top: rect.top - 8 });
      hoverTimer.current = null;
    }, delay);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useEffect(() => { const timer = setTimeout(() => setHover(null), 0); return () => clearTimeout(timer); }, [metric]);
  const maximum = Math.max(1, ...totals.filter((value): value is number => value != null), ...rows.flatMap((row) => row.hours).filter((value): value is number => value != null));
  const valueText = (value: number | null) => metric === "roas" ? value == null ? "—" : `${value.toFixed(2)}×` : metric === "cvr" ? value == null ? "—" : `${value.toFixed(2)}%` : value ? value.toLocaleString("en-US", { maximumFractionDigits: metric === "orders" ? 0 : 2 }) : "·";
  const valueTitle = (value: number | null) => metric === "roas" ? value == null ? "No hourly Meta spend for ROAS" : `${value.toFixed(2)}× ROAS` : metric === "cvr" ? value == null ? "No tagged site arrivals for Soulmate CVR" : `${value.toFixed(2)}% Soulmate CVR` : metric === "orders" ? `${value || 0} orders` : money(value || 0);
  const label = (hour: number) => `${hourLabel(hour, dayMode)}–${hourLabel(hour + 1, dayMode)}`;
  const cellProps = (name: string, hour: number, cell: TrackingHourlyCell, changes: TrackingBudgetMarker[] = []) => ({
    tabIndex: 0,
    "aria-label": `${name}, ${label(hour)}: ${valueTitle(cell[metric])}${changes.length ? `; ${changes.length} budget change${changes.length === 1 ? "" : "s"}` : ""}`,
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => show(event.currentTarget, name, hour, cell, changes),
    onMouseLeave: hide,
    onFocus: (event: React.FocusEvent<HTMLElement>) => show(event.currentTarget, name, hour, cell, changes, 0),
    onBlur: hide,
  });
  const details = hover ? [
    ["Spend", hover.cell.spend == null ? "—" : money(hover.cell.spend)],
    ["Soulmate UTM visits", hover.cell.visits == null ? "—" : String(hover.cell.visits)],
    ...(metric === "revenue" ? [] : [["Net sales", money(hover.cell.revenue)]]),
    ...(metric === "orders" ? [] : [["Orders", String(hover.cell.orders)]]),
    ...(metric === "roas" ? [] : [["ROAS", hover.cell.roas == null ? "—" : `${hover.cell.roas.toFixed(2)}×`]]),
    ...(metric === "cvr" ? [] : [["Soulmate CVR", hover.cell.cvr == null ? "—" : `${hover.cell.cvr.toFixed(2)}%`]]),
  ] : [];
  const marker = (changes: TrackingBudgetMarker[]) => {
    if (!changes.length) return null;
    const up = changes.some((change) => change.after > change.before);
    const down = changes.some((change) => change.after < change.before);
    return <span aria-hidden="true" className={`absolute right-0.5 top-0.5 rounded px-0.5 text-[10px] font-bold leading-3 ${up && down ? "text-amber-300" : up ? "text-emerald-300" : "text-rose-300"}`}>{up && down ? "↕" : up ? "↑" : "↓"}{changes.length > 1 ? changes.length : ""}</span>;
  };

  return <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]">
    <table className="w-max min-w-full table-fixed border-collapse text-xs">
      <colgroup><col style={{ width: 310 }} /><col span={totals.length} style={{ width: 76 }} /></colgroup>
      <thead className="bg-[#1b2437] text-slate-400"><tr>
        <th className="sticky left-0 z-20 border-r border-white/10 bg-[#1b2437] px-4 py-3 text-left">Campaign</th>
        {totals.map((_, hour) => <th key={hour} title={`${label(hour)} IST`} className="px-1 py-2 text-center font-medium leading-4"><span className="block">{hourLabel(hour, dayMode)}</span><span className="block text-slate-500">–{hourLabel(hour + 1, dayMode)}</span></th>)}
      </tr></thead>
      <tbody>
        <tr className="border-b border-white/10 font-semibold"><td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3">All shown campaigns</td>{totals.map((value, hour) => <td key={hour} {...cellProps("All shown campaigns", hour, totalDetails[hour])} className="cursor-help px-1 py-3 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{valueText(value)}</td>)}</tr>
        {rows.map((row) => <tr key={row.key} className="border-b border-white/5 hover:bg-white/5">
          <td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3 align-middle"><button type="button" onClick={() => onOpen(row.key)} className="block w-full whitespace-normal break-words text-left leading-5 text-slate-100 hover:text-cyan-200 hover:underline" title={`Open hourly result for ${row.name}`}>{row.name}</button></td>
          {row.hours.map((value, hour) => { const changes = budgetMarkers[row.key]?.[hour] || []; return <td key={hour} {...cellProps(row.name, hour, row.details[hour], changes)} style={{ backgroundColor: value != null && value > 0 ? `rgba(20,184,166,${Math.min(0.38, 0.08 + value / maximum * 0.3)})` : undefined }} className="relative cursor-help px-1 py-3 text-center tabular-nums text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{marker(changes)}{valueText(value)}</td>; })}
        </tr>)}
      </tbody>
    </table>
    {!rows.length && <div className="p-6 text-center text-xs text-slate-500">No campaigns for this date and filter.</div>}
    {hover && createPortal(<div role="tooltip" style={{ left: hover.left, top: hover.top, transform: "translateY(-100%)" }} className="pointer-events-none fixed z-[70] w-[228px] rounded-lg border border-cyan-400/35 bg-[#0d1c2b] p-3 text-xs text-slate-200 shadow-xl shadow-black/60">
      <p className="break-words font-semibold text-cyan-200">{hover.name}</p>
      <p className="mt-1 text-slate-400">{label(hover.hour)} IST</p>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 border-t border-white/10 pt-2">{details.map(([key, value]) => <div key={key} className="col-span-2 grid grid-cols-2"><dt className="text-slate-400">{key}</dt><dd className="text-right tabular-nums">{value}</dd></div>)}</dl>
      {hover.changes.length > 0 && <div className="mt-2 border-t border-white/10 pt-2"><p className="font-medium text-cyan-200">Budget {hover.changes.length === 1 ? "change" : "changes"}</p>{hover.changes.map((change, index) => <p key={`${change.at}:${index}`} className="mt-1 break-words"><span className="text-slate-400">{change.objectType === "Ad set" ? `${change.object} · ` : ""}{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(change.at))}</span><br /><span className={change.after > change.before ? "text-emerald-300" : "text-rose-300"}>{change.detail}</span></p>)}</div>}
    </div>, document.body)}
  </div>;
}
