import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import { loadSoulmateProfitSettings } from "@/lib/soulmate-profit-settings";
import { listSoulmateCampaigns } from "@/lib/soulmate-campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// POST keeps a newly entered token out of URLs and logs. This only reads Meta.
export async function POST(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json();
    const accountId = String(body.accountId || "").trim().replace(/^act_/i, "");
    const settings = await loadSoulmateProfitSettings(db);
    const accessToken = String(body.accessToken || "").trim() || settings.accounts.find((account) => account.accountId === accountId)?.accessToken;
    if (accessToken && (accessToken.length > 4096 || /\s/.test(accessToken))) return json({ error: "Enter a valid access token." }, 400);
    return json({ campaigns: await listSoulmateCampaigns({ accountId, accessToken }) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to load campaigns." }, 400); }
}
