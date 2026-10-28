"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

export type TrackingRange = { start: string; end: string };

const DAY = 86_400_000;
const shiftDate = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monthStart = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
const shiftMonth = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const longDate = (iso: string) => new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const PRESETS = [
  ["Today", "today"], ["Yesterday", "yesterday"], ["Last 3 days", "last3"],
  ["Last 7 days", "last7"], ["Last 14 days", "last14"], ["Last 30 days", "last30"],
  ["This week", "thisWeek"], ["Last week", "lastWeek"],
  ["This month", "thisMonth"], ["Last month", "lastMonth"],
] as const;

function presetRange(name: typeof PRESETS[number][1], today: string): TrackingRange {
  if (name === "today") return { start: today, end: today };
  if (name === "yesterday") { const date = shiftDate(today, -1); return { start: date, end: date }; }
  if (name === "last3") return { start: shiftDate(today, -2), end: today };
  if (name === "last7") return { start: shiftDate(today, -6), end: today };
  if (name === "last14") return { start: shiftDate(today, -13), end: today };
  if (name === "last30") return { start: shiftDate(today, -29), end: today };
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shiftDate(today, -weekday);
  if (name === "thisWeek") return { start: monday, end: today };
  if (name === "lastWeek") return { start: shiftDate(monday, -7), end: shiftDate(monday, -1) };
  const first = `${today.slice(0, 7)}-01`;
  if (name === "thisMonth") return { start: first, end: today };
  const previousLast = shiftDate(first, -1);
  return { start: `${previousLast.slice(0, 7)}-01`, end: previousLast };
}

export default function TrackingDateRangePicker({ value, maxDate, onChange, minDate = "2026-10-15", maxDays = 31, align = "right" }: {
  value: TrackingRange;
  maxDate: string;
  minDate?: string;
  maxDays?: number;
  align?: "left" | "right";
  onChange: (range: TrackingRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.start);
  const [draftEnd, setDraftEnd] = useState<string | null>(value.end);
  const [month, setMonth] = useState(() => monthStart(value.end));
  const [hint, setHint] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const cells = useMemo(() => {
    const offset = (month.getUTCDay() + 6) % 7;
    const first = new Date(month.getTime() - offset * DAY);
    return Array.from({ length: 42 }, (_, index) => new Date(first.getTime() + index * DAY).toISOString().slice(0, 10));
  }, [month]);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
  const maxMonth = monthStart(maxDate);

  function chooseDate(date: string) {
    setHint("");
    if (!draftStart || draftEnd || date < draftStart) { setDraftStart(date); setDraftEnd(null); return; }
    if ((Date.parse(date) - Date.parse(draftStart)) / DAY >= maxDays) {
      setDraftStart(date); setDraftEnd(null); setHint(`Ranges can cover up to ${maxDays} days. Choose an end date from this new start.`); return;
    }
    setDraftEnd(date);
  }

  function choosePreset(name: typeof PRESETS[number][1]) {
    const range = presetRange(name, maxDate);
    onChange({ start: range.start < minDate ? minDate : range.start, end: range.end < minDate ? minDate : range.end });
    setOpen(false);
  }

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => { if (!open) { setDraftStart(value.start); setDraftEnd(value.end); setMonth(monthStart(value.end)); setHint(""); } setOpen(!open); }} aria-expanded={open} aria-label="Choose reporting date range" className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141b2b] px-3 py-2 text-sm hover:bg-white/5">
        <CalendarDays size={16} className="text-[#e51b50]" /><span>{value.start === maxDate && value.end === maxDate ? `Today · ${longDate(maxDate)}` : value.start === value.end ? longDate(value.start) : `${shortDate(value.start)} – ${longDate(value.end)}`}</span>
      </button>
      {open && <div className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+8px)] z-40 w-[min(92vw,620px)] rounded-xl border border-white/15 bg-[#1b2437] p-4 shadow-2xl shadow-black/50`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Reporting dates</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close date picker" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X size={16} /></button></div>
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-1">{PRESETS.map(([label, name]) => <button key={name} type="button" onClick={() => choosePreset(name)} className="rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white">{label}</button>)}</div>
          <div>
            <div className="mb-3 flex items-center justify-between"><button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= monthStart(minDate)} aria-label="Previous month" className="rounded p-1.5 hover:bg-white/10"><ChevronLeft size={16} /></button><span className="text-sm font-medium">{monthLabel}</span><button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= maxMonth} aria-label="Next month" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button></div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">{cells.map((day) => {
              const edge = day === draftStart || day === draftEnd;
              const inside = Boolean(draftStart && draftEnd && day >= draftStart && day <= draftEnd);
              return <button key={day} type="button" onClick={() => chooseDate(day)} disabled={day > maxDate || day < minDate} aria-label={longDate(day)} aria-pressed={edge} className={`h-9 rounded-md text-xs disabled:cursor-not-allowed disabled:opacity-25 ${edge ? "bg-[#e51b50] font-semibold text-white" : inside ? "bg-[#e51b50]/25 text-white" : day.slice(0, 7) === month.toISOString().slice(0, 7) ? "bg-white/5 hover:bg-white/15" : "text-slate-500 hover:bg-white/10"}`}>{Number(day.slice(8))}</button>;
            })}</div>
            <div className="mt-3 flex items-center justify-between gap-2"><div className="text-xs text-slate-400">{draftStart ? `${shortDate(draftStart)}${draftEnd ? ` – ${shortDate(draftEnd)}` : " · choose end"}` : "Choose start date"}{hint && <p className="mt-1 text-amber-300">{hint}</p>}</div><button type="button" disabled={!draftStart} onClick={() => { onChange({ start: draftStart, end: draftEnd || draftStart }); setOpen(false); }} className="rounded-md bg-[#e51b50] px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Apply</button></div>
          </div>
        </div>
      </div>}
    </div>
  );
}
