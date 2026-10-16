"use client";

import { useState } from "react";
import { SoulmateInvoicesPanel } from "./invoices-panel";
import { soulmateItemName } from "@/lib/soulmate-product-names";
import type { SoulmateOrderView } from "@/lib/soulmate-order-view";
import type { SoulmateAssetKind } from "@/lib/soulmate-cart";

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "—";
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` });
const inputStyle = "rounded-lg border border-white/10 bg-[#0F1626] px-3 py-2 text-sm text-white";

export function SoulmateOrderDetails({ order, refresh }: { order: SoulmateOrderView; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const [links, setLinks] = useState<{ kind: string; filename: string; url: string | null }[]>([]);
  const required = order.entitlements?.required_assets || [];
  const complete = required.length > 0 && required.every((kind) => order.assets.some((asset) => asset.kind === kind));
  const sentAt = order.email?.sent_at;
  const scheduleStatus = sentAt && order.scheduled_send_at
    ? Date.parse(sentAt) <= Date.parse(order.scheduled_send_at) + 60000 ? "Sent on schedule (within one worker interval)" : "Sent late"
    : order.email?.status === "delivered" ? "Delivered; provider send timestamp unavailable" : "Awaiting confirmed send event";
  const canUpload = order.catalog_version === 2 && order.payment_status === "paid" && order.review_status === "pending";

  async function upload(kind: SoulmateAssetKind, file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("kind", kind); body.set("file", file);
      const response = await fetch(`/api/admin/soulmate/orders/${order.id}/assets`, { method: "POST", headers: auth(), body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setLinks([]); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); } finally { setBusy(false); }
  }

  async function preview() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/soulmate/orders/${order.id}/assets`, { headers: auth(), cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setLinks(result.assets);
    } catch { setError("Unable to open files"); } finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/soulmate/orders/${order.id}/approve`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed"); } finally { setBusy(false); }
  }

  return <div className="text-sm">
    <dl className="grid gap-5 border-b border-white/10 pb-7 sm:grid-cols-2 lg:grid-cols-3">
      {[["Checkout environment",order.checkout_environment],["Email",order.customer_email],["Phone",order.customer_phone],["Paid at",date(order.paid_at)],["Scheduled email",date(order.scheduled_send_at)],["Customer delivery promise",order.entitlements?.promised_hours ? `Within ${order.entitlements.promised_hours} hours` : "Legacy order"],["Review",`${order.review_status}${order.reviewed_at ? ` · ${date(order.reviewed_at)}` : ""}`],["Email status",order.email?.status || "Awaiting payment"],["Submitted to email provider",date(order.email?.submitted_at || null)],["Provider send event",date(order.email?.sent_at || null)],["Delivered",date(order.email?.delivered_at || null)],["Schedule status",scheduleStatus],["Delivery type",order.entitlements?.delivery || order.plan],["Generation / preparation",order.catalog_version === 2 ? order.assets.some((asset) => asset.kind === "sketch") ? "Sketch uploaded" : "Awaiting manual preparation" : order.generation?.status || "Not started"],["PayU payment ID",order.payu_payment_id || "—"]].map(([label,value]) => <div key={label}><dt className="text-xs text-white/45">{label}</dt><dd className="mt-1.5 break-words text-white/85">{value}</dd></div>)}
    </dl>

    <SoulmateInvoicesPanel orderId={order.id} />

    <section className="border-t border-white/10 py-7">
      <h2 className="font-medium">Purchased items</h2>
      <ul className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07] text-white/70">{order.line_items?.length ? order.line_items.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><span>{soulmateItemName(item)}{item.includes.length > 1 && <span className="mt-1 block text-xs text-white/40">Includes {item.includes.join(", ").replaceAll("_", " ")}</span>}</span><span className="text-white/85">{money(item.amount_paise)}</span></li>) : <li className="py-3">{order.product_info} — legacy order; detailed extras were not recorded</li>}</ul>
      <p className="mt-3 text-right text-white/50">Subtotal {money(order.base_amount)} + GST {money(order.gst_amount)} = <strong className="text-white/85">{money(order.amount)}</strong></p>
    </section>

    <details className="border-t border-white/10 py-6"><summary className="cursor-pointer font-medium text-white/75">Buyer&apos;s confirmed answers</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(order.answers).map(([key,value]) => <div key={key}><dt className="text-xs capitalize text-white/45">{key.replaceAll("_", " ")}</dt><dd className="mt-1 text-white/80">{value}</dd></div>)}</dl></details>

    {(order.generation?.last_error || order.email?.last_error) && <p className="border-l-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-amber-200">{order.generation?.last_error} {order.email?.last_error}</p>}

    {order.catalog_version === 2 && <section className="mt-7 border-t border-white/10 pt-7" aria-label="Prepare and review purchased deliverables">
      <h2 className="font-medium">Prepare & review</h2>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-white/50">Upload the correct {order.entitlements.sketch === "colour" ? "colour" : "black-and-white"} sketch and every purchased report. Maximum 3 MiB per file and 7 MiB combined. Approved orders send at the scheduled time: 12 hours for priority/express and 48 hours for normal delivery. If approved after that time, the next worker run sends them.</p>
      <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {required.map((kind) => <div key={kind} className="flex flex-wrap items-center gap-3 py-4"><span className="w-28 capitalize">{kind}</span><span className="min-w-24 text-xs text-white/45">{order.assets.some((asset) => asset.kind === kind) ? "Uploaded" : "Not uploaded"}</span>{canUpload && <input aria-label={`Upload ${kind}`} type="file" accept={kind === "sketch" ? "image/png,image/jpeg,image/webp" : "application/pdf"} disabled={busy} className="max-w-full text-xs" onChange={(event) => { void upload(kind,event.target.files?.[0]); event.target.value=""; }} />}</div>)}
      </div>
      {order.assets.length > 0 && <button className={`${inputStyle} mt-4`} disabled={busy} onClick={() => void preview()}>Open uploaded files for review</button>}
      {links.map((link) => link.url && <a key={link.kind} className="mt-2 block text-primary underline" href={link.url} target="_blank" rel="noreferrer">View {link.kind} (link expires in 5 minutes)</a>)}
      {canUpload && <><label className="mt-5 block text-xs text-white/50">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className={`${inputStyle} mt-2 block min-h-24 w-full`} /></label><button className="mt-4 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-40" disabled={busy || !complete} onClick={() => void approve()}>Approve complete order for scheduled delivery</button><p className="mt-2 text-xs text-white/50">Approval confirms you checked every file. The approved files cannot be replaced.</p></>}
      {order.review_note && <p className="mt-4 text-white/60">Review note: {order.review_note}</p>}
    </section>}
    {error && <p role="alert" className="mt-4 text-primary">{error}</p>}
  </div>;
}
