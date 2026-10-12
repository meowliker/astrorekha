import type { MetaAccountCredential } from "@/lib/meta-ad-accounts";

const META_BASE = "https://graph.facebook.com/v21.0";
export type BudgetLevel = "campaign" | "adset";
export type BudgetType = "daily" | "lifetime";
export type MetaBudget = {
  accountId: string;
  id: string;
  level: BudgetLevel;
  name: string;
  currency: string;
  fractionDigits: number;
  type: BudgetType;
  amountMinor: number;
};

export class MetaBudgetError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type MetaResponse = {
  id?: string;
  name?: string;
  account_id?: string;
  campaign_id?: string;
  currency?: string;
  daily_budget?: string;
  lifetime_budget?: string;
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
  if (!response.ok || result.error) throw new MetaBudgetError(result.error?.message || `Meta returned HTTP ${response.status}`, response.status >= 400 && response.status < 500 ? 400 : 502);
  return result;
}

function validMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000_000;
}

export async function readMetaBudget(credential: MetaAccountCredential, level: BudgetLevel, id: string): Promise<MetaBudget> {
  const fields = level === "adset" ? "id,name,account_id,campaign_id,daily_budget,lifetime_budget" : "id,name,account_id,daily_budget,lifetime_budget";
  const [account, object] = await Promise.all([
    metaRequest(`act_${credential.accountId}?fields=currency`, credential.accessToken),
    metaRequest(`${id}?fields=${fields}`, credential.accessToken),
  ]);
  if (object.id !== id || String(object.account_id || "").replace(/^act_/, "") !== credential.accountId) {
    throw new MetaBudgetError("This Meta object does not belong to the selected ad account.", 403);
  }
  if (level === "adset" && !object.campaign_id) throw new MetaBudgetError("This is not a Meta ad set.");
  const currency = String(account.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new MetaBudgetError("Meta did not return the ad account currency.", 502);
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const type: BudgetType | null = object.daily_budget != null ? "daily" : object.lifetime_budget != null ? "lifetime" : null;
  if (!type) throw new MetaBudgetError(level === "campaign" ? "This campaign's budget is set at the ad set level. Expand it and edit an ad set." : "This ad set has no budget of its own. Edit its campaign budget instead.");
  const amountMinor = Number(type === "daily" ? object.daily_budget : object.lifetime_budget);
  if (!validMinor(amountMinor)) throw new MetaBudgetError("Meta returned an invalid budget amount.", 502);
  return { accountId: credential.accountId, id, level, name: object.name || id, currency, fractionDigits, type, amountMinor };
}

export async function changeMetaBudget(credential: MetaAccountCredential, level: BudgetLevel, id: string, expected: { type: BudgetType; amountMinor: number }, newAmountMinor: number): Promise<MetaBudget> {
  if (!validMinor(expected.amountMinor) || !validMinor(newAmountMinor)) throw new MetaBudgetError("Enter a valid positive budget amount.");
  const current = await readMetaBudget(credential, level, id);
  if (current.type !== expected.type || current.amountMinor !== expected.amountMinor) {
    throw new MetaBudgetError("The budget changed in Meta since you opened this editor. Close it and review the current amount.", 409);
  }
  if (newAmountMinor === current.amountMinor) throw new MetaBudgetError("Enter a different budget amount.");
  const body = new URLSearchParams({ [`${current.type}_budget`]: String(newAmountMinor) });
  const result = await metaRequest(id, credential.accessToken, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (result.success !== true) throw new MetaBudgetError("Meta did not confirm the budget change.", 502);
  // Read Meta again before displaying the new amount as saved.
  const updated = await readMetaBudget(credential, level, id);
  if (updated.type !== current.type || updated.amountMinor !== newAmountMinor) {
    throw new MetaBudgetError("Meta accepted the request but has not shown the new budget yet. Refresh before changing it again.", 502);
  }
  return updated;
}
