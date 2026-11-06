"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ViewerAccount, ViewerPermissions } from "@/lib/partner-analytics-access";

const endpoint = "/api/admin/analytics-access";
const accessLabels: Record<keyof ViewerPermissions, string> = {
  traffic: "Sessions", purchases: "Purchase counts", revenue: "Purchase revenue", channels: "Channel breakdown",
};
const accessKeys = Object.keys(accessLabels) as (keyof ViewerPermissions)[];
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const primary = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";

function permissions(form: FormData) {
  return Object.fromEntries(accessKeys.map(key => [key, form.has(key)]));
}

function PermissionFields({ viewer }: { viewer?: ViewerPermissions }) {
  return <fieldset>
    <legend className="mb-2 text-sm font-medium">Visible data</legend>
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {accessKeys.map(key => <label key={key} className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={key} defaultChecked={viewer?.[key]} />{accessLabels[key]}
      </label>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">The channel breakdown uses the metrics selected above.</p>
  </fieldset>;
}

export default function AnalyticsAccessPage() {
  const router = useRouter();
  const [viewers, setViewers] = useState<ViewerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [portalUrl, setPortalUrl] = useState("");

  const request = useCallback(async (body?: object, signal?: AbortSignal) => {
    const token = localStorage.getItem("admin_session_token");
    if (!token) {
      router.replace("/admin/login");
      throw new Error("Sign in as an admin to manage viewer access.");
    }
    const response = await fetch(endpoint, {
      method: body ? "POST" : "GET", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (response.status === 401) router.replace("/admin/login");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    setPortalUrl(new URL("/partner-analytics", window.location.origin).href);
    void request(undefined, controller.signal).then(data => setViewers(data.viewers)).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load viewers.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  async function save(body: object, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request(body);
      const viewer: ViewerAccount = data.viewer;
      setViewers(current => current.some(item => item.id === viewer.id)
        ? current.map(item => item.id === viewer.id ? viewer : item) : [viewer, ...current]);
      if (data.password) setCredentials({ email: viewer.email, password: data.password });
      setNotice(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save viewer access.");
      return false;
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (await save({ action: "create", email: form.get("email"), label: form.get("label"), ...permissions(form) }, "Viewer created.")) element.reset();
  }

  function update(event: FormEvent<HTMLFormElement>, viewer: ViewerAccount) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save({ action: "update", id: viewer.id, active: form.has("active"), ...permissions(form) }, "Viewer access saved.");
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`AstroRekha Partner Analytics\n${portalUrl}\nEmail: ${credentials.email}\nPassword: ${credentials.password}`);
      setNotice("Viewer credentials copied.");
    } catch {
      setError("Copy the viewer details from the fields below.");
    }
  }

  return <div className="mx-auto max-w-4xl space-y-8 px-5 py-8 sm:px-8">
    <header className="space-y-2 border-b border-border pb-6">
      <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground">← Admin</a>
      <h1 className="text-3xl font-semibold tracking-tight">Analytics access</h1>
      <p className="text-sm text-muted-foreground">Create read-only viewer accounts and choose which GA4 metrics each person can see.</p>
      <a href="/partner-analytics" target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-primary underline">Open the partner portal ↗</a>
    </header>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
    {credentials && <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4" aria-labelledby="credentials-title">
      <h2 id="credentials-title" className="font-semibold">Viewer credentials</h2>
      <p className="text-sm text-muted-foreground">Copy these details before closing this panel. The password is shown once.</p>
      <label className="block space-y-1 text-sm">Email <input className={input} value={credentials.email} readOnly /></label>
      <label className="block space-y-1 text-sm">Password <input className={`${input} font-mono`} value={credentials.password} readOnly /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => void copyCredentials()}>Copy portal link and credentials</button>
        <button type="button" className={button} onClick={() => setCredentials(null)}>Dismiss</button>
      </div>
    </section>}
    <form onSubmit={create} className="space-y-4 border-b border-border pb-8">
      <h2 className="text-lg font-semibold">Add viewer</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Display name <input className={input} name="label" maxLength={100} required /></label>
        <label className="space-y-1 text-sm">Viewer email <input className={input} name="email" type="email" maxLength={254} required /></label>
      </div>
      <PermissionFields />
      <button disabled={busy || loading} className={primary}>Create viewer</button>
    </form>
    <section aria-labelledby="viewer-list" className="space-y-4">
      <h2 id="viewer-list" className="text-lg font-semibold">Viewer accounts</h2>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading accounts…</p> :
        viewers.length === 0 && !error ? <p className="text-sm text-muted-foreground">No viewer accounts yet.</p> : null}
      <div className="divide-y divide-border">{viewers.map(viewer =>
        <form key={viewer.id} onSubmit={event => update(event, viewer)} className="space-y-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{viewer.label}</h3><p className="break-all text-sm text-muted-foreground">{viewer.email}</p></div>
            <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={viewer.active} /> Access enabled</label>
          </div>
          <PermissionFields viewer={viewer} />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className={primary}>Save access</button>
            <button type="button" disabled={busy} className={button}
              onClick={() => void save({ action: "reset", id: viewer.id }, "New password generated. Previous sessions were revoked.")}>
              Reset password
            </button>
          </div>
        </form>)}</div>
    </section>
  </div>;
}
