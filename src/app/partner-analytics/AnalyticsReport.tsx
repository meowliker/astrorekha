"use client";

import { useState, type ReactNode } from "react";
import type { AnalyticsMetric, PartnerAnalyticsReport } from "@/lib/partner-analytics-report";

const labels = { traffic: "Sessions", purchases: "Purchases", revenue: "Purchase revenue" } as const;
const count = new Intl.NumberFormat("en-IN");
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const dateLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (date: string) => dateLabel.format(new Date(`${date}T00:00:00Z`));

function formatValue(metric: AnalyticsMetric, amount: number | null | undefined) {
  return typeof amount === "number" ? (metric === "revenue" ? money : count).format(amount) : "—";
}

function Table({ label, first, columns, children, scroll = false }: {
  label: string; first: string; columns: string[]; children: ReactNode; scroll?: boolean;
}) {
  return (
    <div tabIndex={0} role="region" aria-label={label}
      className={`overflow-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-indigo-600 ${scroll ? "max-h-[28rem]" : ""}`}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-100"><tr>
          <th scope="col" className="whitespace-nowrap px-4 py-3">{first}</th>
          {columns.map(column => <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 text-right">{column}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

const cell = "whitespace-nowrap px-4 py-2.5 text-right tabular-nums";
const rowHeader = "whitespace-nowrap px-4 py-2.5 font-medium";

export default function AnalyticsReport({ report, includesToday }: { report: PartnerAnalyticsReport; includesToday: boolean }) {
  const [selectedMetric, setSelectedMetric] = useState<AnalyticsMetric>(report.metrics[0]);
  const metric = report.metrics.includes(selectedMetric) ? selectedMetric : report.metrics[0];
  const groupLabels = report.comparison.map(row => row.label);
  const { details, previousRange } = report;

  return <>
    <section aria-labelledby="comparison-heading">
      <h2 id="comparison-heading" className="text-lg font-semibold">Traffic comparison</h2>
      <p className="mb-3 mt-1 text-sm text-slate-600">Compared with the preceding period of the same length, {formatDate(previousRange.start)} – {formatDate(previousRange.end)}.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {report.metrics.map(key => (
          <section key={key} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 font-semibold">{labels[key]}</h3>
            <dl className="divide-y divide-slate-100">
              {report.comparison.map(row => {
                const current = row.values[key];
                const previous = row.previous[key];
                const change = typeof current === "number" && typeof previous === "number" && previous > 0
                  ? percent.format((current - previous) / previous) : null;
                return <div key={row.label} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-sm font-medium text-slate-700">{row.label}</dt>
                    <dd className="font-semibold tabular-nums">{formatValue(key, current)}</dd>
                  </div>
                  <dd className="mt-0.5 text-right text-xs text-slate-600">
                    Previously {formatValue(key, previous)}{change && ` · ${change}`}
                  </dd>
                </div>;
              })}
            </dl>
          </section>
        ))}
      </div>
    </section>
    {details && <>
      <section aria-labelledby="daily-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="daily-heading" className="text-lg font-semibold">Daily activity</h2>
            <p className="mt-1 text-sm text-slate-600">Use these daily totals to compare with GA4 for the same dates.</p>
          </div>
          {report.metrics.length > 1 && <label className="flex items-center gap-2 text-sm font-medium">
            Daily metric
            <select className="rounded-lg border border-slate-300 bg-white px-3 py-2" value={metric}
              onChange={event => setSelectedMetric(event.target.value as AnalyticsMetric)}>
              {report.metrics.map(key => <option key={key} value={key}>{labels[key]}</option>)}
            </select>
          </label>}
        </div>
        <Table label={`Daily activity, ${labels[metric]}`} first="Date" columns={groupLabels} scroll>
          {details.daily.map(row => <tr key={row.date}>
            <th scope="row" className={rowHeader}>{formatDate(row.date)}</th>
            {row.groups.map((group, index) => <td key={groupLabels[index]} className={cell}>{formatValue(metric, group[metric])}</td>)}
          </tr>)}
        </Table>
      </section>
      <section aria-labelledby="landing-heading">
        <h2 id="landing-heading" className="text-lg font-semibold">Paid traffic by landing page</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600">Compare Google Ads and Meta Ads on the main AstroRekha and Soulmate funnel entry pages. Sessions are grouped by the first page visited.</p>
        <Table label="Paid traffic by landing page" first="Landing page and source" columns={report.metrics.map(key => labels[key])}>
          {details.landingPages.flatMap(row => row.groups.map((group, index) => <tr key={`${row.path}-${index}`}>
            <th scope="row" className={rowHeader}>{row.path}<span className="ml-3 font-normal text-slate-600">{groupLabels[index]}</span></th>
            {report.metrics.map(key => <td key={key} className={cell}>{formatValue(key, group[key])}</td>)}
          </tr>))}
        </Table>
      </section>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section aria-labelledby="channels-heading">
          <h2 id="channels-heading" className="mb-3 text-lg font-semibold">Channel breakdown</h2>
          {details.channels.length ? <Table label="GA4 channel breakdown" first="Channel" columns={report.metrics.map(key => labels[key])}>
            {details.channels.map(row => <tr key={row.label}>
              <th scope="row" className={rowHeader}>{row.label}</th>
              {report.metrics.map(key => <td key={key} className={cell}>{formatValue(key, row.values[key])}</td>)}
            </tr>)}
          </Table> : <p className="text-sm text-slate-600">GA4 returned no channel rows for these dates.</p>}
        </section>
        {details.events.length > 0 && <section aria-labelledby="events-heading">
          <h2 id="events-heading" className="text-lg font-semibold">Funnel tracking events</h2>
          <p className="mb-3 mt-1 text-sm text-slate-600">Event totals across all traffic. A visitor can trigger an event more than once.</p>
          <Table label="Funnel tracking events" first="Event" columns={["Occurrences"]}>
            {details.events.map(event => <tr key={event.label}>
              <th scope="row" className={rowHeader}>{event.label}</th>
              <td className={cell}>{formatValue("traffic", event.count)}</td>
            </tr>)}
          </Table>
        </section>}
      </div>
    </>}
    <div className="space-y-1 text-sm text-slate-600">
      <p>Source is GA4 session attribution. Revenue is shown in INR when enabled.</p>
      {details && <p>Meta Ads traffic is identified by paid Facebook, Instagram and Meta tags in GA4. Untagged traffic may appear under another source.</p>}
      <p>{includesToday ? "Today’s data is still being collected. " : ""}Recent figures may change as GA4 finishes processing.
        {report.thresholded && " GA4 has applied reporting thresholds. A dash indicates an unavailable figure."}
      </p>
    </div>
  </>;
}
