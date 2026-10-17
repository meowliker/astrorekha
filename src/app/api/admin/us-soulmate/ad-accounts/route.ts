import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/us-soulmate-admin";
import { assertUSAdAccountIsolation } from "@/lib/us-soulmate-account-isolation";
import { loadSoulmateProfitSettings, publicSoulmateSettings, validateSoulmateAccounts } from "@/lib/us-soulmate-profit-settings";
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
    await assertUSAdAccountIsolation(db, accounts);
    const rate = 1;
    if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1000)) return json({ error: "Enter a positive USD to USD rate." }, 400);
    const { data, error } = await db.rpc("save_us_soulmate_profit_settings", { p_revision: settings.revision, p_accounts: accounts, p_rate: rate });
    if (error) return json({ error: "Settings changed or could not be saved. Reload and try again." }, 409);
    return json(publicSoulmateSettings({ accounts, exchange_rate: rate, revision: data }));
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to save ad accounts." }, 400); }
}
