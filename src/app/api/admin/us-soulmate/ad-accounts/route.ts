import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/us-soulmate-admin";
import { loadSoulmateProfitSettings, publicSoulmateSettings, validateSoulmateAccounts } from "@/lib/us-soulmate-profit-settings";
import { listSoulmateCampaigns } from "@/lib/us-soulmate-campaigns";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  try { return json(publicSoulmateSettings(await loadSoulmateProfitSettings(db))); }
  catch { return json({ error: "Unable to load US Soulmate ad accounts." }, 503); }
}
export async function PUT(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json();
    const settings = await loadSoulmateProfitSettings(db);
    if (body.revision !== settings.revision) return json({ error: "Settings changed. Reload and try again." }, 409);
    const accounts = body.accounts === undefined ? settings.accounts : validateSoulmateAccounts(body.accounts, settings.accounts);
    if (body.accounts !== undefined) for (const account of accounts) {
      const available = new Set((await listSoulmateCampaigns(account)).map((campaign) => campaign.id));
      if (account.campaignIds!.some((id) => !available.has(id))) return json({ error: "A selected campaign is unavailable in its ad account. Reload campaigns and select again." }, 400);
    }
    const rate = 1;
    const { data, error } = await db.rpc("save_us_soulmate_profit_settings", { p_revision: settings.revision, p_accounts: accounts, p_rate: rate });
    if (error) return json({ error: "Settings changed or could not be saved. Reload and try again." }, 409);
    return json(publicSoulmateSettings({ accounts, exchange_rate: rate, revision: data }));
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to save ad accounts." }, 400); }
}
