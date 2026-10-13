"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, Bell, CheckCircle2, Clock3, Mail, Plus, RefreshCw, ShieldAlert, Trash2, Webhook } from "lucide-react";

type Check = { key: string; name: string; status: string; message: string; checkedAt: string; latencyMs: number };
type Run = { id: string; trigger: string; started_at: string; finished_at: string | null; status: string; checks: Check[]; alert_count: number };
type Incident = { check_key: string; status: string; message: string; opened_at: string };
type Destination = { id: string; kind: "email" | "slack" | "slack_chat"; label: string; address: string; enabled: boolean };
type Notification = { id: string; check_key: string; event: string; destination_kind: string; destination_label: string; delivered: boolean; error: string | null; sent_at: string };
type Dashboard = { runs: Run[]; incidents: Incident[]; destinations: Destination[]; notifications: Notification[]; deliveryConfig: { emailReady: boolean; slackBotReady: boolean } };

const tone: Record<string, string> = {
  ok: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  healthy: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  warning: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  issues: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  down: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  failed: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  unconfigured: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  warming: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
};

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function MonitoringPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<Destination["kind"]>("email");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  const token = () => typeof window === "undefined" ? "" : localStorage.getItem("admin_session_token") || "";
  const api = useCallback(async (init?: RequestInit, suffix = "") => {
    const response = await fetch(`/api/admin/monitoring${suffix}`, {
      ...init, cache: "no-store",
      headers: { "Content-Type": "application/json", "x-admin-session": token(), ...init?.headers },
    });
    if (response.status === 401) { router.replace("/admin/login"); throw new Error("Admin session expired"); }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }, [router]);

  const load = useCallback(async () => {
    try { setDashboard(await api()); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load status"); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => {
    if (!token()) { router.replace("/admin/login"); return; }
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, router]);

  async function mutate(init: RequestInit, suffix = "") {
    setWorking(true);
    try { await api(init, suffix); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setWorking(false); }
  }

  async function addDestination(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await api({ method: "POST", body: JSON.stringify({ kind, label, address }) });
      setLabel(""); setAddress(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save destination"); }
    finally { setWorking(false); }
  }

  const latest = dashboard?.runs[0];
  const checks = latest?.checks || [];
  const alerts = dashboard?.incidents.length || 0;
  const stale = !!latest && Date.now() - new Date(latest.started_at).getTime() > 45 * 60_000;
  return <div className="min-h-screen bg-[#090e1a] text-slate-100 px-4 py-7 md:px-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <button onClick={() => router.push("/admin")} className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/> Admin</button>
          <div className="flex items-center gap-3"><Activity className="text-teal-300"/><h1 className="text-2xl font-semibold">System status</h1></div>
          <p className="mt-2 text-sm text-slate-400">Health checks run every 30 minutes. Times shown in IST.</p>
        </div>
        <button disabled={working} onClick={() => mutate({ method: "POST", body: JSON.stringify({ action: "run" }) })}
          className="flex items-center gap-2 rounded-lg border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-sm text-teal-200 hover:bg-teal-400/20 disabled:opacity-50"><RefreshCw size={16}/> Run checks now</button>
      </header>

      {message && <div role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{message}</div>}
      {stale && <div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">No monitoring run has started in the last 45 minutes. Check the Vercel cron schedule and deployment logs.</div>}
      {loading ? <p className="text-slate-400">Loading status…</p> : <>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#131c2d] p-5"><p className="text-sm text-slate-400">Latest run</p><p className="mt-2 text-xl font-semibold">{latest ? time(latest.started_at) : "No runs yet"}</p><p className="mt-1 text-xs text-slate-500">{latest?.trigger || "Run checks to start"}</p></div>
          <div className="rounded-xl border border-white/10 bg-[#131c2d] p-5"><p className="text-sm text-slate-400">Services checked</p><p className="mt-2 text-3xl font-semibold">{checks.length}</p></div>
          <div className="rounded-xl border border-white/10 bg-[#131c2d] p-5"><p className="text-sm text-slate-400">Open issues</p><p className={`mt-2 text-3xl font-semibold ${alerts ? "text-amber-300" : "text-emerald-300"}`}>{alerts}</p></div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#111a2a]">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="text-lg font-semibold">Service checks</h2><p className="text-sm text-slate-400">Latest recorded response from each dependency</p></div>
          {checks.length ? <div className="grid gap-px bg-white/10 md:grid-cols-2">
            {checks.map((check) => <div key={check.key} className="flex items-start gap-3 bg-[#111a2a] p-4">
              {check.status === "ok" ? <CheckCircle2 size={18} className="mt-0.5 text-emerald-300"/> : <ShieldAlert size={18} className="mt-0.5 text-amber-300"/>}
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{check.name}</span><span className={`rounded border px-2 py-0.5 text-xs ${tone[check.status] || tone.unconfigured}`}>{check.status}</span></div><p className="mt-1 text-sm text-slate-400">{check.message}</p></div>
              <span className="shrink-0 text-xs text-slate-500">{check.latencyMs} ms</span>
            </div>)}
          </div> : <p className="p-5 text-sm text-slate-400">No checks recorded yet.</p>}
        </section>

        {alerts > 0 && <section className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Open issues</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{dashboard?.incidents.map((item) => <div key={item.check_key} className="rounded-lg border border-amber-400/15 bg-[#111a2a] p-3 text-sm"><p className="font-medium">{item.check_key}</p><p className="mt-1 text-slate-300">{item.message}</p><p className="mt-2 text-xs text-slate-500">Since {time(item.opened_at)}</p></div>)}</div>
        </section>}

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#111a2a] p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={18} className="text-teal-300"/> Alert destinations</h2>
            <p className="mt-1 text-sm text-slate-400">Issue and recovery alerts go to every enabled destination. Existing issues do not repeat every run.</p>
            <p className="mt-2 text-xs text-slate-500">For Supabase outages, also set MONITOR_ALERT_EMAILS or MONITOR_SLACK_WEBHOOK_URLS in Vercel.</p>
            {!dashboard?.deliveryConfig.emailReady && <p className="mt-3 text-xs text-amber-300">Email sending needs BREVO_API_KEY in the server environment.</p>}
            {kind === "slack_chat" && !dashboard?.deliveryConfig.slackBotReady && <p className="mt-3 text-xs text-amber-300">Posting to Slack IDs needs SLACK_BOT_TOKEN in the server environment.</p>}
            <div className="mt-4 space-y-2">{dashboard?.destinations.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
              {item.kind === "email" ? <Mail size={17} className="text-cyan-300"/> : <Webhook size={17} className="text-cyan-300"/>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}</p><p className="truncate text-xs text-slate-500">{item.address}</p></div>
              <button onClick={() => mutate({ method: "PATCH", body: JSON.stringify({ id: item.id, enabled: !item.enabled }) })} disabled={working} className={`rounded border px-2 py-1 text-xs ${item.enabled ? tone.ok : tone.unconfigured}`}>{item.enabled ? "On" : "Off"}</button>
              <button aria-label={`Remove ${item.label}`} onClick={() => mutate({ method: "DELETE" }, `?id=${item.id}`)} disabled={working} className="text-slate-500 hover:text-rose-300"><Trash2 size={16}/></button>
            </div>)}{!dashboard?.destinations.length && <p className="text-sm text-slate-500">No dashboard destinations yet. Environment fallback recipients may also be configured.</p>}</div>
            <form onSubmit={addDestination} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr]">
              <select value={kind} onChange={(event) => setKind(event.target.value as Destination["kind"])} className="rounded-lg border border-white/10 bg-[#1b2639] px-3 py-2 text-sm"><option value="email">Email address</option><option value="slack">Slack webhook</option><option value="slack_chat">Slack channel or person ID</option></select>
              <input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label, e.g. Operations" className="rounded-lg border border-white/10 bg-[#1b2639] px-3 py-2 text-sm"/>
              <input required type={kind === "email" ? "email" : kind === "slack" ? "url" : "text"} value={address} onChange={(event) => setAddress(event.target.value)} placeholder={kind === "email" ? "person@gmail.com" : kind === "slack" ? "https://hooks.slack.com/services/…" : "C… channel ID or U… person ID"} className="rounded-lg border border-white/10 bg-[#1b2639] px-3 py-2 text-sm sm:col-span-2"/>
              <button disabled={working} className="flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 sm:col-span-2"><Plus size={16}/> Add destination</button>
            </form>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111a2a] p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock3 size={18} className="text-teal-300"/> Recent runs</h2>
            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{dashboard?.runs.map((run) => <div key={run.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"><div><p>{time(run.started_at)}</p><p className="text-xs text-slate-500">{run.trigger} · {run.checks?.length || 0} checks · {run.alert_count} changes</p></div><span className={`rounded border px-2 py-1 text-xs ${tone[run.status] || tone.unconfigured}`}>{run.status}</span></div>)}{!dashboard?.runs.length && <p className="text-sm text-slate-500">No runs yet.</p>}</div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#111a2a] p-5">
          <h2 className="text-lg font-semibold">Alert delivery log</h2>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{dashboard?.notifications.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-2 text-sm"><div><span className={item.delivered ? "text-emerald-300" : "text-rose-300"}>{item.delivered ? "Delivered" : "Failed"}</span><span className="ml-2 text-slate-300">{item.check_key} {item.event} → {item.destination_label}</span>{item.error && <p className="text-xs text-rose-300">{item.error}</p>}</div><span className="text-xs text-slate-500">{time(item.sent_at)}</span></div>)}{!dashboard?.notifications.length && <p className="text-sm text-slate-500">No alerts sent yet.</p>}</div>
        </section>
      </>}
    </div>
  </div>;
}
