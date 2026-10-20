"use client";
import dynamic from "next/dynamic";
import type { WitchAdminDetail } from "@/lib/witch-archetype-admin";
import { WITCH_TRAIT_LABELS } from "@/lib/witch-archetype";
const Report = dynamic(() => import("@/components/witch-archetype/WitchArchetypeReport").then(m => m.WitchResultView), { loading: () => <p>Loading report…</p> });
export function witchAdminDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
export default function WitchArchetypeDetail({ data }: { data: WitchAdminDetail }) {
  return <section aria-label="Customer report details" className="space-y-6">
    <header><h2 className="text-2xl font-semibold">{data.user.name || "Customer"}</h2><p className="text-white/70 break-all">{data.user.email || "No email recorded"}</p><p className="mt-1 text-xs text-white/50 break-all">Customer ID: {data.user.id}</p></header>
    <dl className="grid grid-cols-2 gap-4 rounded-xl border border-white/15 bg-white/5 p-5 text-sm">
      {[["Report", data.status], ["Access", data.access], ["Archetype", data.archetype || "—"], ["Saved at · IST", witchAdminDate(data.generatedAt)], ["Updated at · IST", witchAdminDate(data.updatedAt)], ["Scoring version", data.scoringVersion || "—"], ["Current template version", data.templateVersion || "—"]].map(([label, value]) => <div key={label}><dt className="text-white/50">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
    </dl>
    {data.warning && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">{data.warning}</p>}
    {data.status === "Not started" && <p className="text-white/70">No quiz has been saved for this customer yet.</p>}
    <section><h3 className="mb-3 text-lg font-semibold">Purchase history</h3><p className="mb-3 text-sm text-white/50">Checkout totals include any other items bought in the same transaction. Access above is the current entitlement; a payment attempt alone does not unlock the report.</p>
      {data.payments.length === 0 ? <p className="text-white/60">No Witch Archetype payment records found for this customer ID.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/50"><tr>{["Transaction", "Date · IST", "Items", "Status", "Checkout total"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.payments.map(p => <tr key={p.id} className="border-t border-white/10"><td className="p-3 break-all">{p.id}<p className="text-xs text-white/50">{p.type}</p></td><td className="p-3 whitespace-nowrap">{witchAdminDate(p.created_at)}</td><td className="p-3">{p.bundle_id || p.feature || "Witch Archetype"}</td><td className="p-3">{p.payment_status}</td><td className="p-3 whitespace-nowrap">{p.currency} {p.amount.toFixed(2)}</td></tr>)}</tbody></table></div>}
      {data.paymentsTruncated && <p className="text-amber-200">Showing the latest 100 matching transactions. Use Orders for older records.</p>}
    </section>
    {data.answers.length > 0 && <section><h3 className="mb-3 text-lg font-semibold">Saved quiz answers</h3><ol className="space-y-3">{data.answers.map((a, index) => <li key={a.id} className="rounded-xl border border-white/10 p-4"><p className="text-sm text-white/60">{index + 1}. {a.question}</p><p className={`mt-2 ${a.valid ? "text-white" : "text-amber-200"}`}>{a.answer}</p></li>)}</ol></section>}
    {data.result && <section><h3 className="mb-3 text-lg font-semibold">Saved scores</h3><div className="flex flex-wrap gap-2">{Object.entries(data.result.scores).map(([trait, score]) => <span key={trait} className="rounded-lg bg-white/5 px-3 py-2 text-sm">{WITCH_TRAIT_LABELS[trait as keyof typeof WITCH_TRAIT_LABELS]}: {score}</span>)}</div><p className="mt-3 text-sm text-white/60">{data.result.explanation}</p></section>}
    {data.result && data.template && <details className="rounded-xl border border-white/15 p-4"><summary className="cursor-pointer font-semibold">View full report</summary><p className="my-4 text-sm text-white/50">Saved result rendered with the current database template, as on the customer report page.</p><div className="mx-auto max-w-2xl"><Report result={data.result} template={data.template} /></div></details>}
  </section>;
}
