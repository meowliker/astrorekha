import type { MetaAccountCredential } from "@/lib/meta-ad-accounts";

const META_BASE = "https://graph.facebook.com/v21.0";

export type MetaBid = {
  accountId: string;
  id: string;
  campaignId: string;
  name: string;
  currency: string;
  fractionDigits: number;
  amountMinor: number | null;
  strategy: string | null;
};

export class MetaBidError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type MetaResponse = {
  id?: string;
  name?: string;
  account_id?: string;
  campaign_id?: string;
  currency?: string;
  bid_amount?: string | number;
  bid_strategy?: string;
  success?: boolean;
  error?: { message?: string };
};

async function metaRequest(path: string, token: string, options?: RequestInit): Promise<MetaResponse> {
  const response = await fetch(`${META_BASE}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => ({})) as MetaResponse;
  if (!response.ok || result.error) throw new MetaBidError(result.error?.message || `Meta returned HTTP ${response.status}`, response.status >= 400 && response.status < 500 ? 400 : 502);
  return result;
}

const validMinor = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000_000;

export async function readMetaBid(credential: MetaAccountCredential, adsetId: string): Promise<MetaBid> {
  const [account, adset] = await Promise.all([
    metaRequest(`act_${credential.accountId}?fields=currency`, credential.accessToken),
    metaRequest(`${adsetId}?fields=id,name,account_id,campaign_id,bid_amount,bid_strategy`, credential.accessToken),
  ]);
  if (adset.id !== adsetId || String(adset.account_id || "").replace(/^act_/, "") !== credential.accountId || !adset.campaign_id) {
    throw new MetaBidError("This ad set does not belong to the selected ad account.", 403);
  }
  const currency = String(account.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new MetaBidError("Meta did not return the ad account currency.", 502);
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const amountMinor = adset.bid_amount == null ? null : Number(adset.bid_amount);
  if (amountMinor != null && !validMinor(amountMinor)) throw new MetaBidError("Meta returned an invalid bid amount.", 502);
  return { accountId: credential.accountId, id: adsetId, campaignId: adset.campaign_id, name: adset.name || adsetId,
    currency, fractionDigits, amountMinor, strategy: adset.bid_strategy || null };
}

export async function changeMetaBid(credential: MetaAccountCredential, adsetId: string, expectedAmountMinor: number, newAmountMinor: number): Promise<MetaBid> {
  if (!validMinor(expectedAmountMinor) || !validMinor(newAmountMinor)) throw new MetaBidError("Enter a valid positive bid amount.");
  const current = await readMetaBid(credential, adsetId);
  if (current.amountMinor == null) throw new MetaBidError("This ad set uses automatic bidding. Configure a bid in Meta before editing it here.");
  if (current.amountMinor !== expectedAmountMinor) throw new MetaBidError("The bid changed in Meta since you opened this editor. Close it and review the current amount.", 409);
  if (newAmountMinor === current.amountMinor) throw new MetaBidError("Enter a different bid amount.");
  const result = await metaRequest(adsetId, credential.accessToken, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ bid_amount: String(newAmountMinor) }),
  });
  if (result.success !== true) throw new MetaBidError("Meta did not confirm the bid change.", 502);
  const updated = await readMetaBid(credential, adsetId);
  if (updated.amountMinor !== newAmountMinor) throw new MetaBidError("Meta accepted the change but has not shown the new bid yet. Refresh before editing it again.", 502);
  return updated;
}
