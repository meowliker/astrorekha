"use client";
import {useEffect,useState} from "react";
import type {WesternChart} from "@/lib/western-zodiac";
import ReportCTA from "@/components/ReportCTA";
import ReportInfoButton from "@/components/ReportInfoButton";
import {useRouter} from "next/navigation";
export default function WesternBirthChart(){
 const router=useRouter();
 const [data,setData]=useState<WesternChart|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/us/main/astrology/chart",{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error);setData(d.data);}catch(e){setError(e instanceof Error?e.message:"Unable to load chart");}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 return <main className="min-h-screen bg-[#0A0E1A] text-white p-5"><div className="max-w-lg mx-auto space-y-6">
  <header className="flex items-center justify-between gap-4"><button onClick={()=>router.push("/reports")}>← Reports</button><h1 className="text-xl font-semibold whitespace-nowrap">Birth Chart</h1><ReportInfoButton report="birthChart"/></header>
  <p className="text-sm text-white/60">Western zodiac · Tropical{data?.knowsBirthTime ? " · Placidus houses" : ""}</p>
  {loading&&<p role="status">Calculating your birth chart…</p>}
  {error&&<div role="alert"><p>{error}</p><button className="underline mt-3" onClick={()=>void load()}>Try again</button></div>}
  {data&&!loading&&<><div className="grid grid-cols-3 gap-3 rounded-2xl bg-white/5 p-5 text-center">{[["Sun Sign",data.sun_sign],["Moon Sign",data.moon_sign],["Ascendant",data.ascendant]].map(([label,value])=><div key={label}><p className="font-semibold">{value||"Birth time needed"}</p><p className="text-xs text-white/60 mt-2">{label}</p></div>)}</div>
  {!data.knowsBirthTime&&<p className="text-sm text-white/60">Birth time is needed for your Moon sign, Ascendant and houses. Planet positions below use a noon estimate.</p>}
  <p className="text-sm text-white/60">{data.birthDetails.date} · {data.birthDetails.time} · {data.birthDetails.place}</p>
  <table className="w-full text-sm"><thead><tr className="text-left text-white/60"><th className="py-3">Planet</th><th>Sign</th>{data.knowsBirthTime&&<th>House</th>}</tr></thead><tbody>{Object.entries(data.planets).map(([name,p])=><tr key={name} className="border-t border-white/10"><td className="py-3">{name}{p.retrograde?" ℞":""}</td><td>{p.sign}</td>{data.knowsBirthTime&&<td>{p.house??"—"}</td>}</tr>)}</tbody></table><ReportCTA western/></>}
 </div></main>;
}
