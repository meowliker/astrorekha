"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { REPORT_DESCRIPTIONS, type ReportDescriptionKey } from "@/lib/report-descriptions";

export default function ReportInfoButton({ report }: { report: ReportDescriptionKey }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const { title, description } = REPORT_DESCRIPTIONS[report];

  useEffect(() => {
    if (!open) return;
    close.current?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative ml-auto shrink-0 text-left" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={trigger} type="button" aria-label={`About ${title}`} aria-haspopup="dialog"
        aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400">
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
          className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/20 bg-[#1A2235] p-4 shadow-xl shadow-black/40">
          <span aria-hidden="true" className="absolute -top-2 right-3 h-4 w-4 rotate-45 border-l border-t border-white/20 bg-[#1A2235]" />
          <div className="relative flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className="text-sm font-semibold text-white">{title}</h2>
            <button ref={close} type="button" aria-label="Close report information" onClick={() => {
              setOpen(false);
              trigger.current?.focus({ preventScroll: true });
            }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p id={`${id}-description`} className="mt-2 text-sm font-normal leading-6 text-white/80">{description}</p>
        </div>
      )}
    </div>
  );
}
