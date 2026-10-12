"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { TrackingCampaign, TrackingHour } from "@/lib/tracking-dashboard";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (bucket: number) => {
  const minutes = (11 * 60 + 30 + bucket * 60) % (24 * 60);
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

export default function TrackingHourlyModal({ campaign, day, hours, spend, clicks, error, onClose }: {
  campaign: TrackingCampaign; day: string; hours: TrackingHour[]; spend: number[] | null; clicks: number[] | null;
  error: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousBodyOverflow = document.body.style.overflow;
    const previousPageOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousPageOverflow;
    };
  }, [onClose]);
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const sale = hours.find((item) => item.date === day && item.campaignKey === campaign.key && item.hour === hour);
    return { hour, spend: spend?.[hour] || 0, clicks: clicks?.[hour] || 0, sales: sale?.orders || 0, revenue: sale?.revenue || 0 };
  });
  const total = rows.reduce((sum, row) => ({ spend: sum.spend + row.spend, clicks: sum.clicks + row.clicks, sales: sum.sales + row.sales, revenue: sum.revenue + row.revenue }), { spend: 0, clicks: 0, sales: 0, revenue: 0 });
  const roas = (revenue: number, cost: number) => cost > 0 ? `${(revenue / cost).toFixed(2)}×` : "—";
  const cvr = (sales: number, linkClicks: number) => linkClicks > 0 ? `${(sales / linkClicks * 100).toFixed(2)}%` : "—";

  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[60] flex items-center justify-center overscroll-none bg-black/70 p-3 sm:p-6">
    <div role="dialog" aria-modal="true" aria-label={`Hourly breakdown for ${campaign.campaignName}`} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#101d29] shadow-2xl shadow-black/60">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4"><div className="min-w-0"><h2 className="text-lg font-semibold text-cyan-300">Hourly result · {day}</h2><p className="mt-1 break-words text-sm text-slate-300">{campaign.campaignName}</p><p className="mt-1 text-xs text-slate-500">11:30 AM IST business day · {campaign.accountName}</p></div><button onClick={onClose} aria-label="Close hourly breakdown" className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button></div>
      {error && <div role="alert" className="border-b border-rose-400/20 px-5 py-2 text-xs text-rose-300">Meta hourly spend: {error}</div>}
      <div className="overflow-auto overscroll-contain"><table className="w-full min-w-[680px] text-sm"><thead className="sticky top-0 bg-[#182a35] text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3 text-left">IST hour</th><th className="px-4 py-3 text-right">Spend</th><th className="px-4 py-3 text-right">AR sales</th><th className="px-4 py-3 text-right">AR revenue</th><th className="px-4 py-3 text-right">AR ROAS</th><th className="px-4 py-3 text-right">CVR</th></tr></thead><tbody>{rows.map((row) => <tr key={row.hour} className="border-t border-white/10 hover:bg-white/5"><td className="px-4 py-2 text-slate-200">{label(row.hour)}–{label(row.hour + 1)}</td><td className="px-4 py-2 text-right tabular-nums">{spend ? money(row.spend) : error ? "—" : "…"}</td><td className="px-4 py-2 text-right tabular-nums">{row.sales}</td><td className="px-4 py-2 text-right tabular-nums">{money(row.revenue)}</td><td className="px-4 py-2 text-right tabular-nums">{spend ? roas(row.revenue, row.spend) : error ? "—" : "…"}</td><td className="px-4 py-2 text-right tabular-nums">{clicks ? cvr(row.sales, row.clicks) : error ? "—" : "…"}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-cyan-400/40 bg-[#1c3340] font-semibold"><td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{spend ? money(total.spend) : error ? "—" : "…"}</td><td className="px-4 py-3 text-right tabular-nums">{total.sales}</td><td className="px-4 py-3 text-right tabular-nums">{money(total.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">{spend ? roas(total.revenue, total.spend) : error ? "—" : "…"}</td><td className="px-4 py-3 text-right tabular-nums">{clicks ? cvr(total.sales, total.clicks) : error ? "—" : "…"}</td></tr></tfoot></table></div>
    </div>
  </div>;
}
