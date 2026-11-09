"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PartnerFunnelTraffic, PartnerLiveTraffic } from "@/lib/partner-live-traffic";

const count = new Intl.NumberFormat("en-IN");
const clockPreference = "astrorekha_partner_live_clock";
type Clock = "property" | "india";

export default function LiveTraffic({ endpoint, children }: {
  endpoint: string; children: (report: PartnerLiveTraffic | null) => ReactNode;
}) {
  const [clock, setClock] = useState<Clock | null>(null);
  const [traffic, setTraffic] = useState<{ clock: Clock; report: PartnerLiveTraffic } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    try { setClock(window.localStorage.getItem(clockPreference) === "india" ? "india" : "property"); }
    catch { setClock("property"); }
  }, []);

  useEffect(() => {
    if (!clock) return;
    const selectedClock = clock;
    const controller = new AbortController();
    let loading = false;
    async function refresh() {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const response = await fetch(`${endpoint}?view=live&clock=${selectedClock}`, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if ([401, 403, 409].includes(response.status)) {
          setTraffic(null);
          setUnavailable(false);
          return;
        }
        if (!response.ok) throw new Error("Live traffic unavailable");
        const data = await response.json() as { live: PartnerLiveTraffic | null };
        if (controller.signal.aborted) return;
        setTraffic(data.live ? { clock: selectedClock, report: data.live } : null);
        setUnavailable(false);
      } catch {
        if (!controller.signal.aborted) {
          setUnavailable(true);
        }
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [clock, endpoint]);

  const report = traffic && traffic.clock === clock && !unavailable ? traffic.report : null;
  const checked = report && new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: report.timeZone }).format(new Date(report.checkedAt));

  return <>
    {(traffic || unavailable) && <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Live traffic time
          <select value={clock ?? "property"} onChange={event => {
            const next = event.target.value as Clock;
            setUnavailable(false);
            setClock(next);
            try { window.localStorage.setItem(clockPreference, next); } catch { /* Use the in-memory selection. */ }
          }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900">
            <option value="property">GA4 property time</option>
            <option value="india">India (IST)</option>
          </select>
        </label>
      </div>
      {report ? <p className="mt-2 text-xs text-slate-600">Live views updated {checked} · {report.timeZone}</p>
        : <p role="status" className="mt-2 text-sm text-slate-600">
          {unavailable ? "Live funnel traffic is temporarily unavailable." : "Loading live funnel traffic…"}
        </p>}
    </div>}
    {children(report)}
  </>;
}

export function LiveTrafficTable({ traffic, date }: { traffic: PartnerFunnelTraffic; date: string }) {
  const formattedDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const rows = [{ label: "All tracked views", ...traffic.total }, ...traffic.channels];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold">Live funnel traffic</h3>
      <p className="mt-1 text-sm text-slate-600">Views of this funnel’s entry pages. Repeat views can count more than once.</p>
      <table className="mt-3 w-full text-sm">
        <thead className="border-b border-slate-200 text-slate-600"><tr>
          <th scope="col" className="py-2 text-left">Source</th>
          <th scope="col" className="px-2 py-2 text-right">Last 30 min</th>
          <th scope="col" className="py-2 text-right">{formattedDate} so far</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.label}>
          <th scope="row" className="py-2 text-left font-medium">{row.label}</th>
          <td className="px-2 py-2 text-right tabular-nums">{count.format(row.recent)}</td>
          <td className="py-2 text-right tabular-nums">{count.format(row.today)}</td>
        </tr>)}</tbody>
      </table>
      {traffic.channels.length > 0 && <p className="mt-2 text-xs text-slate-600">Google and Meta counts use campaign tags on the entry URL.</p>}
    </div>
  );
}
