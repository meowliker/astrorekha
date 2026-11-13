"use client";
import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { AcquisitionFunnel } from "@/lib/admin-acquisition";
import { reportSource, reportWorkspaceUrl } from "@/lib/admin-report-workspace";
export type AdSource = "all" | "meta" | "google";
const SourceContext = createContext<AdSource>("meta");
export const useAdSource = () => useContext(SourceContext);
export const workspaceUrl = reportWorkspaceUrl;
export const sourceUrl = (url: string, source: AdSource) => {
  const parsed = new URL(reportWorkspaceUrl(url, source), "https://astrorekha.com");
  if (parsed.pathname.startsWith("/api/")) parsed.searchParams.set("adSource", source);
  else parsed.searchParams.delete("adSource");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
export default function AcquisitionView({ children, standalone = false }: { funnel?: AcquisitionFunnel; children: ReactNode; title?: string; standalone?: boolean }) {
  const source = reportSource(usePathname());
  return <SourceContext.Provider value={source}><div className={standalone ? "min-h-screen bg-[#0A0E1A] text-slate-100" : "text-slate-100"}>
    {source === "google" && <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-4 pt-4 text-sm lg:px-8"><Link href="/admin/google" className="font-semibold text-cyan-300">Google Ads workspace</Link><Link href="/admin" className="text-slate-400 hover:text-white">All workspaces</Link></div>}
    {children}
  </div></SourceContext.Provider>;
}
