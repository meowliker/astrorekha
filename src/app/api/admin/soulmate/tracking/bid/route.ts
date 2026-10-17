import { assertSoulmateCampaignObject } from "@/lib/soulmate-campaigns";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { soulmateTrackingCredentials } from "@/lib/soulmate-tracking-data";
import { changeMetaBid, MetaBidError, readMetaBid } from "@/lib/tracking-meta-bid";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const isId = (value: unknown): value is string => typeof value === "string" && /^\d{5,30}$/.test(value);

async function authorize(request: NextRequest, accountId: string) {
  const token = request.headers.get("x-admin-session");
  if (!token) throw new MetaBidError("Unauthorized", 401);
  const supabase = getSupabaseAdmin();
  const { data: session, error } = await supabase.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
  if (error || !session || new Date(session.expires_at) <= new Date()) throw new MetaBidError("Session expired", 401);
  const now = Date.now();
  const range = { startMillis: now, endMillis: now + 1 };
  const credentials = await soulmateTrackingCredentials(supabase, range);
  const credential = credentials.find((account) => account.accountId === accountId && account.active !== false);
  if (!credential) throw new MetaBidError("This ad account is not currently connected for bid edits.", 403);
  return credential;
}

function respondToError(error: unknown) {
  if (error instanceof MetaBidError) return json({ error: error.message }, error.status);
  console.error("[admin/soulmate/tracking/bid]", error instanceof Error ? error.message : error);
  return json({ error: "Unable to reach Meta for this bid." }, 502);
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const accountId = params.get("accountId");
    const adsetId = params.get("adsetId");
    if (!isId(accountId) || !isId(adsetId)) return json({ error: "Choose a valid Meta ad set." }, 400);
    const credential = await authorize(request, accountId);
    await assertSoulmateCampaignObject(credential, "adset", adsetId);
    return json({ bid: await readMetaBid(credential, adsetId) });
  } catch (error) { return respondToError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input || !isId(input.accountId) || !isId(input.adsetId) ||
      typeof input.expectedAmountMinor !== "number" || typeof input.newAmountMinor !== "number") {
      return json({ error: "Choose a valid bid change." }, 400);
    }
    const credential = await authorize(request, input.accountId);
    await assertSoulmateCampaignObject(credential, "adset", input.adsetId);
    return json({ bid: await changeMetaBid(credential, input.adsetId, input.expectedAmountMinor, input.newAmountMinor) });
  } catch (error) { return respondToError(error); }
}
