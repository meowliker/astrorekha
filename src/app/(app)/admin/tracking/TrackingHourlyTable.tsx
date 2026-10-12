"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { TrackingHourlyCell } from "@/lib/tracking-hourly-table";

type HourRow = { key: string; name: string; hours: Array<number | null>; details: TrackingHourlyCell[] };
type Props = {
  rows: HourRow[];
  totals: Array<number | null>;
  totalDetails: TrackingHourlyCell[];
  metric: "orders" | "revenue" | "roas";
  onOpen: (key: string) => void;
};

function hourLabel(bucket: number) {
  const minutes = (11 * 60 + 30 + bucket * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TrackingHourlyTable({ rows, totals, totalDetails, metric, onOpen }: Props) {
  const [hover, setHover] = useState<{ name: string; hour: number; cell: TrackingHourlyCell; left: number; top: number } | null>(null);
  const show = (element: HTMLElement, name: string, hour: number, cell: TrackingHourlyCell) => {
    const rect = element.getBoundingClientRect();
    setHover({ name, hour, cell, left: Math.max(8, Math.min(window.innerWidth - 236, rect.left + rect.width / 2 - 114)),
      top: rect.top >= 174 ? rect.top - 164 : rect.bottom + 8 });
  };
  const maximum = Math.max(1, ...totals.filter((value): value is number => value != null), ...rows.flatMap((row) => row.hours).filter((value): value is number => value != null));
  const valueText = (value: number | null) => metric === "roas" ? value == null ? "—" : `${value.toFixed(2)}×` : value ? value.toLocaleString("en-IN", { maximumFractionDigits: metric === "orders" ? 0 : 2 }) : "·";
  const valueTitle = (value: number | null) => metric === "roas" ? value == null ? "No hourly Meta spend for ROAS" : `${value.toFixed(2)}× ROAS` : metric === "orders" ? `${value || 0} orders` : `₹${(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]">
    <table className="w-max min-w-full table-fixed border-collapse text-xs">
      <colgroup><col style={{ width: 310 }} /><col span={24} style={{ width: 76 }} /></colgroup>
      <thead className="bg-[#1b2437] text-slate-400"><tr>
        <th className="sticky left-0 z-20 border-r border-white/10 bg-[#1b2437] px-4 py-3 text-left">Campaign</th>
        {Array.from({ length: 24 }, (_, hour) => <th key={hour} title={`${hourLabel(hour)}–${hourLabel(hour + 1)} IST`} className="px-1 py-2 text-center font-medium leading-4"><span className="block">{hourLabel(hour)}</span><span className="block text-slate-500">–{hourLabel(hour + 1)}</span></th>)}
      </tr></thead>
      <tbody>
        <tr className="border-b border-white/10 font-semibold"><td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3">All shown campaigns</td>{totals.map((value, hour) => <td key={hour} tabIndex={0} aria-label={`${hourLabel(hour)}–${hourLabel(hour + 1)} all campaigns: ${valueTitle(value)}`} onMouseEnter={(event) => show(event.currentTarget, "All shown campaigns", hour, totalDetails[hour])} onMouseLeave={() => setHover(null)} onFocus={(event) => show(event.currentTarget, "All shown campaigns", hour, totalDetails[hour])} onBlur={() => setHover(null)} className="cursor-help px-1 py-3 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{valueText(value)}</td>)}</tr>
        {rows.map((row) => <tr key={row.key} className="border-b border-white/5 hover:bg-white/5">
          <td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3 align-middle"><button type="button" onClick={() => onOpen(row.key)} className="block w-full whitespace-normal break-words text-left leading-5 text-slate-100 hover:text-cyan-200 hover:underline" title={`Open hourly result for ${row.name}`}>{row.name}</button></td>
          {row.hours.map((value, hour) => <td key={hour} tabIndex={0} aria-label={`${row.name}, ${hourLabel(hour)}–${hourLabel(hour + 1)}: ${valueTitle(value)}`} onMouseEnter={(event) => show(event.currentTarget, row.name, hour, row.details[hour])} onMouseLeave={() => setHover(null)} onFocus={(event) => show(event.currentTarget, row.name, hour, row.details[hour])} onBlur={() => setHover(null)} style={{ backgroundColor: value != null && value > 0 ? `rgba(20,184,166,${Math.min(0.38, 0.08 + value / maximum * 0.3)})` : undefined }} className="cursor-help px-1 py-3 text-center tabular-nums text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">{valueText(value)}</td>)}
        </tr>)}
      </tbody>
    </table>
    {!rows.length && <div className="p-6 text-center text-xs text-slate-500">No campaigns for this date and filter.</div>}
    {hover && createPortal(<div role="tooltip" style={{ left: hover.left, top: hover.top }} className="pointer-events-none fixed z-[70] w-[228px] rounded-lg border border-cyan-400/35 bg-[#0d1c2b] p-3 text-xs text-slate-200 shadow-xl shadow-black/60">
      <p className="truncate font-semibold text-cyan-200" title={hover.name}>{hover.name}</p>
      <p className="mt-1 text-slate-400">{hourLabel(hover.hour)}–{hourLabel(hover.hour + 1)} IST</p>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 border-t border-white/10 pt-2"><dt className="text-slate-400">Spend</dt><dd className="text-right tabular-nums">{hover.cell.spend == null ? "—" : money(hover.cell.spend)}</dd><dt className="text-slate-400">Net sales</dt><dd className="text-right tabular-nums">{money(hover.cell.revenue)}</dd><dt className="text-slate-400">Orders</dt><dd className="text-right tabular-nums">{hover.cell.orders}</dd><dt className="text-slate-400">ROAS</dt><dd className="text-right tabular-nums">{hover.cell.roas == null ? "—" : `${hover.cell.roas.toFixed(2)}×`}</dd></dl>
      <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-4 text-slate-400">Meta reports clock hours. The 11:30 window splits overlapping Meta hours proportionally.</p>
    </div>, document.body)}
  </div>;
}
