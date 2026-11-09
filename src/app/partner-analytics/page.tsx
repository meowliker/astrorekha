"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BarChart3, LockKeyhole, LogOut } from "lucide-react";

import RevenueDateRange from "@/components/admin/revenue/RevenueDateRange";
import type { PartnerAnalyticsReport } from "@/lib/partner-analytics-report";
import { analyticsPresets, earliestAnalyticsDate, validAnalyticsRange, type AnalyticsRange } from "@/lib/partner-analytics-period";
import AnalyticsReport from "./AnalyticsReport";
import LiveTraffic, { LiveTrafficTable } from "./LiveTraffic";
import { partnerFunnels } from "@/lib/partner-funnels";

type Calendar = { today: string; timeZone: string; range: AnalyticsRange };
const endpoint = "/api/partner-analytics";
const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus-visible:outline-2 focus-visible:outline-indigo-600";

export default function PartnerAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [report, setReport] = useState<PartnerAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (selected: AnalyticsRange | null, signal?: AbortSignal) => {
    setLoading(true);
    setReport(null);
    setError("");
    try {
      const query = selected ? `?${new URLSearchParams(selected)}` : "";
      const response = await fetch(`${endpoint}${query}`, { cache: "no-store", signal });
      const data = await response.json();
      if (signal?.aborted) return;
      if (response.status === 401) {
        setViewer(null);
        setCalendar(null);
        return;
      }
      if (typeof data.viewer === "string") setViewer(data.viewer);
      if (data.calendar) setCalendar(data.calendar);
      if (!response.ok) throw new Error(data.error);
      setReport(data.report);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Unable to load the report.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(range, controller.signal);
    return () => controller.abort();
  }, [range, load]);

  async function sessionAction(payload: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (payload.action === "logout") {
        setViewer(null);
        setReport(null);
        setCalendar(null);
      } else await load(range);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete the request.");
    } finally { setBusy(false); }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void sessionAction({ action: "login", email: String(form.get("email")), password: String(form.get("password")) });
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5 font-semibold"><BarChart3 size={20} className="text-indigo-700" /> AstroRekha</div>
          {viewer && <button type="button" disabled={busy || loading} onClick={() => void sessionAction({ action: "logout" })}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:text-indigo-700">
            <LogOut size={16} /> Sign out
          </button>}
        </div>
      </header>
      {!viewer ? (
        <section className="mx-auto max-w-md px-5 py-16 sm:py-24" aria-labelledby="sign-in-heading">
          <LockKeyhole size={24} className="mb-4 text-indigo-700" />
          <h1 id="sign-in-heading" className="text-3xl font-semibold tracking-tight">Partner analytics</h1>
          <p className="mt-2 text-slate-600">Sign in with the viewer credentials provided by AstroRekha.</p>
          <form onSubmit={login} className="mt-8 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">Email
              <input className={control} name="email" type="email" autoComplete="username" maxLength={254} required />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">Password
              <input className={control} name="password" type="password" autoComplete="current-password" maxLength={128} required />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button disabled={busy || loading} className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">Sign in</button>
          </form>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl space-y-8 px-5 py-9 sm:px-8 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-sm font-medium text-indigo-700">Read-only access · {viewer}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Acquisition overview</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">Compare acquisition and check the tracking data recorded in AstroRekha’s Google Analytics property.</p>
            </div>
            {calendar && <div className="space-y-1 sm:ml-auto">
              <p className="text-xs font-medium text-slate-600">Report dates · {calendar.timeZone.replaceAll("_", " ")}</p>
              <RevenueDateRange value={range ?? calendar.range} onChange={setRange} settings={{
                today: calendar.today,
                minimum: earliestAnalyticsDate,
                timeZone: calendar.timeZone,
                presets: analyticsPresets(calendar.today),
                validate: selected => validAnalyticsRange(selected, calendar.today),
              }} />
            </div>}
          </div>
          {loading && <p role="status" className="text-slate-600">Loading report…</p>}
          {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">{error}
            <button onClick={() => void load(range)} className="font-medium underline">Retry</button>
          </div>}
          {report && report.metrics.length === 0 && <p className="text-slate-600">Your account has no metrics enabled. Contact your AstroRekha admin for access.</p>}
          {calendar && calendar.range.end === calendar.today && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Today’s GA4 figures are still being processed. A dash marks an unavailable figure. Percentage comparisons are shown for completed days.
          </p>}
          <LiveTraffic endpoint={endpoint}>{live => partnerFunnels.map(({ key, label, paths }) => {
            const historical = report?.funnels.find(funnel => funnel.key === key);
            const current = live?.funnels.find(funnel => funnel.key === key);
            return (
              <section key={key} aria-labelledby={`${key}-heading`} className="space-y-5 border-t border-slate-200 pt-7">
                <div>
                  <h2 id={`${key}-heading`} className="text-2xl font-semibold tracking-tight">{label}</h2>
                  <p className="mt-1 break-words text-sm text-slate-600">{paths.join(" · ")}</p>
                </div>
                {live && current && <LiveTrafficTable traffic={current} date={live.date} />}
                {report && historical && <AnalyticsReport report={report} funnel={historical}
                  includesToday={Boolean(calendar && calendar.range.end === calendar.today)} />}
              </section>
            );
          })}</LiveTraffic>
          {report && report.metrics.length > 0 && <p className="text-sm text-slate-600">
            GA4 groups sessions by the landing pages listed under each funnel. Revenue is shown in INR when enabled.
            Recent figures may change as GA4 finishes processing.
            {report.thresholded && " GA4 has applied reporting thresholds. A dash indicates an unavailable figure."}
          </p>}
        </section>
      )}
    </main>
  );
}
