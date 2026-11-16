import { createHash } from "node:crypto";

/** Reporting GETs only. Never use this for mutations, conversion delivery or edit authorization. */
export class MetaReportingRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Meta reporting is temporarily rate limited. Retry in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`);
    this.name = "MetaReportingRateLimitError";
  }
}
type Snapshot = { body: string; status: number; headers: [string, string][]; until: number };
type Gate = { active: number; waiting: (() => void)[]; until: number };
const snapshots = new Map<string, Snapshot>();
const pending = new Map<string, Promise<Snapshot>>();
const gates = new Map<string, Gate>();
const TTL = 60_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const toResponse = (value: Snapshot) => new Response(value.body, { status: value.status, headers: value.headers });

function cooldown(response: Response, error: { code?: number; message?: string } | undefined): number {
  const limited = response.status === 429 || [4, 17, 32, 613, 80000, 80004, 80003, 80006].includes(Number(error?.code)) ||
    /request limit|too many calls|rate limit/i.test(error?.message || "");
  if (!limited) return 0;
  const retry = response.headers.get("retry-after");
  let seconds = retry ? Number(retry) : 0;
  if (retry && !Number.isFinite(seconds)) seconds = Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
  try {
    const usage = JSON.parse(response.headers.get("x-business-use-case-usage") || "{}");
    for (const items of Object.values(usage)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const minutes = Number(item?.estimated_time_to_regain_access);
        if (Number.isFinite(minutes)) seconds = Math.max(seconds || 0, minutes * 60);
      }
    }
  } catch { /* A malformed usage header must not bypass the default cooldown. */ }
  return Math.max(60, Number.isFinite(seconds) && seconds > 0 ? seconds : 300);
}

export async function metaReportingFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com" || (init.method && init.method !== "GET") || init.body) {
    throw new Error("Meta reporting cache only accepts Graph API GET requests.");
  }
  const headers = new Headers(init.headers);
  const token = url.searchParams.get("access_token") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) throw new Error("Meta reporting credential is missing.");
  // Normalize query ordering; the full query (dates, fields, campaign filters, etc.) is part of the key.
  url.searchParams.delete("access_token");
  url.searchParams.sort();
  headers.set("Authorization", `Bearer ${token}`);
  const credentialKey = hash(token);
  const key = hash(`${credentialKey}:${url.toString()}`);
  // Editable amounts must reflect a just-saved budget/bid on the next refresh.
  const cacheable = !/daily_budget|lifetime_budget|bid_amount|bid_strategy/.test(url.searchParams.get("fields") || "");
  const cached = cacheable ? snapshots.get(key) : undefined;
  if (cached && cached.until > Date.now()) return toResponse(cached);
  if (pending.has(key)) return toResponse(await pending.get(key)!);
  let gate = gates.get(credentialKey);
  if (!gate) { gate = { active: 0, waiting: [], until: 0 }; gates.set(credentialKey, gate); }
  const state = gate;
  const promise = (async () => {
    // Two concurrent reads per credential, including across accounts sharing the same token.
    if (state.active >= 2) await new Promise<void>(resolve => state.waiting.push(resolve));
    else state.active++;
    try {
      if (state.until > Date.now()) throw new MetaReportingRateLimitError(Math.ceil((state.until - Date.now()) / 1000));
      const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const body = await response.text();
      let data: { error?: { code?: number; message?: string } } | null = null;
      try { data = JSON.parse(body); } catch { /* Invalid responses are never cached. */ }
      const delay = cooldown(response, data?.error);
      if (delay) {
        state.until = Math.max(state.until, Date.now() + delay * 1000);
        throw new MetaReportingRateLimitError(delay);
      }
      const snapshot = { body, status: response.status, headers: [...response.headers.entries()], until: Date.now() + TTL };
      if (cacheable && response.ok && data && !data.error && body.length <= 1_000_000) {
        // Bound warm-instance memory; expired snapshots are never served as fresh or as zeroes.
        for (const [id, item] of snapshots) if (item.until <= Date.now()) snapshots.delete(id);
        if (snapshots.size >= 64) snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(key, snapshot);
      }
      return snapshot;
    } finally {
      const next = state.waiting.shift();
      if (next) next(); else state.active--;
      if (!state.active && !state.waiting.length && state.until <= Date.now()) gates.delete(credentialKey);
    }
  })();
  pending.set(key, promise);
  try { return toResponse(await promise); }
  finally { if (pending.get(key) === promise) pending.delete(key); }
}
