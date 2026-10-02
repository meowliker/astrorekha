"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { AccountBalanceSummary } from "@/lib/profit-sheet-types";

const money = (value: number, currency: "USD" | "INR") => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export default function AccountBalanceButton({
  data,
  error,
}: {
  data: AccountBalanceSummary | null;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = "account-balance-breakdown";

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="View balance for each ad account"
        aria-haspopup="dialog"
        title="Balance by ad account"
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
                <h2 id={titleId} className="text-lg font-semibold">Account balance by ad account</h2>
                <p className="mt-1 text-sm text-white/65">Current balance reported by Meta</p>
              </div>
              <button type="button" autoFocus onClick={close} aria-label="Close account balance breakdown" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
                <p role="alert" className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {data && (
              <>
                <ul className="mt-4 divide-y divide-white/10">
                  {data.accounts.map((account) => (
                    <li key={account.accountId} className="flex items-start justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{account.accountName}</p>
                        <p className="mt-1 text-xs text-white/40">act_{account.accountId}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p className="text-sm font-semibold text-green-300">{money(account.usd, "USD")}</p>
                        <p className="mt-1 text-xs text-white/55">{money(account.inr, "INR")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {data.accounts.length === 0 && <p className="py-6 text-sm text-white/60">No current ad accounts are configured.</p>}
                <div className="flex items-center justify-between border-t border-white/15 pt-4">
                  <span className="text-sm font-medium">Total balance</span>
                  <div className="text-right tabular-nums">
                    <p className="text-lg font-semibold text-green-300">{money(data.totalUSD, "USD")}</p>
                    <p className="text-xs text-white/55">{money(data.totalINR, "INR")}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-white/40">
                  USD conversion: ₹{data.exchangeRate.toFixed(2)} per $1. Updated {new Date(data.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST.
                </p>
              </>
            )}

            {!data && !error && (
              <p className="py-8 text-center text-sm text-white/60">Account balance is not available yet.</p>
            )}
          </div>
        </dialog>, document.body
      )}
    </>
  );
}
