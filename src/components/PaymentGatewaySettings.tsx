"use client";
import { useEffect, useState } from "react";
export function PaymentGatewaySettings() {
  const [active, setActive] = useState<"payu" | "paytm">("payu");
  const [choice, setChoice] = useState<"payu" | "paytm">("payu");
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/payment-gateway", { headers: headers(), cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setActive(data.active); setChoice(data.active); setReady(data.paytmReady); setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setMessage("Unable to load payment settings. Refresh to try again."); });
    return () => controller.abort();
  }, []);
  const save = async () => {
    if (!window.confirm(`Use ${choice === "paytm" ? "Paytm" : "PayU"} for new Indian payments? Existing payments will continue with their original gateway.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/payment-gateway", { method: "POST", headers: headers(), body: JSON.stringify({ active: choice }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setActive(data.active); setMessage("Saved. New checkouts will use the selected gateway.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save"); } finally { setBusy(false); }
  };
  return <section className="mb-6 rounded-xl border border-border bg-card p-5">
    <h2 className="font-semibold">Payment gateway</h2>
    <p className="mt-1 text-sm text-muted-foreground">Select the gateway for new report, add-on, chat and Indian Soulmate purchases. Existing payments continue with their original gateway. US payments use Stripe.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label htmlFor="payment-gateway">New payments</label>
      <select id="payment-gateway" value={choice} disabled={!loaded || busy} onChange={e => setChoice(e.target.value as "payu" | "paytm")} className="rounded-lg border border-border bg-background p-2">
        <option value="payu">PayU</option><option value="paytm" disabled={!ready}>Paytm{!ready ? " — setup required" : ""}</option>
      </select>
      <button type="button" disabled={!loaded || busy || active === choice} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save gateway"}</button>
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
