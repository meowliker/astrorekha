"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { ProfitSheetGstBreakdown } from "@/lib/profit-sheet-types";

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

export default function GstBreakdownButton({ date, revenue, breakdown, rate }: {
  date: string;
  revenue: number;
  breakdown?: ProfitSheetGstBreakdown;
  rate: number;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `gst-breakdown-${date}`;
  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, [open]);

  function close() {
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  }

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={`View GST calculation for ${formattedDate}`}
      aria-haspopup="dialog"
      title="GST calculation"
      onClick={() => setOpen(true)}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <Info className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && createPortal(
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#191523] p-0 text-left text-white shadow-2xl backdrop:bg-black/70"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">GST calculation</h2>
              <p className="mt-1 text-sm text-white/65">{formattedDate}</p>
            </div>
            <button type="button" autoFocus onClick={close} aria-label="Close GST calculation" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {breakdown ? <div className="mt-5 space-y-4 text-sm tabular-nums">
            <div>
              <p className="font-medium">Indian ad account spend</p>
              {breakdown.indianAdAccounts.length ? breakdown.indianAdAccounts.map((account) => (
                <div key={account.accountId} className="mt-3 flex justify-between gap-4 text-white/65">
                  <span className="min-w-0 break-words">{account.accountName}</span>
                  <span className="shrink-0">{money(account.spendInr)}</span>
                </div>
              )) : <p className="mt-3 text-white/50">No INR ad account spend for this day.</p>}
              <div className="mt-4 flex justify-between gap-4 font-medium"><span>Total Indian ad spend</span><span>{money(breakdown.indianAdSpendInr)}</span></div>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-4">
              <div className="flex justify-between gap-4"><span>Revenue GST ({money(revenue)} × {rate}%)</span><span className="shrink-0">{money(breakdown.revenueGst)}</span></div>
              <div className="flex justify-between gap-4 text-amber-300">
                <span>18% of Indian ad spend</span><span className="shrink-0">−{money(breakdown.adGstCredit)}</span>
              </div>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/15 pt-4 text-base font-semibold">
              <span>GST deducted from revenue</span><span>{money(breakdown.revenueGst - breakdown.adGstCredit)}</span>
            </div>
            <p className="text-xs leading-relaxed text-white/45">This uses the saved ad spend for this reporting day. USD ad accounts are excluded from the deduction.</p>
          </div> : <p className="mt-5 text-sm leading-relaxed text-amber-200">This day has not been refreshed with the Indian ad spend breakdown yet. Refresh the Profit Sheet to update its GST calculation.</p>}
        </div>
      </dialog>, document.body
    )}
  </>;
}
