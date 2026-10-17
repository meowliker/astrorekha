"use client";
import type { Answers } from "./chat-data";
import type { SessionCredentials } from "@/lib/us-soulmate-session";
const KEY = "astrorekha-us-soulmate-draft-v2";
let current: SessionCredentials | null = null;
let pending: Answers | null = null;
let inFlight: Promise<void> | null = null;
export function startSoulmateSession() {
  current = { id: crypto.randomUUID(), token: crypto.randomUUID(), revision: 0 };
  pending = null;
  try { sessionStorage.removeItem(KEY); } catch { /* In-memory saving remains available. */ }
}
function credentials() {
  if (!current) {
    try { current = JSON.parse(sessionStorage.getItem(KEY) || "null")?.session || null; } catch { /* Start a fresh session. */ }
    if (!current) startSoulmateSession();
  }
  return current!;
}
export function saveDraft(answers: Answers) {
  const session = credentials();
  session.revision++;
  pending = answers;
  try { sessionStorage.setItem(KEY, JSON.stringify({ session, answers })); } catch { /* Server saves still run. */ }
  return flushDraft();
}
export function flushDraft(): Promise<void> {
  if (inFlight) return inFlight;
  if (!pending) return Promise.resolve();
  const answers = pending;
  const session = { ...credentials() };
  pending = null;
  inFlight = fetch("/api/us/soulmate/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ session, answers }), signal: AbortSignal.timeout(10000),
  }).then((res) => { if (!res.ok) throw new Error("Draft save failed"); }).catch(() => {
    if (current?.id === session.id && !pending) pending = answers;
  }).finally(() => { inFlight = null; });
  return inFlight;
}
export function checkoutSession() { const session = credentials(); session.revision++; return { ...session }; }
