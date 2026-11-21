'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Info, RefreshCw, X } from 'lucide-react';
import { countryDate, countryWindow, type Country, type Metric, type ConsolidatedReport, type ConsolidatedRow } from '@/lib/consolidated-profit';
import { trackingDate } from '@/lib/tracking-dashboard';
const columns: {key:Metric;label:string}[] = [
  {key:'received',label:'Received'},{key:'refund',label:'Refund'},{key:'revenue',label:'Revenue'},
  {key:'adsUsd',label:'Ads (USD)'},{key:'adsInr',label:'Ads (INR)'},{key:'gst',label:'GST'},
  {key:'balance',label:'Account Balance'},{key:'profit',label:'Profit'},{key:'margin',label:'Profit %'},
  {key:'roas',label:'ROAS'},{key:'bundles',label:'Bundle Purchases'},{key:'orders',label:'Orders'},
];
const dateLabel = (date:string) => date==='Total'?date:new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const timestamp = (at:string) => new Date(at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST';
type Loaded = ConsolidatedReport & {refreshing?:boolean;preparing?:boolean;syncWarning?:string};
export default function ConsolidatedProfitPage() {
  const [country,setCountry] = useState<Country>('india');
  const today = countryDate(new Date(),country);
  const [start,setStart] = useState(()=>trackingDate(new Date(),'calendar_ist').slice(0,7)+'-01');
  const [end,setEnd] = useState(()=>trackingDate(new Date(),'calendar_ist'));
  const [report,setReport] = useState<Loaded|null>(null);
  const [loading,setLoading] = useState(false), [error,setError] = useState('');
  const [selected,setSelected] = useState<{row:ConsolidatedRow;key:Metric}|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const serial = useRef(0);
  const lastSelection = useRef('');
  const [refresh,setRefresh] = useState(0);
  useEffect(()=>{
    const controller = new AbortController(); const requestId=++serial.current;
    let timer:ReturnType<typeof setTimeout>|undefined, polls=0;
    const selection = `${country}:${start}:${end}`;
    if(lastSelection.current!==selection)setReport(null);
    lastSelection.current=selection;setSelected(null);setLoading(true);setError('');
    const load = async()=>{
      try {
        const response=await fetch(`/api/admin/consolidated-profit?${new URLSearchParams({country,start,end})}`,{signal:controller.signal,headers:{Authorization:`Bearer ${localStorage.getItem('admin_session_token') || ''}`},cache:'no-store'});
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load the profit sheet.');
        if(requestId!==serial.current)return;
        if(!data.preparing) {setReport(data);setLoading(false);}
        if((data.preparing||data.refreshing)&&polls++<30)timer=setTimeout(load,4000);
        else if(data.preparing) {setLoading(false);setError('The report is still preparing. Refresh shortly.');}
      } catch(e) {if(controller.signal.aborted)return;setError(e instanceof Error?e.message:'Unable to load the profit sheet.');setLoading(false);}
    };
    if(start>end||end>today||start<'2026-10-01'){setError('Choose a valid range from 1 October 2026 through the current reporting day.');setLoading(false);}
    else void load();
    return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[country,start,end,today,refresh]);
  useEffect(()=>{if(selected)dialog.current?.showModal();else dialog.current?.close();},[selected]);
  const format=useCallback((value:number|null,key:Metric)=>{
    if(value===null)return '—';
    if(key==='margin')return `${value.toFixed(2)}%`;
    if(key==='roas')return `${value.toFixed(2)}×`;
    if(key==='orders'||key==='bundles')return value.toLocaleString('en-IN');
    const currency=key==='adsUsd'?'USD':key==='adsInr'?'INR':country==='india'?'INR':'USD';
    return new Intl.NumberFormat('en-IN',{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  },[country]);
  const cell=(row:ConsolidatedRow,key:Metric)=>{
    const amount=row.values[key];
    const retained=row.contributions.some(p=>p.retainedAt)&&['adsUsd','adsInr','gst','profit','margin','roas'].includes(key);
    return <td key={key} className="whitespace-nowrap px-4 py-4 text-right tabular-nums"><div className="flex items-center justify-end gap-2">
      <span className={amount===null?'text-white/35':['revenue','profit','received'].includes(key)?amount<0?'text-red-400':'text-emerald-400':'text-white/80'}>{format(amount,key)}{retained&&<span title="Includes last verified spend" className="ml-1 text-amber-300">*</span>}</span>
      <button aria-label={`${dateLabel(row.date)} ${columns.find(c=>c.key===key)?.label} breakdown`} onClick={()=>setSelected({row,key})} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-cyan-300 focus-visible:outline focus-visible:outline-cyan-300"><Info size={14}/></button>
    </div></td>;
  };
  return <main className="min-h-screen bg-[#0A0F1C] px-4 py-8 text-white md:px-8">
    <div className="mx-auto max-w-[1600px]">
      <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft size={16}/>Admin dashboard</Link>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Consolidated Profit Sheet</h1><p className="mt-2 text-sm text-white/50">All funnels and sources. One view of your India and US business.</p></div>
        <button aria-label="Refresh profit sheet" disabled={loading} onClick={()=>setRefresh(n=>n+1)} className="rounded-xl border border-white/15 p-3 hover:bg-white/5 disabled:opacity-40"><RefreshCw size={19} className={loading?'animate-spin':''}/></button></div>
      <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A2235] p-5">
        <div className="flex flex-wrap items-end justify-between gap-5"><div role="tablist" aria-label="Country" className="flex gap-2 rounded-xl bg-black/20 p-1">
          {(['india','us'] as const).map(value=><button key={value} role="tab" aria-selected={country===value} onClick={()=>{setCountry(value);setEnd(current=>current>countryDate(new Date(),value)?countryDate(new Date(),value):current);}} className={`min-w-28 rounded-lg px-5 py-3 text-sm font-medium ${country===value?'bg-[#E9144A] text-white':'text-white/60 hover:bg-white/5'}`}>{value==='india'?'India':'US'}</button>)}
        </div><div className="flex flex-wrap gap-3"><label className="text-xs text-white/50">From<input aria-label="Start date" type="date" min="2026-10-01" max={today} value={start} onChange={e=>setStart(e.target.value)} className="mt-2 block rounded-lg border border-white/15 bg-[#111827] px-3 py-2 text-sm text-white [color-scheme:dark]"/></label><label className="text-xs text-white/50">To<input aria-label="End date" type="date" min={start} max={today} value={end} onChange={e=>setEnd(e.target.value)} className="mt-2 block rounded-lg border border-white/15 bg-[#111827] px-3 py-2 text-sm text-white [color-scheme:dark]"/></label></div></div>
        <div className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-white/50"><span>Reporting day · {countryWindow(country)}</span><span>{report?`Updated ${timestamp(report.fetchedAt)}${report.refreshing?' · Updating…':''}`:'Loading saved figures…'}</span></div>
      </section>
      {error&&<p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{error}</p>}
      {report?.syncWarning&&<p className="mb-4 text-sm text-white/50">Showing saved figures while the source refresh completes.</p>}
      <section role="tabpanel" aria-label={`${country==='india'?'India':'US'} profit sheet`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#1A2235]">
        <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">{country==='india'?'India':'US'} · Profit Sheet</h2><p className="mt-1 text-xs text-white/45">{report?`₹${report.exchangeRate.toFixed(2)} per US$1 · Select an info icon for the source breakdown.`:'Preparing the selected reporting window.'}</p></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-white/5 text-xs text-white/60"><tr><th className="px-4 py-4 text-left">Date</th><th className="px-4 py-4 text-left">Day</th>{columns.map(col=><th key={col.key} className="whitespace-nowrap px-4 py-4 text-right">{col.label}</th>)}</tr></thead>
          <tbody>{loading&&!report?<tr><td colSpan={14} className="py-20 text-center text-white/50"><RefreshCw className="mx-auto mb-3 animate-spin" size={22}/>Preparing profit sheet…</td></tr>:report?.rows.map(row=><tr key={row.date} className="border-t border-white/10 even:bg-white/[.025]"><td className="whitespace-nowrap px-4 py-4 text-white/75">{dateLabel(row.date)}</td><td className="px-4 py-4 text-white/45">{new Date(row.date).toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</td>{columns.map(col=>cell(row,col.key))}</tr>)}</tbody>
          {report&&<tfoot className="border-t border-white/20 bg-white/10 font-semibold"><tr><td colSpan={2} className="px-4 py-5">TABLE TOTAL</td>{columns.map(col=>cell(report.total,col.key))}</tr></tfoot>}
        </table></div>
      </section>
      {report&&<p className="mt-4 text-xs leading-6 text-white/40">Amounts are {report.currency} except the labelled ad-spend columns. Profit keeps each funnel’s existing tax calculation. ROAS = net revenue ÷ ad spend. Account balances use the saved {country==='india'?'midnight IST':'11:30 AM IST'} snapshot; the total uses the final day, not the sum of daily balances. Google balances are unavailable.{report.unassignedOrders>0?` ${report.unassignedOrders} Google orders with no verified account remain separate from these totals.`:''}</p>}
      <dialog ref={dialog} onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===dialog.current)setSelected(null);}} className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-white/15 bg-[#161F30] p-0 text-white shadow-2xl backdrop:bg-black/70">
        {selected&&<><header className="flex items-start justify-between border-b border-white/10 p-5"><div><h2 className="text-lg font-semibold">{columns.find(col=>col.key===selected.key)?.label} breakdown</h2><p className="mt-1 text-sm text-white/50">{dateLabel(selected.row.date)} · {country==='india'?'India':'US'}</p></div><button autoFocus aria-label="Close breakdown" onClick={()=>setSelected(null)} className="rounded-lg p-2 hover:bg-white/10"><X size={19}/></button></header>
          <div className="p-5"><p className="mb-5 text-xs text-white/50">{countryWindow(country)}</p>
          {selected.key==='balance'?<>{selected.row.balances.map(account=><div key={account.id} className="border-b border-white/10 py-3"><div className="flex justify-between gap-3"><span>{account.name}</span><span>{format(account.value,'balance')}</span></div><p className="mt-1 text-xs text-white/40">{account.id} · {account.capturedAt?timestamp(account.capturedAt):'Snapshot unavailable'}</p><p className="mt-1 text-xs text-white/50">{account.note}</p></div>)}<p className="mt-4 text-xs text-white/50">Shared Meta accounts are included once. Google does not provide a remaining balance here. Period total shows the last selected day’s snapshot.</p></>:selected.row.contributions.map(part=><div key={part.key} className="border-b border-white/10 py-4"><div className="flex justify-between gap-3"><span className="text-sm">{part.label}</span><span className="shrink-0 font-medium tabular-nums">{format(part.values[selected.key],selected.key)}</span></div><p className="mt-2 text-xs leading-5 text-white/45">{part.note}</p>{part.approximate&&['adsUsd','adsInr','gst','profit','margin','roas'].includes(selected.key)&&<p className="mt-1 text-xs text-white/50">Meta hourly spend is allocated across a reporting boundary.</p>}{part.retainedAt&&<p className="mt-1 text-xs text-amber-200">Spend last verified {timestamp(part.retainedAt)}.</p>}{part.values[selected.key]===null&&<p className="mt-1 text-xs text-white/50">Unavailable; not treated as zero.</p>}</div>)}
          <div className="mt-5 flex justify-between font-semibold"><span>{selected.key==='margin'||selected.key==='roas'?'Combined ratio':'Total'}</span><span>{format(selected.row.values[selected.key],selected.key)}</span></div>
          {['margin','roas'].includes(selected.key)&&<p className="mt-3 text-xs text-white/50">Calculated from combined totals; individual percentages and ROAS values are not added together.</p>}
          {selected.key==='gst'&&<p className="mt-3 text-xs text-white/50">Normal India uses sales GST minus eligible ad GST credit. Soulmate uses recorded sales GST plus ad GST. US uses any recorded sales tax, including tax on historical INR purchases.</p>}
          </div></>}
      </dialog>
    </div>
  </main>;
}
