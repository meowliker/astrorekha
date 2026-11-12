import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SupportError } from "./policy";
export const db = () => getSupabaseAdmin({ fresh: true });
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "support";
  kind: "browser" | "api";
  tokenHash: string;
};
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Support database operation failed");
  return result.data;
}
export async function audit(
  actor: string | null,
  event: string,
  target?: string,
  detail: Record<string, unknown> = {},
) {
  checked(
    await db()
      .from("support_audit")
      .insert({ actor_id: actor, event, target, detail }),
  );
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin)
    throw new SupportError(
      "Open the support workspace on this website to continue",
      403,
    );
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const allowed = checked(
    await db().rpc("support_rate_limit", {
      p_key: digest(key),
      p_limit: limit,
      p_seconds: seconds,
    }),
  );
  if (!allowed)
    throw new SupportError("Too many attempts. Please try again later.", 429);
}
export async function actorFor(request: NextRequest): Promise<Actor> {
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ar_support_")
    ? bearer.slice(7)
    : request.cookies.get("ar_support")?.value;
  if (!token) throw new SupportError("Sign in to the support workspace", 401);
  const hash = digest(token);
  const session = checked(
    await db()
      .from("support_sessions")
      .select("staff_id,kind,expires_at")
      .eq("token_hash", hash)
      .maybeSingle(),
  );
  if (
    !session ||
    !["browser", "api"].includes(session.kind) ||
    Date.parse(session.expires_at) <= Date.now() ||
    (bearer && session.kind !== "api")
  )
    throw new SupportError("Session expired", 401);
  const staff = checked(
    await db()
      .from("support_staff")
      .select("id,name,email,role,active")
      .eq("id", session.staff_id)
      .maybeSingle(),
  );
  if (!staff?.active) throw new SupportError("Staff access is disabled", 403);
  if (request.method !== "GET" && session.kind === "browser")
    sameOrigin(request);
  await rateLimit(`staff:${staff.id}`, 180, 60);
  return { ...staff, kind: session.kind, tokenHash: hash };
}
export async function issueToken(
  staffId: string,
  kind: "browser" | "api" | "invite",
  name = "",
) {
  const token = `ar_support_${randomBytes(32).toString("hex")}`;
  const lifetime =
    kind === "api" ? 30 * 86400 : kind === "invite" ? 86400 : 8 * 3600;
  checked(
    await db()
      .from("support_sessions")
      .insert({
        staff_id: staffId,
        token_hash: digest(token),
        kind,
        name,
        expires_at: new Date(Date.now() + lifetime * 1000).toISOString(),
      }),
  );
  return { token, lifetime };
}
