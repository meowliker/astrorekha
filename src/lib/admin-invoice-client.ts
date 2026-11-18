"use client";

// Short-lived, session-scoped memory only. Never persist customer evidence to storage.
const entries = new Map<string, { expires: number; promise: Promise<unknown> }>();
let activeToken = "";
const TTL = 15_000;

export async function loadAdminInvoice<T>(token: string, userId: string, txnId: string): Promise<T> {
  const expiry = localStorage.getItem("admin_session_expiry");
  if (localStorage.getItem("admin_session_token") !== token || !expiry || !(Date.parse(expiry) > Date.now())) {
    entries.clear();
    throw new Error("Session expired. Please sign in again.");
  }
  if (activeToken !== token) { entries.clear(); activeToken = token; }
  const key = JSON.stringify([userId, txnId]);
  const existing = entries.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
  const params = new URLSearchParams({ format: "json" });
  if (userId) params.set("userId", userId);
  if (txnId) params.set("txnId", txnId);
  const entry = { expires: Date.now() + TTL, promise: Promise.resolve<unknown>(null) };
  entry.promise = fetch(`/api/admin/invoice?${params}`, { cache: "no-store", headers: { "x-admin-session": token } })
    .then(async response => {
      const json = await response.json();
      if (!response.ok || !json.invoice) throw new Error(json.error || "Failed to generate invoice");
      return json.invoice;
    }).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
  if (entries.size >= 10) entries.delete(entries.keys().next().value!);
  entries.set(key, entry);
  return entry.promise as Promise<T>;
}

export function prefetchAdminInvoice(userId: string, txnId: string) {
  const token = localStorage.getItem("admin_session_token");
  if (token) void loadAdminInvoice(token, userId, txnId).catch(() => {});
}
