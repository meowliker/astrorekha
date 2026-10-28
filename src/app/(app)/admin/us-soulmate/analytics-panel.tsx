"use client";
import { useEffect, useState } from "react";
import type { summarizeSoulmateAnalytics } from "@/lib/us-soulmate-analytics";
import TrackingDateRangePicker from "./tracking/TrackingDateRangePicker";
import { analyticsToday, defaultAnalyticsStart, US_ANALYTICS_LAUNCH_DATE } from "@/lib/us-soulmate-analytics-range";
type Report = ReturnType<typeof summarizeSoulmateAnalytics> & { bounce: { value: number | null; status: string }; startDate: string; endDate: string };
const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
export function SoulmateAnalyticsPanel() {
  const [dates, setDates] = useState(() => { const today = analyticsToday(); return { start: defaultAnalyticsStart(today), end: today }; });
  const { start, end } = dates;
  const [tab, setTab] = useState<"overview" | "reports">("overview");
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
      <div><p className="mb-2 text-sm text-white/60">Date range · IST</p><TrackingDateRangePicker value={dates} onChange={setDates} minDate={US_ANALYTICS_LAUNCH_DATE} maxDate={analyticsToday()} maxDays={93} align="left" /></div>
      <button className="rounded-lg border border-white/10 px-4 py-2 text-sm" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
    </div>
    <p className="mt-3 text-xs text-white/60">Reporting begins October 28, 2026 at 11:30 AM IST. Earlier visits, orders and explicitly tagged QA traffic are excluded. Landing sessions include all tracked traffic, not only ads.</p>
    <div role="tablist" aria-label="Analytics sections" className="mt-6 flex gap-2 border-b border-white/10 pb-3">{([['overview', 'Overview'], ['reports', 'Reports']] as const).map(([id, label]) => <button type="button" key={id} role="tab" id={`analytics-${id}-tab`} aria-selected={tab === id} aria-controls={`analytics-${id}`} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 text-sm ${tab === id ? "bg-primary text-white" : "bg-white/5 text-white/60"}`}>{label}</button>)}</div>
    {error ? <p role="alert" className="mt-6 text-primary">{error}</p> : !report ? <p className="mt-6 text-white/50" role="status">Loading analytics…</p> : tab === "reports" ? <div role="tabpanel" id="analytics-reports" aria-labelledby="analytics-reports-tab" className="mt-6">
      <h2 className="text-lg font-medium">Sales by product</h2>
      <p className="mt-2 max-w-3xl text-sm text-white/60">Verified paid US orders in the selected range. Revenue is after discounts and before tax and refunds. Vision is counted as one bundle; its included description, color and delivery are not counted again as separate sales.</p>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-white/10 text-white/50"><tr>{["Product / report", "Orders", "Units", "Before discounts", "Discounts", "Revenue"].map((label) => <th key={label} className="py-3 pr-4 font-normal">{label}</th>)}</tr></thead><tbody>{report.products.rows.map((row) => <tr key={row.id} className="border-b border-white/5"><td className="py-4 pr-4">{row.name}</td><td>{row.orders}</td><td>{row.units}</td><td>{usd(row.listRevenue)}</td><td>{usd(row.discount)}</td><td>{usd(row.revenue)}</td></tr>)}</tbody><tfoot><tr><th className="py-4 font-medium" colSpan={5}>Total product revenue</th><td>{usd(report.products.totalRevenue)}</td></tr></tfoot></table></div>
      {report.products.unallocatedOrders > 0 && <p className="mt-3 text-sm text-amber-200">{report.products.unallocatedOrders} orders lack a valid item breakdown and are excluded from product revenue.</p>}
      <p className="mt-3 text-xs text-white/50">Order counts overlap when a customer buys add-ons. Order-level discounts are allocated across purchased items in proportion to their recorded prices.</p>
    </div> : <div role="tabpanel" id="analytics-overview" aria-labelledby="analytics-overview-tab">
      <dl className="my-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[["Landing sessions", String(report.sessions)], ["Checkout rate", percent(report.checkoutRate)], ["Purchase conversion", percent(report.conversionRate)], ["Bounce rate · GA4 full days", percent(report.bounce.value)], ["Checkout → purchase", percent(report.checkoutToPurchaseRate)], ["Checkout abandonment", percent(report.checkoutAbandonment)], ["Paid orders", String(report.paidOrders)], ["Gross sales", `$${report.grossRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`]].map(([label, value]) => <div key={label}><dt className="text-sm text-white/60">{label}</dt><dd className="mt-2 text-3xl font-light">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-white/60">{report.bounce.status}</p>
      <h2 className="mt-8 text-lg font-medium">Funnel</h2>
      <table className="mt-3 w-full text-left text-sm"><thead className="border-b border-white/10 text-white/50"><tr><th className="py-3 font-normal">Stage</th><th className="text-right font-normal">Unique sessions</th></tr></thead><tbody>{report.funnel.map((row) => <tr key={row.label} className="border-b border-white/5"><td className="py-3">{row.label}</td><td className="text-right">{row.sessions}</td></tr>)}</tbody></table>
      <h2 className="mt-8 text-lg font-medium">Traffic & campaigns</h2>
      <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[600px] text-left text-sm"><thead className="border-b border-white/10 text-white/50"><tr>{["Source", "Campaign", "Landings", "Checkouts", "Purchasing sessions"].map((label) => <th key={label} className="py-3 pr-4 font-normal">{label}</th>)}</tr></thead><tbody>{report.campaigns.map((row) => <tr key={JSON.stringify([row.source, row.campaign])} className="border-b border-white/5"><td className="py-3 pr-4">{row.source}</td><td className="pr-4">{row.campaign}</td><td>{row.sessions}</td><td>{row.checkoutSessions}</td><td>{row.purchasingSessions}</td></tr>)}</tbody></table></div>
      {!report.sessions && <p className="mt-5 text-sm text-white/50">No tracked production landings in this range yet.</p>}
      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-white/60">Funnel rates use unique tracked soulmate landing sessions, with a new session after 30 minutes of inactivity. Purchases require a verified live payment and a matching session. Sales use payment dates; a purchase outside this date range is not included. Dates use IST except GA4 bounce rate, which uses the GA4 property timezone. Ad blockers, missing session IDs and reporting delays can cause differences between these figures and Meta or GA4.</p>
    </div>}
  </section>;
}
