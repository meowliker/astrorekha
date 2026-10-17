"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, PackageOpen, RefreshCw, Search, X } from "lucide-react";
import type { SoulmateOrderView } from "@/lib/us-soulmate-order-view";
import { soulmateOrderStage, type SoulmateOrderStage } from "@/lib/us-soulmate-order-status";

const money = (paise: number) => `$${(paise / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-US", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}` });
const controlStyle = "h-9 rounded-lg border border-white/10 bg-[#0F1626] px-3 text-sm text-white outline-none transition-colors focus:border-primary/50";
const stageStyle: Record<SoulmateOrderStage, string> = {
  ordered: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  generated: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  scheduled: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  delivered: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  failed: "border-red-400/25 bg-red-400/10 text-red-300",
};

export function SoulmateOrdersPanel() {
  const router = useRouter();
  const [mode,setMode]=useState("all"),[search,setSearch]=useState(""),[query,setQuery]=useState("");
  const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[orders,setOrders]=useState<SoulmateOrderView[]>([]),[total,setTotal]=useState(0),[error,setError]=useState(""),[loading,setLoading]=useState(true);

  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setError("");
    fetch(`/api/admin/us-soulmate/orders?${new URLSearchParams({ mode,search:query,page:String(page) })}`,{headers:auth(),cache:"no-store",signal:abort.signal}).then(async(response)=>{const result=await response.json();if(!response.ok)throw new Error(result.error);if(!abort.signal.aborted){setOrders(result.orders);setTotal(result.total);setError(result.deliverySyncWarning || "");}}).catch((cause)=>{if(!abort.signal.aborted)setError(cause.message||"Unable to load orders");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[mode,query,page,revision]);

  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") setRevision((value) => value + 1); }, 60000); return () => clearInterval(timer); }, []);

  const rangeStart = total === 0 ? 0 : page * 25 + 1;
  const rangeEnd = Math.min((page + 1) * 25, total);

  return <section className="py-6" aria-label="Soulmate orders and delivery">
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141C2E]">
      <form className="flex flex-col gap-3 border-b border-white/10 p-3 lg:flex-row lg:items-center" onSubmit={(event)=>{event.preventDefault();setPage(0);setQuery(search.trim());}}>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          <input aria-label="Search Soulmate orders" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" placeholder="Search name, email, phone or order ID" value={search} onChange={(event)=>setSearch(event.target.value)} />
          {search && <button type="button" aria-label="Clear search" className="text-white/40 transition-colors hover:text-white" onClick={()=>{setSearch("");setQuery("");setPage(0);}}><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Payment environment" className={controlStyle} value={mode} onChange={(event)=>{setMode(event.target.value);setPage(0);}}><option value="all">All environments</option><option value="live">Live payments</option><option value="test">Test payments</option></select>
          <button type="submit" className={`${controlStyle} hover:bg-white/5`}>Search</button>
          <button type="button" aria-label="Refresh orders" className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white/65 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50" disabled={loading} onClick={()=>setRevision((value)=>value+1)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </form>

      {error && <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <caption className="sr-only">Soulmate orders. Select an order to open its full details.</caption>
          <thead className="bg-white/[0.03] text-xs text-white/50"><tr className="border-b border-white/10">
            <th className="px-4 py-3 text-left font-medium">Order</th>
            <th className="px-4 py-3 text-left font-medium">Customer</th>
            <th className="px-4 py-3 text-left font-medium">Ordered</th>
            <th className="px-4 py-3 text-left font-medium">Product</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="w-12 px-4 py-3"><span className="sr-only">Open</span></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-white/50"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />Loading Soulmate orders…</td></tr>
              : orders.length === 0 ? <tr><td colSpan={7} className="px-4 py-14 text-center text-white/45"><PackageOpen className="mx-auto mb-3 h-7 w-7 text-white/25" />No orders match these filters.</td></tr>
              : orders.map((order)=>{
                const stage=soulmateOrderStage(order);
                const itemCount=order.line_items?.length||1;
                return <tr key={order.id} role="link" tabIndex={0} onClick={()=>router.push(`/admin/us-soulmate/orders/${order.id}`)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();router.push(`/admin/us-soulmate/orders/${order.id}`);}}} className="group cursor-pointer border-b border-white/[0.07] transition-colors hover:bg-white/[0.035] focus:outline-none focus-visible:bg-white/[0.05]">
                  <td className="max-w-[220px] px-4 py-3"><p className="truncate font-medium text-white/85">{order.id}</p><p className="mt-1 truncate text-xs text-white/35">{order.checkout_environment} · {order.payment_mode}</p></td>
                  <td className="max-w-[230px] px-4 py-3"><p className="truncate text-white/80">{order.customer_name}</p><p className="mt-1 truncate text-xs text-white/40">{order.customer_email}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/65">{date(order.paid_at || order.created_at)}</td>
                  <td className="max-w-[260px] px-4 py-3"><p className="truncate text-white/75">{order.plan === "express" ? "Complete Soulmate Vision" : "Soulmate Sketch"}</p><p className="mt-1 truncate text-xs text-white/35">{itemCount} {itemCount === 1 ? "item" : "items"} · {order.entitlements?.delivery || order.plan}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-white">{money(order.amount)}</td>
                  <td className="max-w-[245px] px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${stageStyle[stage.id]}`}>{stage.label}</span><p className="mt-1.5 truncate text-xs text-white/40">{stage.detail}{stage.timestamp ? ` · ${date(stage.timestamp)}` : ""}</p></td>
                  <td className="px-4 py-3 text-right"><ChevronRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/65" aria-hidden="true" /></td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-white/50">
        <span>{rangeStart}-{rangeEnd} of {total}</span>
        <div className="flex items-center gap-2"><button type="button" aria-label="Previous page" className="grid h-8 w-8 place-items-center rounded-md border border-white/10 transition-colors hover:bg-white/10 disabled:opacity-30" disabled={page===0||loading} onClick={()=>setPage((value)=>value-1)}><ChevronLeft className="h-4 w-4" /></button><span className="px-2">Page {page+1}</span><button type="button" aria-label="Next page" className="grid h-8 w-8 place-items-center rounded-md border border-white/10 transition-colors hover:bg-white/10 disabled:opacity-30" disabled={(page+1)*25>=total||loading} onClick={()=>setPage((value)=>value+1)}><ChevronRight className="h-4 w-4" /></button></div>
      </div>
    </div>
    <p className="mt-3 text-xs text-white/35">Only paid orders are shown. Status tracks preparation and delivery, including any fulfilment failures.</p>
  </section>;
}
