"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import type { SoulmateOrderView } from "@/lib/us-soulmate-order-view";
import { soulmateOrderStage, type SoulmateOrderStage } from "@/lib/us-soulmate-order-status";
import { SoulmateOrderDetails } from "../../order-details";

const stageStyle: Record<SoulmateOrderStage, string> = {
  ordered: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  generated: "border-violet-400/25 bg-violet-400/10 text-violet-300",
  scheduled: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  delivered: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  failed: "border-red-400/25 bg-red-400/10 text-red-300",
};

export default function SoulmateOrderPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router=useRouter();
  const [order,setOrder]=useState<SoulmateOrderView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");

  const load=useCallback(async()=>{
    let token="";
    try {
      token=localStorage.getItem("admin_session_token")||"";
      const expires=Date.parse(localStorage.getItem("admin_session_expiry")||"");
      if(!token||!Number.isFinite(expires)||expires<=Date.now()){router.replace("/admin/login");return;}
    } catch { router.replace("/admin/login"); return; }
    setLoading(true);setError("");
    try {
      const response=await fetch(`/api/admin/us-soulmate/orders/${params.id}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
      const result=await response.json();
      if(response.status===401){router.replace("/admin/login");return;}
      if(!response.ok)throw new Error(result.error||"Unable to load order");
      setOrder(result.order);setError(result.deliverySyncWarning || "");
    } catch(cause){setError(cause instanceof Error?cause.message:"Unable to load order");} finally {setLoading(false);}
  },[params.id,router]);

  useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},60000);return()=>clearInterval(timer);},[load]);
  const stage=order?soulmateOrderStage(order):null;

  return <main className="min-h-screen bg-[#0A0E1A] text-white [color-scheme:dark]">
    <header className="border-b border-white/10 bg-[#111827]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin/us-soulmate/orders" aria-label="Back to Soulmate orders" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0"><h1 className="truncate text-xl font-semibold">{order?.customer_name || "Soulmate order"}</h1><p className="truncate text-xs text-white/45">{params.id}</p></div>
          {stage && <span className={`hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${stageStyle[stage.id]}`}>{stage.label}</span>}
        </div>
        <button type="button" disabled={loading} onClick={()=>void load()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-50" aria-label="Refresh order"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`} /></button>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-6">
      {loading && !order && <div className="py-24 text-center text-white/50"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />Loading order…</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-red-200">{error}<button type="button" className="ml-4 underline" onClick={()=>void load()}>Try again</button></div>}
      {order && <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141C2E]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5">
          <div><h2 className="text-lg font-medium">{order.plan==="express"?"Complete Soulmate Vision":"Soulmate Sketch"}</h2><p className="mt-1 text-sm text-white/50">Everything purchased, prepared and scheduled for this customer.</p></div>
          {stage && <div className="text-right"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${stageStyle[stage.id]}`}>{stage.label}</span><p className="mt-2 text-xs text-white/40">{stage.detail}</p></div>}
        </div>
        <div className="p-5"><SoulmateOrderDetails order={order} refresh={()=>void load()} /></div>
      </div>}
    </div>
  </main>;
}
