"use client";

type HourRow = { key: string; name: string; hours: number[] };
type Props = {
  rows: HourRow[];
  totals: number[];
  metric: "orders" | "revenue";
  onOpen: (key: string) => void;
};

function hourLabel(bucket: number) {
  const minutes = (11 * 60 + 30 + bucket * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default function TrackingHourlyTable({ rows, totals, metric, onOpen }: Props) {
  const maximum = Math.max(1, ...totals, ...rows.flatMap((row) => row.hours));
  const valueText = (value: number) => value ? value.toLocaleString("en-IN", { maximumFractionDigits: metric === "orders" ? 0 : 2 }) : "·";
  const valueTitle = (value: number) => metric === "orders" ? `${value} orders` : `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141b2b]">
    <table className="w-max min-w-full table-fixed border-collapse text-xs">
      <colgroup><col style={{ width: 310 }} /><col span={24} style={{ width: 76 }} /></colgroup>
      <thead className="bg-[#1b2437] text-slate-400"><tr>
        <th className="sticky left-0 z-20 border-r border-white/10 bg-[#1b2437] px-4 py-3 text-left">Campaign</th>
        {Array.from({ length: 24 }, (_, hour) => <th key={hour} title={`${hourLabel(hour)}–${hourLabel(hour + 1)} IST`} className="px-1 py-2 text-center font-medium leading-4"><span className="block">{hourLabel(hour)}</span><span className="block text-slate-500">–{hourLabel(hour + 1)}</span></th>)}
      </tr></thead>
      <tbody>
        <tr className="border-b border-white/10 font-semibold"><td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3">All shown campaigns</td>{totals.map((value, hour) => <td key={hour} title={valueTitle(value)} className="px-1 py-3 text-center tabular-nums">{valueText(value)}</td>)}</tr>
        {rows.map((row) => <tr key={row.key} className="border-b border-white/5 hover:bg-white/5">
          <td className="sticky left-0 z-10 border-r border-white/10 bg-[#141b2b] px-4 py-3 align-middle"><button type="button" onClick={() => onOpen(row.key)} className="block w-full whitespace-normal break-words text-left leading-5 text-slate-100 hover:text-cyan-200 hover:underline" title={`Open hourly result for ${row.name}`}>{row.name}</button></td>
          {row.hours.map((value, hour) => <td key={hour} title={valueTitle(value)} style={{ backgroundColor: value > 0 ? `rgba(20,184,166,${Math.min(0.38, 0.08 + value / maximum * 0.3)})` : undefined }} className="px-1 py-3 text-center tabular-nums text-slate-100">{valueText(value)}</td>)}
        </tr>)}
      </tbody>
    </table>
    {!rows.length && <div className="p-6 text-center text-xs text-slate-500">No campaigns for this date and filter.</div>}
  </div>;
}
