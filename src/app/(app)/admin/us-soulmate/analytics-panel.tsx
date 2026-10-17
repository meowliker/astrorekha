"use client";
import { useEffect, useState } from "react";
import type { summarizeSoulmateAnalytics } from "@/lib/us-soulmate-analytics";
type Report = ReturnType<typeof summarizeSoulmateAnalytics> & { bounce: { value: number | null; status: string }; startDate: string; endDate: string };
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
export function SoulmateAnalyticsPanel() {
  const [start, setStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setReport(null); setError("");
    async function load() {
      try {
        const token = localStorage.getItem("admin_session_token");
        const response = await fetch(`/api/admin/us-soulmate/analytics?${new URLSearchParams({ start, end })}`, { headers: { Authorization: `Bearer ${token || ""}` }, cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load analytics");
        if (!abort.signal.aborted) setReport(data);
      } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load analytics"); }
    }
    void load(); return () => abort.abort();
  }, [start, end, refresh]);
  return <section className="py-8" aria-label="Soulmate analytics">
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-sm text-white/60">From<input className="mt-2 block rounded-lg border border-white/10 bg-[#0F1626] p-2 text-white" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></label>
      <label className="text-sm text-white/60">Through<input className="mt-2 block rounded-lg border border-white/10 bg-[#0F1626] p-2 text-white" type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} /></label>
      <button className="rounded-lg border border-white/10 px-4 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
    </div>
    {error ? <p role="alert" className="mt-6 text-primary">{error}</p> : !report ? <p className="mt-6 text-white/50" role="status">Loading analytics…</p> : <>
      <dl className="my-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[["Landing sessions", String(report.sessions)], ["Checkout rate", percent(report.checkoutRate)], ["Purchase conversion", percent(report.conversionRate)], ["Bounce rate · GA4", percent(report.bounce.value)], ["Checkout → purchase", percent(report.checkoutToPurchaseRate)], ["Checkout abandonment", percent(report.checkoutAbandonment)], ["Paid orders", String(report.paidOrders)], ["Gross sales", `$${report.grossRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`]].map(([label, value]) => <div key={label}><dt className="text-sm text-white/60">{label}</dt><dd className="mt-2 text-3xl font-light">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-white/60">{report.bounce.status}</p>
      <h2 className="mt-8 text-lg font-medium">Funnel</h2>
      <table className="mt-3 w-full text-left text-sm"><thead className="border-b border-white/10 text-white/50"><tr><th className="py-3 font-normal">Stage</th><th className="text-right font-normal">Unique sessions</th></tr></thead><tbody>{report.funnel.map((row) => <tr key={row.label} className="border-b border-white/5"><td className="py-3">{row.label}</td><td className="text-right">{row.sessions}</td></tr>)}</tbody></table>
      <h2 className="mt-8 text-lg font-medium">Traffic & campaigns</h2>
      <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[600px] text-left text-sm"><thead className="border-b border-white/10 text-white/50"><tr>{["Source", "Campaign", "Landings", "Checkouts", "Purchasing sessions"].map((label) => <th key={label} className="py-3 pr-4 font-normal">{label}</th>)}</tr></thead><tbody>{report.campaigns.map((row) => <tr key={JSON.stringify([row.source, row.campaign])} className="border-b border-white/5"><td className="py-3 pr-4">{row.source}</td><td className="pr-4">{row.campaign}</td><td>{row.sessions}</td><td>{row.checkoutSessions}</td><td>{row.purchasingSessions}</td></tr>)}</tbody></table></div>
      {!report.sessions && <p className="mt-5 text-sm text-white/50">No tracked production landings in this range yet.</p>}
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-white/60">Funnel rates use unique tracked soulmate landing sessions, with a new session after 30 minutes of inactivity. Purchases require a verified live payment and a matching session. Sales use payment dates; a purchase outside this date range is not included. Dates use IST except GA4 bounce rate, which uses the GA4 property timezone. Ad blockers, missing session IDs and reporting delays can cause differences between these figures and Meta or GA4.</p>
    </>}
  </section>;
}
