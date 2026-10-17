"use client";

import { useEffect, useMemo, useState } from "react";
import { SoulmateInvoicesPanel } from "./invoices-panel";
import { soulmateItemName } from "@/lib/us-soulmate-product-names";
import type { SoulmateOrderView } from "@/lib/us-soulmate-order-view";
import type { SoulmateAssetKind } from "@/lib/us-soulmate-cart";
import { choices, steps, type Step } from "@/app/us/soulmate/chat-data";

const money = (paise: number) => `$${(paise / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-US", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "—";
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` });
const inputStyle = "rounded-lg border border-white/10 bg-[#0F1626] px-3 py-2 text-sm text-white";

export function SoulmateOrderDetails({ order, refresh }: { order: SoulmateOrderView; refresh: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  const [links, setLinks] = useState<{ kind: string; filename: string; url: string | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Record<string,string>>({ ...order.answers });
  useEffect(() => { if (!editing) setAnswers({ ...order.answers }); }, [order.answers, editing]);
  const required = order.entitlements?.required_assets || [];
  const complete = required.length > 0 && required.every((kind) => order.assets.some((asset) => asset.kind === kind));
  const sentAt = order.email?.sent_at;
  const scheduledDelivery = order.email?.scheduled_at || order.scheduled_send_at;
  const scheduleStatus = sentAt && scheduledDelivery
    ? Date.parse(sentAt) <= Date.parse(scheduledDelivery) + 60000 ? "Sent on schedule (within one worker interval)" : "Sent late"
    : order.email?.status === "delivered" ? "Delivered; provider send timestamp unavailable" : "Awaiting confirmed send event";
  const canUpload = order.catalog_version === 2 && order.payment_status === "paid" && order.review_status === "pending";
  const generated = order.assets.length > 0 || order.generation?.status === "ready";
  const generating = ["generating", "submitting"].includes(order.generation?.status || "");
  const answerChanges = useMemo(() => steps.some((step) => (answers[step] || "") !== (order.answers[step] || "")), [answers, order.answers]);
  const answerEditingLocked = Boolean(order.delivered_at || ["submitting", "scheduled", "sent", "delivered"].includes(order.email?.status || ""));

  async function upload(kind: SoulmateAssetKind, file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(); body.set("kind", kind); body.set("file", file);
      const response = await fetch(`/api/admin/us-soulmate/orders/${order.id}/assets`, { method: "POST", headers: auth(), body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setLinks([]); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); } finally { setBusy(false); }
  }

  async function preview() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/us-soulmate/orders/${order.id}/assets`, { headers: auth(), cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setLinks(result.assets);
    } catch { setError("Unable to open files"); } finally { setBusy(false); }
  }

  async function approve() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/us-soulmate/orders/${order.id}/approve`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed"); } finally { setBusy(false); }
  }

  async function saveAnswers() {
    if (!answerChanges) { setEditing(false); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/us-soulmate/orders/${order.id}`, { method: "PATCH", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save answers");
      setEditing(false); setLinks([]); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save answers"); } finally { setBusy(false); }
  }

  const orderSummary = <div className="mt-5 border-t border-white/10 pt-5">
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[["Customer name",order.customer_name || "—"],["Email",order.customer_email || "—"],["Phone",order.customer_phone || "—"],["Order reference",order.id],["Ordered at",date(order.created_at)],["Checkout environment",order.checkout_environment],["Paid at",date(order.paid_at)],["Scheduled delivery",date(scheduledDelivery)],["Customer promise",order.entitlements?.promised_hours ? `Within ${order.entitlements.promised_hours} hours` : "Legacy order"],["Generation / preparation",order.catalog_version === 2 ? complete ? order.review_note?.startsWith("Automatic checks passed:") ? "Prepared; local checks passed" : "Deliverables uploaded" : order.generation?.status === "needs_review" ? "Paused; needs attention" : generating ? "Automatically preparing purchased reports" : "Queued for automatic preparation" : order.generation?.status || "Not started"],["Delivery email",order.email?.status || "Awaiting payment"],["Schedule status",scheduleStatus],["Stripe payment ID",order.stripe_payment_id || "—"]].map(([label,value]) => <div key={label}><dt className="text-xs text-white/40">{label}</dt><dd className="mt-1 break-words text-sm text-white/75">{value}</dd></div>)}
    </dl>
    <div className="mt-5 border-t border-white/10 pt-4">
      <h4 className="text-sm font-medium text-white/80">Price breakdown</h4>
      <ul className="mt-2 divide-y divide-white/[0.07] text-sm text-white/65">{order.line_items?.length ? order.line_items.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><span>{soulmateItemName(item)}{item.includes.length > 1 && <span className="mt-1 block text-xs text-white/40">Includes {item.includes.join(", ").replaceAll("_", " ")}</span>}</span><span className="text-white/85">{money(item.amount_paise)}</span></li>) : <li className="py-3">{order.product_info} — legacy order; detailed extras were not recorded</li>}</ul>
      <p className="mt-3 text-right text-white/50">Subtotal {money(order.base_amount)} = <strong className="text-white/85">{money(order.amount)}</strong></p>
    </div>
  </div>;

  return <div className="text-sm">
    <SoulmateInvoicesPanel orderId={order.id} summary={orderSummary} />

    <section className="border-t border-white/10 py-7" aria-labelledby="answers-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="answers-title" className="font-medium">Buyer&apos;s confirmed answers</h2><p className="mt-1 text-xs text-white/45">Revision {order.answer_revision || 1}{order.answers_updated_at ? ` · updated ${date(order.answers_updated_at)}` : ""}</p></div>
        {!editing && <button type="button" disabled={answerEditingLocked} onClick={()=>setEditing(true)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/75 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Edit answers</button>}
      </div>
      {answerEditingLocked && <p className="mt-3 text-xs text-amber-200/80">Answers are locked because delivery has already started.</p>}
      {editing && order.catalog_version === 2 && <p className="mt-3 text-xs text-white/50">Automatic report generation is awaiting setup. Save revised answers here, then prepare and upload replacement files below.</p>}
      {editing ? <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {steps.map((step) => <AnswerField key={step} step={step} value={answers[step] || ""} onChange={(value)=>setAnswers((current)=>({ ...current, [step]: value }))} />)}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="button" disabled={busy || !answerChanges} onClick={()=>void saveAnswers()} className="rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-40">{generated ? "Regenerate reports with these answers" : generating ? "Restart generation with these answers" : "Save answers for generation"}</button>
          <button type="button" disabled={busy} onClick={()=>{setAnswers({ ...order.answers });setEditing(false);}} className="rounded-lg border border-white/15 px-4 py-2.5 text-white/70">Cancel</button>
          {answerChanges && <p className="w-full text-xs leading-relaxed text-amber-200/75">Saving creates an audited revision, removes deliverables made from the previous answers, and returns the order to preparation and review.</p>}
        </div>
      </div> : <dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(order.answers).map(([key,value]) => <div key={key}><dt className="text-xs capitalize text-white/45">{key.replaceAll("_", " ")}</dt><dd className="mt-1 text-white/80">{value}</dd></div>)}</dl>}
    </section>

    {(order.generation?.last_error || order.email?.last_error) && <p className="border-l-2 border-amber-400 bg-amber-400/10 px-4 py-3 text-amber-200">{order.generation?.last_error} {order.email?.last_error}</p>}

    {order.catalog_version === 2 && <section className="mt-7 border-t border-white/10 pt-7" aria-label="Prepare and review purchased deliverables">
      <h2 className="font-medium">Prepare & review</h2>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-white/50">Upload the correct {order.entitlements.sketch === "colour" ? "colour" : "black-and-white"} sketch and every purchased report. Maximum 3 MiB per file and 7 MiB combined. Approved orders send at the scheduled time: 12 hours for priority/express and 48 hours for normal delivery. If approved after that time, the next worker run sends them.</p>
      <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {required.map((kind) => <div key={kind} className="flex flex-wrap items-center gap-3 py-4"><span className="w-28 capitalize">{kind}</span><span className="min-w-24 text-xs text-white/45">{order.assets.some((asset) => asset.kind === kind) ? "Uploaded" : "Not uploaded"}</span>{canUpload && <input aria-label={`Upload ${kind}`} type="file" accept={kind === "sketch" ? "application/pdf,image/png,image/jpeg,image/webp" : "application/pdf"} disabled={busy} className="max-w-full text-xs" onChange={(event) => { void upload(kind,event.target.files?.[0]); event.target.value=""; }} />}</div>)}
      </div>
      {order.assets.length > 0 && <button className={`${inputStyle} mt-4`} disabled={busy} onClick={() => void preview()}>Open uploaded files for review</button>}
      {links.map((link) => link.url && <a key={link.kind} className="mt-2 block text-primary underline" href={link.url} target="_blank" rel="noreferrer">View {link.kind} (link expires in 5 minutes)</a>)}
      {canUpload && <><label className="mt-5 block text-xs text-white/50">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className={`${inputStyle} mt-2 block min-h-24 w-full`} /></label><button className="mt-4 rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-40" disabled={busy || !complete} onClick={() => void approve()}>Approve complete order for scheduled delivery</button><p className="mt-2 text-xs text-white/50">Approval confirms you checked every file. The approved files cannot be replaced.</p></>}
      {order.review_note && <p className="mt-4 text-white/60">Review note: {order.review_note}</p>}
    </section>}
    {error && <p role="alert" className="mt-4 text-primary">{error}</p>}
  </div>;
}

function AnswerField({ step, value, onChange }: { step: Step; value: string; onChange: (value: string) => void }) {
  const label: Record<Step,string> = { name: "Name", heart: "Heart right now", preferenceSelection: "Initial preference", preference: "Confirmed preference", feeling: "Desired connection", birthDate: "Birth date", ethnicity: "Indian background" };
  const options = choices[step as keyof typeof choices] as readonly string[] | undefined;
  return <label className="text-xs text-white/50">{label[step]}
    {options ? <select value={value} onChange={(event)=>onChange(event.target.value)} className={`${inputStyle} mt-2 w-full normal-case`}><option value="" disabled>Choose an answer</option>{options.map((option)=><option key={option} value={option}>{option}</option>)}</select>
      : <input type={step === "birthDate" ? "date" : "text"} maxLength={step === "name" ? 40 : 200} value={value} onChange={(event)=>onChange(event.target.value)} className={`${inputStyle} mt-2 w-full normal-case`} />}
  </label>;
}
