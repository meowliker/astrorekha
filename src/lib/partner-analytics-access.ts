import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const viewerTable = "partner_analytics_viewers";
export const viewerSessionTable = "partner_analytics_sessions";
export const viewerCookie = "ar_partner_analytics";
export const viewerSessionSeconds = 12 * 60 * 60;
export const viewerFields = "id,email,label,active,traffic,purchases,revenue,channels,created_at";
export const newViewerPassword = () => randomBytes(24).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const validViewerId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type ViewerPermissions = { traffic: boolean; purchases: boolean; revenue: boolean; channels: boolean };
export type ViewerAccount = ViewerPermissions & { id: string; email: string; label: string; active: boolean; created_at: string };
type Viewer = ViewerPermissions & { id: string; label: string; active: boolean; session_version: number };

export function normalizeViewerEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function viewerPermissions(input: ViewerPermissions): ViewerPermissions {
  return { traffic: input.traffic === true, purchases: input.purchases === true, revenue: input.revenue === true, channels: input.channels === true };
}

export function sameViewerOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function readAnalyticsViewer(request: NextRequest) {
  const token = request.cookies.get(viewerCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getSupabaseAdmin({ fresh: true });
  const session = await db.from(viewerSessionTable).select("viewer_id,session_version")
    .eq("token_hash", digest(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (session.error) throw new Error("Viewer session unavailable");
  if (!session.data) return null;
  const current = await db.from(viewerTable).select("id,label,active,session_version,traffic,purchases,revenue,channels")
    .eq("id", session.data.viewer_id).eq("active", true).maybeSingle();
  if (current.error) throw new Error("Viewer account unavailable");
  const viewer = current.data as Viewer | null;
  return viewer?.session_version === session.data.session_version ? viewer : null;
}

export async function viewerLogin(request: NextRequest, email: string, password: string) {
  const db = getSupabaseAdmin({ fresh: true });
  const network = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 100) || "local";
  for (const [bucket, limit] of [[`ip:${network}`, 30], [`email:${email}`, 8]] as const) {
    const result = await db.rpc("allow_partner_analytics_login", { p_key: digest(bucket), p_limit: limit });
    if (result.error) throw new Error("Login temporarily unavailable");
    if (result.data !== true) return { status: 429 as const };
  }
  const result = await db.from(viewerTable).select("id,active,password_hash,session_version").eq("email", email).maybeSingle();
  if (result.error) throw new Error("Login temporarily unavailable");
  const account = result.data;
  const matches = timingSafeEqual(Buffer.from(digest(password), "hex"), Buffer.from(account?.password_hash || "0".repeat(64), "hex"));
  if (!matches || !account?.active) return { status: 401 as const };
  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + viewerSessionSeconds * 1000).toISOString();
  const saved = await db.from(viewerSessionTable).insert({
    token_hash: digest(token), viewer_id: account.id, session_version: account.session_version, expires_at: expiry,
  });
  if (saved.error) throw new Error("Unable to save viewer session");
  await db.from(viewerSessionTable).delete().lt("expires_at", new Date().toISOString());
  return { status: 200 as const, token };
}

export async function viewerLogout(request: NextRequest) {
  const token = request.cookies.get(viewerCookie)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { error } = await getSupabaseAdmin({ fresh: true }).from(viewerSessionTable).delete().eq("token_hash", digest(token));
    if (error) throw new Error("Unable to close viewer session");
  }
}
