"use client";
import { soulmateItemName } from "@/lib/soulmate-product-names";
import { SoulmateInvoicesPanel } from "./invoices-panel";
import { useEffect, useState } from "react";
import type { SoulmateOrderView } from "@/lib/soulmate-order-view";
import type { SoulmateAssetKind } from "@/lib/soulmate-cart";
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "—";
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` });
const inputStyle = "rounded-lg border border-white/10 bg-[#0F1626] px-3 py-2 text-sm text-white";

function OrderDetails({ order, refresh }: { order: SoulmateOrderView; refresh: () => void }) {
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
  return <div className="mt-5 border-t border-white/10 pt-5 text-sm">
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[["Checkout environment",order.checkout_environment],["Email",order.customer_email],["Phone",order.customer_phone],["Paid at",date(order.paid_at)],["Scheduled email",date(order.scheduled_send_at)],["Customer delivery promise",order.entitlements?.promised_hours ? `Within ${order.entitlements.promised_hours} hours` : "Legacy order"],["Review",`${order.review_status}${order.reviewed_at ? ` · ${date(order.reviewed_at)}` : ""}`],["Email status",order.email?.status || "Awaiting payment"],["Submitted to email provider",date(order.email?.submitted_at || null)],["Provider send event",date(order.email?.sent_at || null)],["Delivered",date(order.email?.delivered_at || null)],["Schedule status",scheduleStatus],["Delivery type",order.entitlements?.delivery || order.plan],["Generation / preparation",order.catalog_version === 2 ? order.assets.some((asset) => asset.kind === "sketch") ? "Sketch uploaded" : "Awaiting manual preparation" : order.generation?.status || "Not started"],["PayU payment ID",order.payu_payment_id || "—"]].map(([label,value]) => <div key={label}><dt className="text-xs text-white/60">{label}</dt><dd className="mt-1 break-words text-white/85">{value}</dd></div>)}
    </dl>
    <SoulmateInvoicesPanel orderId={order.id} />
    <h3 className="mt-6 font-medium">Purchased items</h3>
    <ul className="mt-2 space-y-2 text-white/70">{order.line_items?.length ? order.line_items.map((item) => <li key={item.id}>{soulmateItemName(item)} · {money(item.amount_paise)}{item.includes.length > 1 && <span className="block text-xs text-white/60">Includes {item.includes.join(", ").replaceAll("_", " ")}</span>}</li>) : <li>{order.product_info} — legacy order; detailed extras were not recorded</li>}</ul>
    <p className="mt-3 text-white/50">Subtotal {money(order.base_amount)} + GST {money(order.gst_amount)} = {money(order.amount)}</p>
    <details className="mt-5"><summary className="cursor-pointer text-white/70">Buyer’s confirmed answers</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(order.answers).map(([key,value]) => <div key={key}><dt className="text-xs text-white/60">{key}</dt><dd>{value}</dd></div>)}</dl></details>
    {(order.generation?.last_error || order.email?.last_error) && <p className="mt-4 text-amber-300">{order.generation?.last_error} {order.email?.last_error}</p>}
    {order.catalog_version === 2 && <section className="mt-6 rounded-xl border border-white/10 bg-[#141C2E] p-4" aria-label="Prepare and review purchased deliverables">
      <h3 className="font-medium">Prepare & review</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/50">Upload the correct {order.entitlements.sketch === "colour" ? "colour" : "black-and-white"} sketch and every purchased report. Maximum 3 MiB per file and 7 MiB combined. Approved orders send at the scheduled time: 12 hours for priority/express and 48 hours for normal delivery. If approved after that time, the next worker run sends them.</p>
      {required.map((kind) => <div key={kind} className="mt-4 flex flex-wrap items-center gap-3"><span className="w-28 capitalize">{kind}</span><span className="text-xs text-white/50">{order.assets.some((asset) => asset.kind === kind) ? "Uploaded" : "Not uploaded"}</span>{canUpload && <input aria-label={`Upload ${kind}`} type="file" accept={kind === "sketch" ? "image/png,image/jpeg,image/webp" : "application/pdf"} disabled={busy} className="max-w-full text-xs" onChange={(event) => { void upload(kind,event.target.files?.[0]); event.target.value=""; }} />}</div>)}
      {order.assets.length > 0 && <button className={`${inputStyle} mt-4`} disabled={busy} onClick={() => void preview()}>Open uploaded files for review</button>}
      {links.map((link) => link.url && <a key={link.kind} className="mt-2 block text-primary underline" href={link.url} target="_blank" rel="noreferrer">View {link.kind} (link expires in 5 minutes)</a>)}
      {canUpload && <><label className="mt-4 block text-xs text-white/50">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className={`${inputStyle} mt-2 block w-full`} /></label><button className="mt-4 rounded bg-rose-700 px-4 py-2 disabled:opacity-40" disabled={busy || !complete} onClick={() => void approve()}>Approve complete order for scheduled delivery</button><p className="mt-2 text-xs text-white/60">Approval confirms you checked every file. The approved files cannot be replaced.</p></>}
      {order.review_note && <p className="mt-4 text-white/60">Review note: {order.review_note}</p>}
    </section>}
    {error && <p role="alert" className="mt-3 text-primary">{error}</p>}
  </div>;
}

export function SoulmateOrdersPanel() {
  const [mode,setMode]=useState("all"),[status,setStatus]=useState("all"),[search,setSearch]=useState(""),[query,setQuery]=useState("");
  const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[orders,setOrders]=useState<SoulmateOrderView[]>([]),[total,setTotal]=useState(0),[error,setError]=useState(""),[loading,setLoading]=useState(true),[open,setOpen]=useState<string|null>(null);
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setError("");
    fetch(`/api/admin/soulmate/orders?${new URLSearchParams({ mode,status,search:query,page:String(page) })}`,{headers:auth(),cache:"no-store",signal:abort.signal}).then(async(response)=>{const result=await response.json();if(!response.ok)throw new Error(result.error);if(!abort.signal.aborted){setOrders(result.orders);setTotal(result.total);}}).catch((cause)=>{if(!abort.signal.aborted)setError(cause.message||"Unable to load orders");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[mode,status,query,page,revision]);
  return <section className="py-8" aria-label="Soulmate orders and delivery">
    <p className="mb-4 text-sm text-white/50">All local, preview and production orders are available here, including test payments and unpaid checkouts. Only production traffic and verified live purchases count in analytics.</p>
    <form className="flex flex-wrap gap-3" onSubmit={(event)=>{event.preventDefault();setPage(0);setQuery(search);}}><input aria-label="Search orders by name, email, phone or order ID" className={inputStyle} placeholder="Name, email, phone or order ID" value={search} onChange={(event)=>setSearch(event.target.value)} /><button className={inputStyle}>Search</button>
      <select aria-label="Payment environment" className={inputStyle} value={mode} onChange={(event)=>{setMode(event.target.value);setPage(0);}}><option value="all">All payments (live + test)</option><option value="live">Live</option><option value="test">Test</option></select>
      <select aria-label="Payment status" className={inputStyle} value={status} onChange={(event)=>{setStatus(event.target.value);setPage(0);}}>{["all","paid","pending","created","failed"].map((value)=><option key={value} value={value}>{value === "all" ? "All statuses" : value}</option>)}</select><button type="button" className={inputStyle} onClick={()=>setRevision((value)=>value+1)}>Refresh</button>
    </form>
    <p className="mt-4 text-sm text-white/50">{loading ? "Loading orders…" : `${total} orders match these filters`}</p>
    {error && <p role="alert" className="mt-4 text-primary">{error}</p>}
    {!error && orders.map((order)=>{
      const late=order.payment_status==="paid" && order.scheduled_send_at && Date.parse(order.scheduled_send_at)<Date.now() && !["sent","delivered"].includes(order.email?.status||"");
      return <article key={order.id} className="mt-5 rounded-xl border border-white/10 bg-[#1A2235] p-5">
        <button className="w-full text-left" aria-expanded={open===order.id} onClick={()=>setOpen(open===order.id?null:order.id)}><div className="flex flex-wrap justify-between gap-3"><div><strong className="font-medium">{order.customer_name}</strong><span className="ml-3 rounded bg-white/10 px-2 py-1 text-xs">{order.checkout_environment} · {order.payment_mode} · {order.payment_status}</span><p className="mt-2 text-xs text-white/60">{order.id} · Created {date(order.created_at)}</p></div><div className="text-right"><p>{money(order.amount)} {order.payment_status==="paid"?"paid":"due"}</p><p className="mt-2 text-xs text-white/50">{order.plan === "express" ? "Complete Soulmate Vision" : "Soulmate Sketch"} · {order.entitlements?.sketch?.replaceAll("_"," ") || "Legacy"}</p></div></div><p className="mt-3 text-xs text-primary">{open===order.id?"Hide details":"View order, answers & delivery"}</p></button>
        {late && <p className="mt-3 text-sm text-amber-300">Past the scheduled send time — {order.review_status==="approved"?"check delivery status":"prepare and approve the purchased files"}.</p>}
        {open===order.id && <OrderDetails order={order} refresh={()=>setRevision((value)=>value+1)} />}
      </article>;
    })}
    {!loading && !error && !orders.length && <p className="mt-8 text-white/50">No orders match these filters.</p>}
    <div className="mt-6 flex items-center gap-4"><button className={inputStyle} disabled={page===0||loading} onClick={()=>setPage((value)=>value-1)}>Previous</button><span className="text-sm text-white/50">Page {page+1}</span><button className={inputStyle} disabled={(page+1)*25>=total||loading} onClick={()=>setPage((value)=>value+1)}>Next</button></div>
  </section>;
}
