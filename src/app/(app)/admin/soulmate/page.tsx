"use client";

import { SoulmateInvoicesPanel } from "./invoices-panel";
import { SoulmateOrdersPanel } from "./orders-panel";
import { SoulmateAnalyticsPanel } from "./analytics-panel";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Receipt, Sparkles, PackageCheck } from "lucide-react";

const profitMetrics = [
  ["Net revenue", "Sales excluding GST, less refunds"],
  ["Ad spend", "Spend assigned to soulmate campaigns"],
  ["Net profit", "Net revenue less ads and fulfilment costs"],
  ["ROAS", "Attributed revenue divided by ad spend"],
];
const profitColumns = ["Date", "Paid orders", "Gross sales", "GST", "Refunds", "Net revenue", "Ad spend", "Payment fees", "Sketch & email costs", "Net profit", "ROAS"];

/** Soulmate analytics is isolated from the existing Tracking and Revenue screens. */
export default function SoulmateAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"orders" | "analytics" | "profit" | "invoices">("orders");

  useEffect(() => {
    try {
      const token = localStorage.getItem("admin_session_token");
      const expires = Date.parse(localStorage.getItem("admin_session_expiry") || "");
      if (!token || !Number.isFinite(expires) || expires <= Date.now()) {
        router.replace("/admin/login");
        return;
      }
      setReady(true);
    } catch { router.replace("/admin/login"); }
  }, [router]);

  if (!ready) return <main className="min-h-screen bg-[#0A0E1A] p-8 text-white/60" aria-busy="true">Loading admin…</main>;

  const metrics = profitMetrics;
  return <main className="min-h-screen bg-[#0A0E1A] px-4 py-8 text-white sm:px-8 [color-scheme:dark]">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin" className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><ArrowLeft size={16} aria-hidden="true" />Admin dashboard</Link>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-[#111827] p-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary"><Sparkles size={15} aria-hidden="true" />Soulmate</p>
          <h1 className="text-3xl font-semibold tracking-tight">Soulmate Dashboard</h1>
          <p className="mt-2 text-sm text-white/60">Orders, delivery and reporting for the soulmate page.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">Production analytics</span>
      </header>

      <div className="my-6 rounded-xl border border-white/10 bg-[#141C2E] px-5 py-4">
        <p className="text-sm font-medium">Soulmate tracking</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/60">Orders & delivery shows purchases, uploaded files, review status and scheduled emails. Analytics reports soulmate traffic and verified purchases. The profit sheet is awaiting connection.</p>
      </div>

      <nav aria-label="Soulmate workspace" className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111827] p-2">
        {([{ id: "orders", label: "Orders & delivery", icon: PackageCheck }, { id: "invoices", label: "Invoices", icon: Receipt }, { id: "analytics", label: "Analytics", icon: BarChart3 }, { id: "profit", label: "Profit sheet", icon: Receipt }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${tab === id ? "bg-primary text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><Icon size={16} aria-hidden="true" />{label}</button>)}
      </nav>

      {tab === "profit" && <section aria-label="Profit summary">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-b border-white/10 py-8 lg:grid-cols-4">
          {metrics.map(([label, description]) => <div key={label}>
            <dt className="text-sm text-white/65">{label}</dt>
            <dd className="my-3 text-3xl font-light text-white/50"><span aria-hidden="true">—</span><span className="sr-only">Not connected</span></dd>
            <p className="max-w-52 text-xs leading-relaxed text-white/60">{description}</p>
          </div>)}
        </dl>
      </section>}

      {tab === "orders" ? <SoulmateOrdersPanel /> : tab === "invoices" ? <SoulmateInvoicesPanel /> : tab === "analytics" ? <SoulmateAnalyticsPanel /> : <section className="py-8" aria-labelledby="profit-title">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="profit-title" className="text-lg font-medium">Daily profit sheet</h2><p className="mt-1 text-sm text-white/60">Soulmate sales, campaign spend and fulfilment costs. Amounts in INR.</p></div>
          <span className="text-xs text-white/60">Date filters available after connection</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <caption className="sr-only">Soulmate daily profit sheet. No data sources connected.</caption>
            <thead className="bg-[#141C2E] text-xs text-white/60"><tr>{profitColumns.map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-4 font-medium">{label}</th>)}</tr></thead>
            <tbody><tr><td colSpan={profitColumns.length} className="px-6 py-16 text-center"><p className="font-medium text-white/70">Your profit sheet is ready for connection</p><p className="mt-2 text-sm text-white/60">No sales imported, no ad accounts linked, and no profit calculated.</p></td></tr></tbody>
          </table>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-white/60">This report is reserved for soulmate activity. It will stay separate from the existing Revenue Dashboard and Profit Sheet.</p>
      </section>}
      <footer className="border-t border-white/10 pt-5 text-xs text-white/50">Figures shown as “—” are unavailable, not zero. Local and preview visits are excluded from soulmate analytics.</footer>
    </div>
  </main>;
}
