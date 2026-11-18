export type GoogleUnmatched = {
  timezone: string; currency: string; campaigns: string[];
  rows: Array<{date:string; orders:number; received:number; refund:number; refunds:number}>;
};
export default function GoogleProfitUnmatched({data, days=[]}:{data?:GoogleUnmatched;days?:string[]}) {
  const rows = data?.rows.filter(row=>!days.length||days.includes(row.date)) || [];
  if (!data || !rows.length) return null;
  const money=(minor:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:data.currency}).format(minor/100);
  return <section className="rounded-xl border border-white/10 bg-[#1A2235] p-4" aria-label="Unmatched Google orders">
    <h2 className="font-semibold">Unmatched Google orders · separate from account profit</h2>
    <p className="mt-1 text-xs text-white/50">Campaign: {data.campaigns.join(', ')}. Excluded from both account profit totals and Meta. Dates use {data.timezone}.</p>
    <table className="mt-4 w-full text-sm"><thead className="text-white/50"><tr><th className="text-left">Date</th><th className="text-right">Orders</th><th className="text-right">Received</th><th className="text-right">Refunds</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.date} className="border-t border-white/10"><td className="py-3">{row.date}</td><td className="text-right">{row.orders}</td><td className="text-right">{money(row.received)}</td><td className="text-right">{money(row.refund)}</td></tr>)}</tbody></table>
  </section>;
}
