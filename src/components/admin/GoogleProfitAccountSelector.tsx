"use client";

export const GOOGLE_PROFIT_ACCOUNTS = [
  {id:'4870113996',name:'Astro USA',timezone:'America/New_York'},
  {id:'6752275511',name:'Astro India',timezone:'Asia/Calcutta'},
];
export function googleProfitAccount(id:string) { return GOOGLE_PROFIT_ACCOUNTS.find(account=>account.id===id) || GOOGLE_PROFIT_ACCOUNTS[0]; }
export function googleProfitToday(id:string) { return new Intl.DateTimeFormat('en-CA',{timeZone:googleProfitAccount(id).timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export default function GoogleProfitAccountSelector({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <label className="flex flex-col gap-1 text-xs text-white/50">Google account · reporting day
    <select aria-label="Google account reporting day" value={value} onChange={event=>onChange(event.target.value)} className="rounded-xl border border-white/10 bg-[#1A2235] px-4 py-3 text-sm text-white">
      {GOOGLE_PROFIT_ACCOUNTS.map(account=><option key={account.id} value={account.id}>{account.name} · {account.timezone}</option>)}
    </select>
  </label>;
}
