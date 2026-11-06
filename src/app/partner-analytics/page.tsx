"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BarChart3, LockKeyhole, LogOut } from "lucide-react";

const metrics = { traffic: "Sessions", purchases: "Purchases", revenue: "Purchase revenue" } as const;
type Metric = keyof typeof metrics;
type Row = { label: string; values: Partial<Record<Metric, number | null>> };
type Report = { days: number; metrics: Metric[]; comparison: Row[]; channels: Row[]; thresholded: boolean };
const endpoint = "/api/partner-analytics";
const count = new Intl.NumberFormat("en-IN");
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus-visible:outline-2 focus-visible:outline-indigo-600";

function value(metric: Metric, amount: number | null | undefined) {
  return typeof amount === "number" ? (metric === "revenue" ? money : count).format(amount) : "—";
}

export default function PartnerAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [viewer, setViewer] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (period: number, signal?: AbortSignal) => {
    setLoading(true);
    setReport(null);
    setError("");
    try {
      const response = await fetch(`${endpoint}?days=${period}`, { cache: "no-store", signal });
      const data = await response.json();
      if (signal?.aborted) return;
      if (response.status === 401) {
        setViewer(null);
        return;
      }
      if (typeof data.viewer === "string") setViewer(data.viewer);
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
    void load(days, controller.signal);
    return () => controller.abort();
  }, [days, load]);

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
      } else await load(days);
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
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
        <section className="mx-auto max-w-5xl space-y-8 px-5 py-9 sm:px-8 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <p className="text-sm font-medium text-indigo-700">Read-only access · {viewer}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Acquisition overview</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">Google Ads compared with all other traffic in AstroRekha’s Google Analytics property.</p>
            </div>
            <label className="text-sm font-medium">Period
              <select className={`mt-1 block ${control}`} value={days} onChange={e => setDays(Number(e.target.value))}>
                <option value={7}>Last 7 complete days</option>
                <option value={30}>Last 30 complete days</option>
                <option value={90}>Last 90 complete days</option>
              </select>
            </label>
          </div>
          {loading && <p role="status" className="text-slate-600">Loading report…</p>}
          {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">{error}
            <button onClick={() => void load(days)} className="font-medium underline">Retry</button>
          </div>}
          {report && report.metrics.length === 0 && <p className="text-slate-600">Your account has no metrics enabled. Contact your AstroRekha admin for access.</p>}
          {report && report.metrics.length > 0 && <>
            <div className="grid gap-5 md:grid-cols-3">
              {report.metrics.map(metric => {
                const max = Math.max(0, ...report.comparison.map(row => row.values[metric] || 0));
                return <section key={metric} className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="mb-4 font-semibold">{metrics[metric]}</h2>
                  <dl className="space-y-3">
                    {report.comparison.map((row, index) => <div key={row.label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-sm text-slate-600">{row.label}</dt>
                        <dd className="font-semibold tabular-nums">{value(metric, row.values[metric])}</dd>
                      </div>
                      <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${index === 0 ? "bg-indigo-600" : "bg-slate-400"}`}
                          style={{ width: `${max ? Math.max(0, (row.values[metric] || 0) / max * 100) : 0}%` }} />
                      </div>
                    </div>)}
                  </dl>
                </section>;
              })}
            </div>
            {report.channels.length > 0 && <section>
              <h2 className="mb-3 text-lg font-semibold">Channel breakdown</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50"><tr><th scope="col" className="px-4 py-3">Channel</th>
                    {report.metrics.map(metric => <th key={metric} scope="col" className="whitespace-nowrap px-4 py-3 text-right">{metrics[metric]}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">{report.channels.map(row => <tr key={row.label}>
                    <th scope="row" className="px-4 py-3 font-medium">{row.label}</th>
                    {report.metrics.map(metric => <td key={metric} className="px-4 py-3 text-right tabular-nums">{value(metric, row.values[metric])}</td>)}
                  </tr>)}</tbody>
                </table>
              </div>
            </section>}
            <p className="max-w-3xl text-sm text-slate-600">
              Source is Google Analytics 4, using session attribution and the property’s reporting timezone. The report ends yesterday. Recent figures may change as GA4 finishes processing.
              {report.thresholded && " Google Analytics limits some figures for this period."}
            </p>
          </>}
        </section>
      )}
    </main>
  );
}
