"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { istDate, shiftDate } from "@/lib/revenue-dashboard";
import styles from "./revenue.module.css";
type Range = { start: string; end: string };
const minimum = "2026-03-13";
const monthStart = (date: string, offset = 0) =>
  new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1 + offset,
      1,
    ),
  )
    .toISOString()
    .slice(0, 10);
const label = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export default function RevenueDateRange({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  const today = istDate(new Date());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(monthStart(value.end, -1));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
      if (event.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  function choose(date: string) {
    if (!draft.start || draft.end) setDraft({ start: date, end: "" });
    else
      setDraft({
        start: date < draft.start ? date : draft.start,
        end: date < draft.start ? draft.start : date,
      });
  }
  function apply(next: Range) {
    onChange(next);
    close();
  }
  return (
    <div ref={root} className={styles.calendarRoot}>
      <button
        ref={trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(value);
          setMonth(monthStart(value.end, -1));
          setOpen(!open);
        }}
      >
        <Calendar size={16} />
        {label(value.start)} – {label(value.end)}
      </button>
      {open && (
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Select date range"
          tabIndex={-1}
          className={styles.calendarPopover}
        >
          <div className={styles.calendarHeading}>
            <strong>Select date range</strong>
            <button onClick={close} aria-label="Close date range">
              <X size={16} />
            </button>
          </div>
          <div className={styles.presets}>
            {[
              ["Today", 1],
              ["Yesterday", 0],
              ["7 days", 7],
              ["30 days", 30],
              ["All time", -1],
            ].map(([name, days]) => (
              <button
                key={name}
                onClick={() =>
                  apply({
                    start:
                      days === -1
                        ? minimum
                        : shiftDate(today, days === 0 ? -1 : 1 - Number(days)),
                    end: days === 0 ? shiftDate(today, -1) : today,
                  })
                }
              >
                {name}
              </button>
            ))}
          </div>
          <div className={styles.calendarHeading}>
            <button
              aria-label="Previous month"
              disabled={month <= monthStart(minimum)}
              onClick={() => setMonth(monthStart(month, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span>Choose a start and end date · IST</span>
            <button
              aria-label="Next month"
              disabled={monthStart(month, 1) >= monthStart(today)}
              onClick={() => setMonth(monthStart(month, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className={styles.calendarMonths}>
            {[0, 1].map((offset) => {
              const current = monthStart(month, offset),
                first = new Date(`${current}T00:00:00Z`).getUTCDay();
              return (
                <div key={current}>
                  <h3>
                    {new Date(`${current}T00:00:00Z`).toLocaleDateString(
                      "en-IN",
                      { month: "long", year: "numeric", timeZone: "UTC" },
                    )}
                  </h3>
                  <div className={styles.calendarGrid}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                    {Array.from({ length: 42 }, (_, i) => {
                      const date = shiftDate(current, i - first),
                        inMonth = date.slice(0, 7) === current.slice(0, 7),
                        edge =
                          inMonth &&
                          (date === draft.start || date === draft.end);
                      return (
                        <button
                          key={date}
                          disabled={!inMonth || date < minimum || date > today}
                          aria-label={label(date)}
                          aria-pressed={edge}
                          className={`${edge ? styles.calendarSelected : ""} ${inMonth && draft.end && date > draft.start && date < draft.end ? styles.calendarBetween : ""}`}
                          onClick={() => choose(date)}
                        >
                          {inMonth ? Number(date.slice(8)) : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.calendarDates}>
            <label>
              Start date
              <input
                aria-label="Range start date"
                type="date"
                min={minimum}
                max={today}
                value={draft.start}
                onChange={(e) =>
                  setDraft({
                    start: e.target.value,
                    end: e.target.value > draft.end ? "" : draft.end,
                  })
                }
              />
            </label>
            <label>
              End date
              <input
                aria-label="Range end date"
                type="date"
                min={draft.start || minimum}
                max={today}
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.calendarHeading}>
            <span aria-live="polite">
              {draft.start
                ? `${label(draft.start)}${draft.end ? ` – ${label(draft.end)}` : " · choose end date"}`
                : "Choose start date"}
            </span>
            <button
              className={styles.primary}
              disabled={
                !draft.start ||
                draft.start < minimum ||
                draft.start > today ||
                (!!draft.end && (draft.end < draft.start || draft.end > today))
              }
              onClick={() =>
                apply({ start: draft.start, end: draft.end || draft.start })
              }
            >
              Apply range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
