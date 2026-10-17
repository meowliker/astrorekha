"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { budgetAmountInput, parseBudgetAmount } from "@/lib/tracking-budget-amount";
import type { BudgetLevel, MetaBudget } from "@/lib/tracking-meta-budget";

export type BudgetTarget = { accountId: string; id: string; level: BudgetLevel; name: string };
type Props = { target: BudgetTarget; token: string; onClose: () => void; onSaved: (budget: MetaBudget, previousAmountMinor: number) => void };

function money(value: number, currency: string, digits: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value / 10 ** digits);
}

export default function TrackingBudgetDialog({ target, token, onClose, onSaved }: Props) {
  const [budget, setBudget] = useState<MetaBudget | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const proposed = budget ? parseBudgetAmount(value, budget.fractionDigits) : null;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [onClose, saving]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ accountId: target.accountId, id: target.id, level: target.level });
    fetch(`/api/admin/soulmate/tracking/budget?${params}`, { headers: { "x-admin-session": token }, cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load the Meta budget."); return data as { budget: MetaBudget }; })
      .then(({ budget: current }) => { setBudget(current); setValue(budgetAmountInput(current.amountMinor, current.fractionDigits)); setLoading(false); })
      .catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load the Meta budget."); setLoading(false); } });
    return () => controller.abort();
  }, [target.accountId, target.id, target.level, token]);

  async function save() {
    if (!budget || proposed == null || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/soulmate/tracking/budget", {
        method: "POST", headers: { "Content-Type": "application/json", "x-admin-session": token }, cache: "no-store",
        body: JSON.stringify({ accountId: budget.accountId, id: budget.id, level: budget.level, type: budget.type, expectedAmountMinor: budget.amountMinor, newAmountMinor: proposed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Meta did not confirm this budget change.");
      onSaved((data as { budget: MetaBudget }).budget, budget.amountMinor);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the Meta budget."); setReview(false); }
    finally { setSaving(false); }
  }

  return createPortal(<div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="budget-dialog-title" className="w-full max-w-lg rounded-2xl border border-cyan-400/20 bg-[#111c2d] p-6 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="budget-dialog-title" className="text-xl font-semibold">Change Meta budget</h2><p className="mt-1 break-words text-sm text-slate-300">{target.level === "campaign" ? "Campaign" : "Ad set"}: {budget?.name || target.name}</p><p className="mt-1 text-xs text-slate-500">Ad account {target.accountId} · Meta ID {target.id}</p></div><button type="button" aria-label="Close" onClick={onClose} disabled={saving} className="rounded p-1 text-slate-400 hover:text-white disabled:opacity-50"><X size={20} /></button></div>
      {loading ? <p className="mt-6 text-sm text-slate-400">Reading current budget from Meta…</p> : budget ? <div className="mt-6 space-y-4">
        <p className="text-sm text-slate-300">{budget.type === "daily" ? "Daily" : "Lifetime"} budget · {budget.currency}</p>
        <p className="text-sm">Current: <strong>{money(budget.amountMinor, budget.currency, budget.fractionDigits)}</strong></p>
        <label className="block text-sm text-slate-200">New {budget.type} budget ({budget.currency})<input type="text" inputMode="decimal" value={value} onChange={(event) => { setValue(event.target.value); setReview(false); }} disabled={saving} className="mt-2 w-full rounded-lg border border-white/20 bg-[#0a1220] px-3 py-2 text-white outline-none focus:border-cyan-400" /></label>
        {proposed == null && <p className="text-xs text-amber-300">Enter a positive amount with no more than {budget.fractionDigits} decimal places.</p>}
        {review && proposed != null && <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm">Confirm {budget.type} budget change from <strong>{money(budget.amountMinor, budget.currency, budget.fractionDigits)}</strong> to <strong>{money(proposed, budget.currency, budget.fractionDigits)}</strong>. This will update Meta.</div>}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-white/20 px-4 py-2 text-sm">Cancel</button>{review ? <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07121c] disabled:opacity-50">{saving ? "Updating Meta…" : "Confirm update in Meta"}</button> : <button type="button" onClick={() => setReview(true)} disabled={proposed == null || proposed === budget.amountMinor} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07121c] disabled:opacity-50">Review change</button>}</div>
      </div> : null}
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    </div>
  </div>, document.body);
}
