"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Loader2, X } from "lucide-react";
import type { DailySpendBreakdown } from "@/lib/profit-sheet-types";

const money = (value: number, currency: string) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);

export default function SpendBreakdownButton({ date, savedTotalINR, dayMode = "business_1130_ist" }: {
  date: string;
  savedTotalINR: number;
  dayMode?: "business_1130_ist" | "calendar_ist";
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DailySpendBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `spend-breakdown-${dayMode}-${date}`;
  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setData(null);
    setError(null);
    async function load() {
      try {
        const token = localStorage.getItem("admin_session_token");
        if (!token) throw new Error("Your admin session has expired. Please sign in again.");
        const params = new URLSearchParams({ token, breakdownDate: date, dayMode });
        const response = await fetch(`/api/admin/profit-sheet?${params}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401) throw new Error("Your admin session has expired. Please sign in again.");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load account spend. Please try again.");
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load account spend.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, date, dayMode, attempt]);

  function close() {
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View ad account spend for ${formattedDate}`}
        aria-haspopup="dialog"
        title="Spend by ad account"
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
                <h2 id={titleId} className="text-lg font-semibold">Ad spend by account</h2>
                <p className="mt-1 text-sm text-white/65">{formattedDate}</p>
              </div>
              <button type="button" autoFocus onClick={close} aria-label="Close spend breakdown" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/50">
              {dayMode === "calendar_ist" ? "12:00 AM to 11:59 PM IST." : "11:30 AM to next day 11:29 AM IST."} Each account’s configured start and end times apply.
            </p>
            {!data && !error && (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-white/60">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading account spend…
              </div>
            )}
            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
                <p role="alert" className="text-sm text-red-200">{error}</p>
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">Try again</button>
              </div>
            )}
            {data && (
              <>
                <ul className="mt-4 divide-y divide-white/10">
                  {data.accounts.map((account) => (
                    <li key={account.accountId} className="flex items-start justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{account.accountName}</p>
                        <p className="mt-1 text-xs text-white/40">{account.accountId}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-sm font-semibold text-red-300">{money(account.inr, "INR")}</p>
                        <p className="mt-1 text-xs text-white/50">{money(account.spend, account.currency)} {account.currency}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {data.accounts.length === 0 && <p className="py-6 text-sm text-white/60">No ad accounts are configured for this day.</p>}
                <div className="flex items-center justify-between border-t border-white/15 pt-4">
                  <span className="text-sm font-medium">Total spend</span>
                  <div className="text-right tabular-nums">
                    <p className="text-lg font-semibold text-red-300">{money(data.totalINR, "INR")}</p>
                    <p className="text-xs text-white/50">{money(data.totalUSD, "USD")} USD equivalent</p>
                  </div>
                </div>
                {Math.abs(data.totalINR - savedTotalINR) >= 0.01 && (
                  <p className="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-200">
                    The saved row shows {money(savedTotalINR, "INR")}. This breakdown uses the latest Meta data and current account settings. Refresh the sheet to update the saved total.
                  </p>
                )}
                <p className="mt-4 text-xs leading-relaxed text-white/40">
                  USD conversion: ₹{data.exchangeRate.toFixed(2)} per $1. Updated {new Date(data.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST. Partial hours are estimated proportionally.
                </p>
              </>
            )}
          </div>
        </dialog>, document.body
      )}
    </>
  );
}
