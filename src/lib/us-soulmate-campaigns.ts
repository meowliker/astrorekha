import type { MetaAccountCredential, MetaAdAccountSettingsRow } from "./meta-ad-accounts";

export type SoulmateAdAccount = MetaAdAccountSettingsRow & { campaignIds?: string[] };
export type SoulmateCredential = MetaAccountCredential & { campaignIds: string[] };
export type SoulmateCampaign = { id: string; name: string; status?: string };
export class SoulmateCampaignSelectionError extends Error {}
export class SoulmateCampaignAccessError extends Error {}

export function selectedCampaignIds(account: SoulmateAdAccount): string[] {
  if (!Array.isArray(account.campaignIds) || !account.campaignIds.length || account.campaignIds.length > 100 ||
      account.campaignIds.some((id) => typeof id !== "string" || !/^\d{5,30}$/.test(id))) {
    throw new SoulmateCampaignSelectionError(`Select the US Soulmate campaigns for ${account.label || account.accountId} in Campaigns before loading ad performance.`);
  }
  return [...new Set(account.campaignIds)];
}

export function campaignInsightFilter(account: SoulmateAdAccount): string {
  return JSON.stringify([{ field: "campaign.id", operator: "IN", value: selectedCampaignIds(account) }]);
}

async function metaRead(path: string, token: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/v21.0/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) throw new Error("Unable to read Meta campaigns. Check this account’s token and ads_read permission.");
  return data;
}

export async function listSoulmateCampaigns(account: SoulmateAdAccount): Promise<SoulmateCampaign[]> {
  if (!/^\d{3,30}$/.test(account.accountId) || !account.accessToken) throw new Error("Enter an ad account ID and access token first.");
  const rows: SoulmateCampaign[] = [];
  let after = "";
  for (let page = 0; page < 100; page++) {
    const data = await metaRead(`act_${account.accountId}/campaigns`, account.accessToken, {
      fields: "id,name,effective_status", limit: "200", ...(after ? { after } : {}),
    });
    if (!Array.isArray(data.data)) throw new Error("Meta returned incomplete campaign data.");
    rows.push(...data.data.map((row: { id: string; name: string; effective_status?: string }) => ({ id: row.id, name: row.name, status: row.effective_status })));
    if (!data.paging?.next) return rows;
    const cursor = data.paging?.cursors?.after;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  throw new Error("Could not load all Meta campaigns. Try again.");
}

/** Resolve an ad set's parent too: account ownership alone is insufficient on shared accounts. */
export async function assertSoulmateCampaignObject(credential: SoulmateCredential, level: "campaign" | "adset", id: string) {
  const allowed = selectedCampaignIds(credential);
  if (level === "campaign" && !allowed.includes(id)) throw new SoulmateCampaignAccessError("This campaign is not selected for US Soulmate.");
  const object = await metaRead(id, credential.accessToken, { fields: level === "campaign" ? "id,account_id" : "id,account_id,campaign_id" });
  const campaignId = level === "campaign" ? id : object.campaign_id;
  if (object.id !== id || String(object.account_id) !== credential.accountId || !allowed.includes(campaignId)) {
    throw new SoulmateCampaignAccessError("This object is not in a selected US Soulmate campaign.");
  }
}
