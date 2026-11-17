"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, Star } from "lucide-react";
import type { WesternChart } from "@/lib/western-zodiac";
import ReportCTA from "@/components/ReportCTA";
import ReportInfoButton from "@/components/ReportInfoButton";
import WesternChartDiagram from "./WesternChartDiagram";

function displayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(parsed);
}

function displayTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function WesternBirthChartContent({ data }: { data: WesternChart }) {
  return <>
    <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 space-y-2">
      {[
        ["Birth Date:", displayDate(data.birthDetails.date)],
        ["Birth Time:", data.knowsBirthTime ? displayTime(data.birthDetails.time) : "Unknown"],
        ["Birth Place:", data.birthDetails.place],
      ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 text-sm">
        <span className="text-white/60 shrink-0">{label}</span><span className="text-white text-right break-words min-w-0">{value}</span>
      </div>)}
    </div>
    {data.knowsBirthTime ? <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
      <div className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center"><WesternChartDiagram data={data} /></div>
      <p className="text-white/60 text-xs mt-3">Western zodiac · Tropical · Placidus houses</p>
      <p className="text-white/50 text-xs mt-1">H1–H12: houses · Asc: Ascendant · ℞: retrograde</p>
    </div> : <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 text-white/60 text-sm">
      Birth time is needed for your Moon sign, Ascendant and house chart. Planet positions below use a noon estimate.
    </div>}
    <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
      <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><Star className="w-5 h-5 text-yellow-400" />Your Zodiac Signs</h2>
      <div className="space-y-3">{[["Sun Sign",data.sun_sign],["Moon Sign",data.moon_sign],["Ascendant",data.ascendant]].map(([label,value])=><div key={label} className="bg-white/5 rounded-xl p-3">
        <p className="text-white/60 text-xs">{label}</p><p className="text-white font-medium">{value || "Birth time needed"}</p>
      </div>)}</div>
    </div>
    <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
      <h2 className="text-white font-semibold mb-3">Planetary Positions</h2>
      <table className="w-full text-sm"><thead><tr className="text-left text-white/60"><th className="py-3">Planet</th><th>Sign</th>{data.knowsBirthTime && <th>House</th>}</tr></thead>
        <tbody>{Object.entries(data.planets).map(([name,planet])=><tr key={name} className="border-t border-white/10"><td className="py-3">{name}{planet.retrograde ? " ℞" : ""}</td><td>{planet.sign}</td>{data.knowsBirthTime && <td>{planet.house ?? "—"}</td>}</tr>)}</tbody>
      </table>
    </div>
    <ReportCTA western />
  </>;
}

export function WesternBirthChartView({ data, loading, error, retry }: {
  data: WesternChart | null; loading: boolean; error: string; retry: () => void;
}) {
  const router = useRouter();
  return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
    <main className="w-full max-w-md h-dvh bg-[#0A0E1A] text-white overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
      <header className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-4 px-4 py-3">
          <button type="button" aria-label="Back to reports" onClick={()=>router.push("/reports")} className="w-10 h-10 flex items-center justify-center"><ArrowLeft className="w-5 h-5 text-white" /></button>
          <h1 className="text-white text-xl font-semibold flex-1 text-center">Your Birth Chart</h1>
          <ReportInfoButton report="birthChart" />
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto"><div className="px-4 py-6 space-y-4">
        {loading && <div role="status" className="flex flex-col items-center justify-center py-20"><Loader2 className="w-12 h-12 text-primary animate-spin mb-4" /><p className="text-white/60">Calculating your birth chart…</p></div>}
        {!loading && error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center"><AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" /><p className="text-red-400 mb-4">{error}</p><button onClick={retry} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-gradient-to-r from-primary to-purple-600"><RefreshCw className="w-4 h-4" />Try Again</button></div>}
        {data && !loading && !error && <WesternBirthChartContent data={data} />}
      </div></div>
    </main>
  </div>;
}

export default function WesternBirthChart() {
  const [data,setData] = useState<WesternChart|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/us/main/astrology/chart",{cache:"no-store"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load chart");
      setData(result.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load chart"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  return <WesternBirthChartView data={data} loading={loading} error={error} retry={()=>void load()} />;
}
