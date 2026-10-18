"use client";
import { useEffect, useState } from "react";
import type { SoulmateAdAccount, SoulmateCampaign } from "@/lib/us-soulmate-campaigns";

export function SoulmateCampaignPicker({ account, onChange }: { account: SoulmateAdAccount; onChange: (ids: string[]) => void }) {
  const [campaigns, setCampaigns] = useState<SoulmateCampaign[] | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setCampaigns(null); setError(""); setLoading(false);
    if (!/^\d{3,30}$/.test(account.accountId.trim().replace(/^act_/i, ""))) return () => abort.abort();
    setLoading(true);
    fetch("/api/admin/us-soulmate/ad-accounts/campaigns", {
      method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("admin_session_token") || ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.accountId, accessToken: account.accessToken }), signal: abort.signal,
    }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (!abort.signal.aborted) setCampaigns(data.campaigns);
    }).catch((cause) => { if (!abort.signal.aborted) setError(cause.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [account.accountId, account.accessToken, reload]);
  const selected = account.campaignIds || [];
  const visible = campaigns?.filter((campaign) => `${campaign.name} ${campaign.id}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">US Soulmate campaigns · {selected.length} selected</h3><button type="button" disabled={loading} onClick={() => setReload((n) => n + 1)} className="text-xs text-primary disabled:opacity-40">Reload campaigns</button></div>
    <p className="mt-1 text-xs text-white/50">Only selected campaigns contribute ad spend and Meta results in both US Soulmate Tracking and Profit Sheet. Select at least one.</p>
    {!account.accountId && <p className="mt-2 text-xs text-white/50">Enter an ad account ID and access token to load campaigns.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    {loading ? <p className="mt-3 text-sm text-white/50">Loading campaigns…</p> : campaigns && <>
      <input aria-label="Search campaigns" placeholder="Search campaign name or ID" value={search} onChange={(e) => setSearch(e.target.value)} className="my-3 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm" />
      <div className="max-h-56 space-y-1 overflow-y-auto">{visible?.map((campaign) => <label key={campaign.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
        <input type="checkbox" className="mt-1 accent-primary" checked={selected.includes(campaign.id)} onChange={(e) => onChange(e.target.checked ? [...selected, campaign.id] : selected.filter((id) => id !== campaign.id))} />
        <span className="min-w-0 text-sm"><span className="break-words">{campaign.name}</span><span className="mt-1 block text-xs text-white/40">{campaign.id} · {campaign.status || "Unknown status"}</span></span>
      </label>)}{!visible?.length && <p className="py-3 text-sm text-white/50">No matching campaigns.</p>}</div>
      {selected.filter((id) => !campaigns.some((campaign) => campaign.id === id)).map((id) => <div key={id} className="mt-2 flex items-center justify-between text-xs text-amber-200"><span>{id} · unavailable; remove and select a valid campaign</span><button type="button" onClick={() => onChange(selected.filter((value) => value !== id))}>Remove</button></div>)}
    </>}
    <p className="mt-3 text-xs text-white/40">Saving updates both pages. Use Backfill in Profit Sheet to recalculate earlier dates.</p>
  </div>;
}
