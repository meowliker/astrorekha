import type { SupabaseClient } from "@supabase/supabase-js";
import { selectedCampaignIds, type SoulmateAdAccount } from "./us-soulmate-campaigns";
import { US_SOULMATE_PROFIT_START, validProfitDate } from "./us-soulmate-profit";

export type SoulmateProfitSettings = { accounts: SoulmateAdAccount[]; exchange_rate: number | null; revision: number };
export async function loadSoulmateProfitSettings(db: SupabaseClient): Promise<SoulmateProfitSettings> {
  const { data, error } = await db.from("us_soulmate_admin_settings").select("accounts,exchange_rate,revision").eq("id", true).single();
  if (error || !data) throw new Error("Soulmate reporting tables are unavailable.");
  return { ...data, exchange_rate: 1 } as SoulmateProfitSettings;
}
// No main-flow token lookup or environment-account fallback.
export function publicSoulmateSettings(settings: SoulmateProfitSettings) {
  return { revision: settings.revision, exchangeRate: settings.exchange_rate,
    accounts: settings.accounts.map(({ accessToken, ...account }) => ({ ...account, hasAccessToken: Boolean(accessToken) })) };
}
export function validateSoulmateAccounts(input: unknown, existing: SoulmateAdAccount[]): SoulmateAdAccount[] {
  if (!Array.isArray(input) || input.length > 20) throw new Error("Use up to 20 Soulmate ad accounts.");
  const seen = new Set<string>();
  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid ad account.");
    const accountId = String(raw.accountId || "").trim().replace(/^act_/i, "");
    if (!/^\d{3,30}$/.test(accountId) || seen.has(accountId)) throw new Error("Enter a unique numeric ad account ID for each account.");
    seen.add(accountId);
    const accessToken = String(raw.accessToken || "").trim() || existing.find((a) => a.accountId === accountId)?.accessToken;
    if (!accessToken || accessToken.length > 4096 || /\s/.test(accessToken)) throw new Error("Enter a valid access token for each new account.");
    const startDate = String(raw.startDate || US_SOULMATE_PROFIT_START);
    const startTime = String(raw.startTime || "11:30");
    const active = raw.active !== false;
    const endDate = active ? undefined : String(raw.endDate || "");
    const endTime = active ? undefined : String(raw.endTime || "23:59");
    const timeValid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!validProfitDate(startDate) || startDate < US_SOULMATE_PROFIT_START || !timeValid(startTime) || (!active && (!validProfitDate(endDate!) || !timeValid(endTime!) || `${endDate}T${endTime}` <= `${startDate}T${startTime}`))) throw new Error("Use valid account dates and times, starting on or after 28 October 2026.");
    if (raw.balanceMode && !["outstanding", "remaining_spend_limit"].includes(raw.balanceMode)) throw new Error("Choose a valid balance type.");
    const campaignIds = selectedCampaignIds({ accountId, campaignIds: raw.campaignIds });
    return { accountId, accessToken, campaignIds, label: String(raw.label || "").trim().slice(0, 100), startDate, startTime, active, endDate, endTime, balanceMode: raw.balanceMode || "outstanding" };
  });
}
