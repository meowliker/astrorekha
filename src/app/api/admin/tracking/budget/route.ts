import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getMetaAccountCredentialsForRange, getMetaAccountCredentialsFromEnv } from "@/lib/meta-ad-accounts";
import { changeMetaBudget, MetaBudgetError, readMetaBudget, type BudgetLevel, type BudgetType } from "@/lib/tracking-meta-budget";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const isId = (value: unknown): value is string => typeof value === "string" && /^\d{5,30}$/.test(value);
const isLevel = (value: unknown): value is BudgetLevel => value === "campaign" || value === "adset";

async function authorize(request: NextRequest, accountId: string) {
  const token = request.headers.get("x-admin-session");
  if (!token) throw new MetaBudgetError("Unauthorized", 401);
  const supabase = getSupabaseAdmin();
  const { data: session, error } = await supabase.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
  if (error || !session || new Date(session.expires_at) <= new Date()) throw new MetaBudgetError("Session expired", 401);
  // Budget edits always use an account credential active now, regardless of the dashboard date range.
  const now = Date.now();
  const range = { startMillis: now, endMillis: now + 1 };
  const configured = await getMetaAccountCredentialsForRange(supabase, range);
  const credentials = configured.length ? configured : getMetaAccountCredentialsFromEnv(range);
  const credential = credentials.find((account) => account.accountId === accountId && account.active !== false);
  if (!credential) throw new MetaBudgetError("This ad account is not currently connected for budget edits.", 403);
  return credential;
}

function respondToError(error: unknown) {
  if (error instanceof MetaBudgetError) return json({ error: error.message }, error.status);
  console.error("[admin/tracking/budget]", error instanceof Error ? error.message : error);
  return json({ error: "Unable to reach Meta for this budget." }, 502);
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const accountId = params.get("accountId");
    const id = params.get("id");
    const level = params.get("level");
    if (!isId(accountId) || !isId(id) || !isLevel(level)) return json({ error: "Choose a valid Meta campaign or ad set." }, 400);
    const credential = await authorize(request, accountId);
    return json({ budget: await readMetaBudget(credential, level, id) });
  } catch (error) { return respondToError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input || !isId(input.accountId) || !isId(input.id) || !isLevel(input.level) ||
      (input.type !== "daily" && input.type !== "lifetime") ||
      typeof input.expectedAmountMinor !== "number" || typeof input.newAmountMinor !== "number") {
      return json({ error: "Choose a valid budget change." }, 400);
    }
    const credential = await authorize(request, input.accountId);
    const budget = await changeMetaBudget(credential, input.level, input.id,
      { type: input.type as BudgetType, amountMinor: input.expectedAmountMinor }, input.newAmountMinor);
    return json({ budget });
  } catch (error) { return respondToError(error); }
}
