"use client";
import { useEffect, useState } from "react";
import { beginInrCouponCheckout } from "@/lib/inr-coupon-client";

export default function InrReportCoupon({ productId, type = "report", disabled = false, onBusyChange }: {
  productId: string; type?: "report" | "upsell"; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const resume = () => { setBusy(false); onBusyChange?.(false); };
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, [onBusyChange]);
  if (!open) return <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="mt-4 w-full text-sm text-white/70 underline disabled:opacity-50">Have a coupon code?</button>;
  return <div className="mt-4 space-y-2">
    <label className="block text-sm text-white/70">Coupon code
      <input value={code} onChange={e => { setCode(e.target.value); setError(""); }} autoComplete="off" maxLength={80} disabled={busy || disabled}
        className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white" />
    </label>
    <button type="button" disabled={!code.trim() || busy || disabled} className="w-full rounded-xl border border-primary py-3 text-sm disabled:opacity-50"
      onClick={async () => { setBusy(true); onBusyChange?.(true); setError(""); try { await beginInrCouponCheckout({ code, type, productId }); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setBusy(false); onBusyChange?.(false); } }}>
      {busy ? "Checking…" : "Apply coupon"}
    </button>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}
