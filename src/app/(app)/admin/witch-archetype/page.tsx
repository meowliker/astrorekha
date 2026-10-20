"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WitchArchetypeDetail, { witchAdminDate } from "@/components/admin/WitchArchetypeDetail";
import type { WitchAdminDetail, WitchAdminSummary } from "@/lib/witch-archetype-admin";

type Listing = { items: WitchAdminSummary[]; total: number; pageSize: number };
const control = "rounded-lg border border-white/20 bg-[#182133] px-4 py-2 text-sm disabled:opacity-40";
export default function WitchArchetypeAdminPage() {
  const router = useRouter();
  const [mode, setMode] = useState("saved"), [search, setSearch] = useState(""), [draft, setDraft] = useState("");
  const [page, setPage] = useState(0), [revision, setRevision] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const [listing, setListing] = useState<Listing | null>(null), [detail, setDetail] = useState<WitchAdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem("admin_session_token");
    if (!token) { router.replace("/admin/login"); return; }
    const controller = new AbortController();
    setLoading(true); setError(null); setDetail(null); setListing(null);
    const params = selected ? new URLSearchParams({ userId: selected }) : new URLSearchParams({ mode, search, page: String(page) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/witch-archetype?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/admin/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load reports.");
        if (controller.signal.aborted) return;
        if (selected) setDetail(data); else setListing(data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load reports."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [mode, search, page, revision, selected, router]);
  return <main className="min-h-screen bg-[#0A0E1A] px-4 py-8 text-white"><div className="mx-auto max-w-6xl space-y-6">
    <Link href="/admin" className="text-sm text-white/60 hover:text-white">← Admin</Link>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Witch Archetype Reports</h1><p className="mt-1 text-sm text-white/60">Customer access, purchases and saved quiz results.</p></div><button className={control} disabled={loading} onClick={() => setRevision(r => r + 1)}>Refresh</button></header>
    {selected ? <button className={control} onClick={() => setSelected(null)}>← Back to customers</button> : <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); setPage(0); setSearch(draft.trim()); }}>
      <label className="sr-only" htmlFor="witch-filter">Report filter</label><select id="witch-filter" className={control} value={mode} onChange={e => { setMode(e.target.value); setPage(0); }}><option value="saved">Saved reports</option><option value="access">Customers with access</option></select>
      <label className="sr-only" htmlFor="witch-search">Search by name, email or customer ID</label><input id="witch-search" type="search" className={`${control} min-w-64 flex-1`} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Name, email or customer ID" maxLength={100} /><button className={control} type="submit">Search</button>
    </form>}
    {loading && <p role="status" className="py-10 text-white/60">Loading {selected ? "report details" : "customers"}…</p>}
    {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4"><p>{error}</p><button className={`${control} mt-3`} onClick={() => setRevision(r => r + 1)}>Try again</button></div>}
    {!loading && !error && detail && <WitchArchetypeDetail data={detail} />}
    {!loading && !error && listing && <>
      <p className="text-sm text-white/60">{listing.total} customers · {mode === "saved" ? "Includes saved reports whose access was later revoked." : "Includes tester access. Unlocked access does not necessarily mean a paid purchase; check the purchase history."}</p>
      <div className="overflow-x-auto rounded-xl border border-white/15"><table className="w-full text-left text-sm"><thead className="bg-[#1c2639] text-white/60"><tr>{["Customer", "Access", "Report", "Archetype", "Saved at · IST", "Details"].map(h => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{listing.items.map(row => <tr key={row.user.id} className="border-t border-white/10 bg-[#131c2b]"><td className="p-4">{row.user.name || "Unnamed customer"}<p className="text-xs text-white/60">{row.user.email || row.user.id}</p></td><td className="p-4">{row.access}</td><td className="p-4">{row.status}</td><td className="p-4">{row.archetype || "—"}</td><td className="p-4 whitespace-nowrap">{witchAdminDate(row.generatedAt)}</td><td className="p-4"><button className={control} aria-label={`View report for ${row.user.email || row.user.id}`} onClick={() => setSelected(row.user.id)}>View</button></td></tr>)}</tbody></table>{listing.items.length === 0 && <p className="p-8 text-white/60">No matching customers found.</p>}</div>
      <div className="flex items-center justify-end gap-4"><button className={control} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span className="text-sm">Page {page + 1} of {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span><button className={control} disabled={(page + 1) * listing.pageSize >= listing.total} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </div></main>;
}
