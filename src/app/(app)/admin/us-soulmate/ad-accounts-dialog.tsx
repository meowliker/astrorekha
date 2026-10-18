"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { SoulmateAdAccount } from "@/lib/us-soulmate-campaigns";
import { SoulmateCampaignPicker } from "./campaign-picker";
import { US_SOULMATE_PROFIT_START } from "@/lib/us-soulmate-profit";

type Account = SoulmateAdAccount & { hasAccessToken?: boolean };
const input = "mt-1 h-10 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-primary/50 disabled:opacity-40";
const button = "rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40";
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}`, "Content-Type": "application/json" });

export function SoulmateAdAccountsDialog({ close, saved }: { close: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current; node?.showModal();
    const abort = new AbortController();
    fetch("/api/admin/us-soulmate/ad-accounts", { headers: headers(), signal: abort.signal, cache: "no-store" }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setAccounts(data.accounts); setRevision(data.revision);
    }).catch((e) => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); node?.close(); };
  }, []);
  function update(index: number, change: Partial<Account>) { setAccounts((current) => current.map((a, i) => i === index ? { ...a, ...change } : a)); }
  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/us-soulmate/ad-accounts", { method: "PUT", headers: headers(), body: JSON.stringify({ accounts, revision }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      saved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save accounts."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} onCancel={(e) => { if (saving) e.preventDefault(); else close(); }} aria-labelledby="us-soulmate-ad-accounts-title" className="max-h-[90vh] w-[1080px] max-w-[95vw] overflow-y-auto rounded-2xl border border-white/15 bg-[#151d2e] p-5 text-white backdrop:bg-black/70 [color-scheme:dark]">
    <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="us-soulmate-ad-accounts-title" className="text-lg font-semibold">US Soulmate Accounts & Campaigns <span className="ml-2 text-sm font-normal text-white/45">{accounts.length} configured</span></h2><p className="mt-2 text-sm text-white/50">Select the US Soulmate campaigns in each account. Shared ad accounts are supported; only selected campaigns are included.</p><p className="mt-1 text-xs text-white/40">Account windows use IST. Use USD ad accounts. Timezone is read from Meta when refreshing.</p></div><button type="button" disabled={saving} onClick={close} aria-label="Close ad accounts" className="p-2"><X size={18} /></button></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {loading ? <p className="py-8 text-center text-white/50">Loading saved accounts…</p> : <div className="space-y-4">
      {!accounts.length && <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-white/50">No US Soulmate ad accounts yet. Add an account below and select its US Soulmate campaigns.</p>}
      {accounts.map((account, index) => <fieldset key={index} disabled={saving} className="rounded-xl border border-white/10 p-4"><legend className="px-2 text-sm text-white/75">{account.label || `Ad account ${index + 1}`}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-white/50">Label<input className={input} value={account.label || ""} onChange={(e) => update(index, { label: e.target.value })} /></label>
          <label className="text-xs text-white/50">Ad account ID<input className={input} placeholder="act_123…" value={account.accountId} onChange={(e) => update(index, { accountId: e.target.value, campaignIds: [], hasAccessToken: false })} /></label>
          <label className="text-xs text-white/50">Start date<input className={input} type="date" min={US_SOULMATE_PROFIT_START} value={account.startDate || US_SOULMATE_PROFIT_START} onChange={(e) => update(index, { startDate: e.target.value })} /></label>
          <label className="text-xs text-white/50">Start time (IST)<input className={input} type="time" value={account.startTime || "11:30"} onChange={(e) => update(index, { startTime: e.target.value })} /></label>
          <label className="text-xs text-white/50">End date<input className={input} type="date" disabled={account.active} min={account.startDate} value={account.endDate || ""} onChange={(e) => update(index, { endDate: e.target.value })} /></label>
          <label className="text-xs text-white/50">End time (IST)<input className={input} type="time" disabled={account.active} value={account.endTime || "23:59"} onChange={(e) => update(index, { endTime: e.target.value })} /></label>
          <label className="text-xs text-white/50 sm:col-span-2 lg:col-span-4">Access token{account.hasAccessToken ? " · saved" : ""}<input className={input} type="password" autoComplete="off" placeholder={account.hasAccessToken ? "Leave blank to keep saved token" : "Paste this account’s Meta access token"} value={account.accessToken || ""} onChange={(e) => update(index, { accessToken: e.target.value })} /></label>
        </div><SoulmateCampaignPicker account={account} onChange={(campaignIds) => update(index, { campaignIds })} /><div className="mt-4 flex justify-between"><label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={account.active !== false} onChange={(e) => update(index, { active: e.target.checked })} className="accent-primary" />Active / no end date</label><button type="button" className="text-sm text-red-300" onClick={() => setAccounts((all) => all.filter((_, i) => i !== index))}>Remove</button></div>
      </fieldset>)}
    </div>}
    <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4"><button type="button" disabled={loading || saving || accounts.length >= 20} className={`${button} flex items-center gap-2 text-primary`} onClick={() => setAccounts((all) => [...all, { accountId: "", active: true, startDate: US_SOULMATE_PROFIT_START, startTime: "11:30", balanceMode: "outstanding" }])}><Plus size={16} />Add Account</button><div className="flex gap-2"><button type="button" disabled={saving} className={button} onClick={close}>Cancel</button><button type="button" disabled={loading || saving || !revision || accounts.some((account) => !account.campaignIds?.length)} className="rounded-lg bg-primary px-5 py-2 text-sm disabled:opacity-40" onClick={save}>{saving ? "Saving…" : "Save selection"}</button></div></div>
  </dialog>;
}
