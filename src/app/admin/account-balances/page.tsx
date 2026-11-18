'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Wallet, Clock3 } from 'lucide-react';
import { BALANCE_FUNNELS, type BalancesView, type BalanceReading } from '@/lib/account-balances-types';

const money = (n: number | undefined | null, currency = 'INR') => n == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
const time = (at?: string) => at ? new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST' : 'Not checked yet';
const slot = (source: BalanceReading['source']) => ({ midnight: '12:00 AM', morning: '11:30 AM', evening: '6:00 PM', manual: 'Manual refresh' })[source];
const headers = () => ({ 'Content-Type': 'application/json', 'x-admin-session': localStorage.getItem('admin_session_token') || '' });

export default function AccountBalancesPage() {
  const [data, setData] = useState<BalancesView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState<'additions' | 'limit_change' | 'snapshots'>('additions');
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/account-balances', { headers: headers(), cache: 'no-store' });
    const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Could not load balances'); setData(body);
  }, []);
  useEffect(() => {
    const update = () => void load().catch(e => setError(e.message));
    update(); const timer = setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [load]);
  async function refresh() {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/admin/account-balances', { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'refresh' }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error);
      await load(); setNotice(body.refreshed ? `Updated ${body.successful} of ${body.total} accounts.` : body.reason);
    } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed'); } finally { setBusy(false); }
  }
  const history = (data?.history || []).filter(h => (tab === 'limit_change' || (tab === 'additions' && h.amount > 0 && (h.before || 0) > 0)) && (filter === 'all' || h.accountId === filter));
  const snapshots = (data?.snapshots || []).filter(h => filter === 'all' || h.accountId === filter);
  const count = tab === 'snapshots' ? snapshots.length : history.length;
  const offset = (page - 1) * 15;
  const historyAccounts = [...new Map([...(data?.accounts || []), ...(data?.history || []), ...(data?.snapshots || [])].map(a => [a.accountId, a])).values()];
  const lastRefresh = data?.current.map(c => c.last_attempt.at).sort().at(-1);
  const failedAccounts = data?.current.filter(c => c.last_attempt.status === 'error') || [];
  return <main className="min-h-screen bg-[#0A0E1A] px-4 py-8 text-white sm:px-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin" className="mb-7 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft size={18} /> Admin dashboard</Link>
      <header className="mb-7 flex items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Wallet size={18} /> AD ACCOUNTS</div><h1 className="text-3xl font-semibold sm:text-4xl">Account Balances</h1><p className="mt-2 text-sm text-white/50">Last refresh: {time(lastRefresh)}</p></div>
        <button onClick={refresh} disabled={busy} title="Fetch current balances from Meta" aria-label="Refresh all account balances" className="rounded-xl border border-white/15 bg-white/5 p-3 hover:bg-white/10 disabled:opacity-50"><RefreshCw className={busy ? 'animate-spin' : ''} size={22} /></button>
      </header>
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-[#151C2D] px-4 py-3 text-sm text-white/65"><Clock3 size={17} /><span>Automatic updates · IST</span><span className="text-white">12:00 AM</span><span>·</span><span className="text-white">11:30 AM</span><span>·</span><span className="text-white">6:00 PM</span>{data?.localPreview && <span className="ml-auto text-cyan-300">Local preview · production unchanged</span>}</div>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-red-200">{error}</p>}
      {failedAccounts.length > 0 && <p role="status" className="mb-4 text-xs text-amber-200">Refresh unavailable: {failedAccounts.map(c => `${c.last_attempt.accountName} (last verified ${time(c.last_verified?.at)})`).join('; ')}. Saved balances retained.</p>}
      {notice && <p role="status" className="mb-5 text-sm text-emerald-300">{notice}</p>}
      {!data && !error && <p className="py-10 text-white/50">Loading saved balances…</p>}
      {data && BALANCE_FUNNELS.map(funnel => {
        const accounts = data.accounts.filter(a => a.funnels.includes(funnel));
        if (!accounts.length) return null;
        return <section key={funnel} className="mb-5" aria-label={`${funnel} balances`}>
          <h2 className="mb-2 text-base font-semibold">{funnel} <span className="ml-2 text-sm font-normal text-white/40">{accounts.length} active {accounts.length === 1 ? 'account' : 'accounts'}</span></h2>
          <div className="space-y-2">{accounts.map(a => {
            const current = data.current.find(c => c.account_id === a.accountId);
            const verified = current?.last_verified;
            return <article key={a.accountId} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#1A2235] px-4 py-3">
              <div className="min-w-0"><h3 className="text-sm font-medium leading-snug">{verified?.accountName || a.accountName}</h3><p className="mt-1 text-xs text-white/40">{a.accountId}</p></div>
              <p className="shrink-0 text-right text-lg font-semibold tabular-nums" title={verified?.remaining === null ? 'Amount owed; remaining funds unavailable' : 'Remaining account spending limit'}>{money(verified?.remaining === null ? verified.outstanding : verified?.remaining, verified?.currency)}{verified?.remaining === null && <span className="ml-1 text-xs font-normal text-white/50">owed</span>}</p>
            </article>;
          })}</div>
        </section>;
      })}
      {data && !data.accounts.length && <p className="py-8 text-white/50">No active Meta accounts configured.</p>}
      {data && <p className="mb-9 text-xs leading-relaxed text-white/45">Meta amounts show the remaining account spending limit, not a prepaid wallet balance. Google account balances are not connected. {data.localPreview && 'Scheduled server updates start after deployment; use refresh to test locally.'}</p>}
      <section className="rounded-2xl border border-white/10 bg-[#151C2D]" aria-label="Account history">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5"><div><h2 className="text-xl font-semibold">Balance additions & history</h2><p className="mt-1 text-xs text-white/45">Automatically imported from Meta. No manual entries needed.</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex flex-wrap gap-2">{(['additions', 'limit_change', 'snapshots'] as const).map(t => <button key={t} onClick={() => { setTab(t); setPage(1); }} className={`rounded-lg px-3 py-2 text-sm ${tab === t ? 'bg-emerald-400/15 text-emerald-300' : 'text-white/50 hover:text-white'}`}>{t === 'additions' ? 'Limit additions' : t === 'limit_change' ? 'Meta limit changes' : 'Balance snapshots'}</button>)}</div><select aria-label="Filter history by account" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="max-w-full rounded-lg border border-white/15 bg-[#0A0E1A] px-3 py-2 text-sm"><option value="all">All accounts</option>{historyAccounts.map(a => <option key={a.accountId} value={a.accountId}>{a.accountName}</option>)}</select></div>
        {tab !== 'snapshots' && <p className="px-5 pb-4 text-xs text-white/45">Spending-limit increases show the amount added to the limit, not a verified payment. Available Meta history covers the last 90 days. {data?.historyNote}</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-white/5 text-xs text-white/50"><tr><th className="p-4 font-medium">Date · IST</th><th className="p-4 font-medium">Account</th><th className="p-4 font-medium">{tab === 'snapshots' ? 'Remaining' : 'Amount'}</th><th className="p-4 font-medium">{tab === 'snapshots' ? 'Update' : 'Details'}</th></tr></thead><tbody>
          {tab === 'snapshots' ? snapshots.slice(offset, offset + 15).map(r => <tr key={`${r.accountId}:${r.at}`} className="border-t border-white/5"><td className="p-4 text-white/60">{time(r.at)}</td><td className="p-4">{r.accountName}</td><td className="p-4 tabular-nums">{r.status === 'ok' ? money(r.remaining, r.currency) : 'Unavailable'}</td><td className="p-4 text-white/50">{slot(r.source)}</td></tr>) : history.slice(offset, offset + 15).map(h => <tr key={h.id} className="border-t border-white/5"><td className="p-4 text-white/60">{time(h.at)}</td><td className="p-4">{h.accountName}</td><td className="p-4 tabular-nums">{money(h.amount, h.currency)}</td><td className="p-4 text-white/50">{`${money(h.before, h.currency)} → ${money(h.after, h.currency)}`}<span className="mt-1 block text-xs">{h.before === 0 ? 'Limit set' : h.after === 0 ? 'Limit removed' : h.amount > 0 ? 'Limit increased' : 'Limit decreased'}</span></td></tr>)}
          {!count && <tr><td colSpan={4} className="p-9 text-center text-white/40">{tab !== 'snapshots' ? 'No matching limit changes. Refresh to check Meta.' : 'No balance snapshots yet. Use refresh to fetch current balances.'}</td></tr>}
        </tbody></table></div>
        {count > 15 && <div className="flex items-center justify-end gap-4 border-t border-white/10 p-4 text-sm text-white/60"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-30">Previous</button><span>{page} / {Math.ceil(count / 15)}</span><button disabled={page * 15 >= count} onClick={() => setPage(p => p + 1)} className="disabled:opacity-30">Next</button></div>}
      </section>

    </div>
  </main>;
}
