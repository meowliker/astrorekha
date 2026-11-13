"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AcquisitionFunnel } from "@/lib/admin-acquisition";
export type AdSource = "all" | "meta" | "google";
const SourceContext = createContext<AdSource>("all");
export const useAdSource = () => useContext(SourceContext);
export const sourceUrl = (url: string, source: AdSource) => (() => { const parsed = new URL(url, "https://astrorekha.com"); parsed.searchParams.set("adSource", source); return `${parsed.pathname}${parsed.search}${parsed.hash}`; })();
/** Keep each report mounted: changing source must preserve its dates, columns and controls. */
export default function AcquisitionView({ children, standalone = false }: { funnel?: AcquisitionFunnel; children: ReactNode; title?: string; standalone?: boolean }) {
  const [source, setSource] = useState<AdSource>("all");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let selected = new URLSearchParams(window.location.search).get("adSource");
    try { selected ||= sessionStorage.getItem("admin-report-source"); } catch { /* Storage can be disabled. */ }
    if (selected === "meta" || selected === "google") setSource(selected);
    setReady(true);
  }, []);
  function choose(next: AdSource) {
    setSource(next);
    try { sessionStorage.setItem("admin-report-source", next); } catch { /* URL still preserves selection. */ }
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("adSource"); else url.searchParams.set("adSource", next);
    window.history.replaceState(window.history.state, "", url);
  }
  return <SourceContext.Provider value={source}><div className={standalone ? "min-h-screen bg-[#0A0E1A] text-slate-100" : "text-slate-100"}>
    <div className={standalone ? "mx-auto max-w-[1800px] px-4 pt-4 lg:px-8" : "py-3"}>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Ad source"><span className="mr-2 text-sm text-slate-400">Ad source</span>
        {([["all", "All sources"], ["meta", "Meta Ads"], ["google", "Google Ads"]] as const).map(([key, label]) => <button key={key} type="button" title={key === "all" ? "Meta, Google, direct and other/unattributed sources" : undefined} aria-pressed={source === key} onClick={() => choose(key)} className={`rounded-lg border px-4 py-2 text-sm ${source === key ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>{label}</button>)}
      </div>
      <p className="mt-2 text-xs text-slate-400">Untagged landing pages follow your mapping: Discover → Google Ads; normal funnel entry pages → Meta Ads. Saved source tags take priority.</p>
      {source === "all" && <p className="mt-2 text-xs text-slate-400">All sources includes direct and other traffic. Ad spend is from connected Meta accounts only; combined profit and ROAS exclude Google Ads spend.</p>}
      {source === "google" && <p className="mt-2 text-xs text-slate-400">Google Ads spend is not connected. Spend-dependent figures show —.</p>}
    </div>
    {ready ? children : <p className="p-4 text-sm text-slate-400">Loading report…</p>}
  </div></SourceContext.Provider>;
}
