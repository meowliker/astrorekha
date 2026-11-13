"use client";
import Link from "next/link";
import {useAdminAccess} from "@/components/admin/AdminAccessGate";
import {canAccess, WORKSPACES} from "@/lib/admin-workspaces";
const views = {astrorekha: ["revenue", "orders", "tracking"], "us-main": ["revenue", "orders", "tracking"], soulmate: ["profit", "orders", "tracking", "analytics"], "us-soulmate": ["profit", "orders", "tracking", "analytics"]} as const;
const names: Record<string, string> = {revenue: "Revenue & Profit Sheet", profit: "Profit Sheet", orders: "Orders", tracking: "Google Ads Tracking", analytics: "Analytics"};
export default function GoogleWorkspace() {
 const access = useAdminAccess();
 return <main className="min-h-screen bg-[#0A0E1A] px-6 py-10 text-white"><div className="mx-auto max-w-6xl">
  <Link href="/admin" className="text-sm text-slate-400 hover:text-white">← All workspaces</Link>
  <h1 className="mt-6 text-3xl font-semibold">Google Ads workspace</h1>
  <p className="mt-2 text-slate-400">Google campaigns, sales and profit by funnel.</p>
  <div className="mt-8 grid gap-6 md:grid-cols-2">{Object.entries(views).filter(([key]) => access && canAccess(access, key as keyof typeof views)).map(([key, links]) => <section key={key} className="rounded-2xl border border-white/10 bg-[#1A2235] p-6"><h2 className="text-xl font-semibold">{WORKSPACES[key as keyof typeof views]}</h2><nav className="mt-4 flex flex-wrap gap-3">{links.map(view => <Link key={view} href={`/admin/google/${key}/${view}`} className="rounded-lg border border-white/15 px-4 py-3 text-sm hover:border-cyan-400/50 hover:text-cyan-300">{names[view]}</Link>)}</nav></section>)}</div>
 </div></main>;
}
