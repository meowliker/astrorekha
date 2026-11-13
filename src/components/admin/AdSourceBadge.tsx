export default function AdSourceBadge({source}:{source?:string}) {
 const label=source==="meta"?"FB":source==="google"?"GA":source==="test"?"Test":"Other";
 const title=source==="meta"?"Meta Ads (Facebook / Instagram)":source==="google"?"Google Ads":source==="test"?"Test traffic":"Other or unknown source";
 const color=source==="meta"?"border-blue-400/30 bg-blue-500/15 text-blue-200":source==="google"?"border-amber-400/30 bg-amber-500/15 text-amber-200":"border-white/15 bg-white/5 text-white/60";
 return <span title={`${title}. Based on saved attribution or the configured landing-page mapping.`} className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${color}`}>{label}</span>;
}
