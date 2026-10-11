import type { MetaAccountCredential } from "@/lib/meta-ad-accounts";
import type { TrackingCampaign } from "@/lib/tracking-dashboard";

const META_BASE = "https://graph.facebook.com/v21.0";
const PURCHASE_ACTIONS = ["website_purchase", "onsite_web_purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"];

type MetaAction = { action_type?: string; value?: string | number };
type MetaInsight = {
  campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string;
  reach?: string; clicks?: string; inline_link_clicks?: string;
  actions?: MetaAction[]; action_values?: MetaAction[];
};
type MetaCampaign = {
  id: string; name?: string; objective?: string; effective_status?: string;
  daily_budget?: string; lifetime_budget?: string;
};
type MetaPage<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const action = (items: MetaAction[] | undefined, kinds: string[]) => {
  for (const kind of kinds) {
    const found = items?.find((item) => item.action_type === kind);
    if (found) return number(found.value);
  }
  return 0;
};

async function metaJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    // Never include the request URL: it contains the server-side Meta access token.
    throw new Error(String(payload?.error?.message || `Meta HTTP ${response.status}`));
  }
  return payload as T;
}

async function collectPages<T>(url: string, limitPages: number): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let next: string | undefined = url;
  let pages = 0;
  while (next && pages < limitPages) {
    pages++;
    const payload: MetaPage<T> = await metaJson<MetaPage<T>>(next);
    rows.push(...(payload.data || []));
    next = payload.paging?.next;
  }
  return { rows, truncated: Boolean(next) };
}

export async function fetchMetaTrackingAccount(
  credential: MetaAccountCredential,
  dates: { start: string; end: string },
  usdInrRate: number
): Promise<{
  account: { id: string; name: string; currency: string; timezone: string | null; error?: string };
  campaigns: TrackingCampaign[];
  warnings: string[];
}> {
  const accountId = credential.accountId;
  const accountUrl = `${META_BASE}/act_${accountId}`;
  const fallbackName = credential.label || `Ad account ${accountId}`;

  try {
    const metadata = await metaJson<{ name?: string; currency?: string; timezone_name?: string }>(
      `${accountUrl}?${new URLSearchParams({ access_token: credential.accessToken, fields: "name,currency,timezone_name" })}`
    );
    const currency = String(metadata.currency || "INR").toUpperCase();
    const accountName = metadata.name || fallbackName;
    const account = { id: accountId, name: accountName, currency, timezone: metadata.timezone_name || null };

    const insightParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values",
      level: "campaign",
      time_range: JSON.stringify({ since: dates.start, until: dates.end }),
      limit: "200",
    });
    const campaignParams = new URLSearchParams({
      access_token: credential.accessToken,
      fields: "id,name,objective,effective_status,daily_budget,lifetime_budget",
      limit: "200",
    });
    const [insights, metadataRows] = await Promise.all([
      collectPages<MetaInsight>(`${accountUrl}/insights?${insightParams}`, 20),
      collectPages<MetaCampaign>(`${accountUrl}/campaigns?${campaignParams}`, 20),
    ]);
    const warnings: string[] = [];
    if (insights.truncated) warnings.push(`${accountName}: Meta insights exceeded 4,000 campaigns; narrow the date range.`);
    if (metadataRows.truncated) warnings.push(`${accountName}: campaign metadata exceeded 4,000 rows; some statuses may be missing.`);
    const byId = new Map<string, TrackingCampaign>();

    function baseCampaign(id: string, name: string): TrackingCampaign {
      return {
        key: `meta:${accountId}:${id}`, accountId, accountName, currency,
        campaignId: id, campaignName: name, objective: null, status: null,
        dailyBudget: null, lifetimeBudget: null,
        spend: 0, spendInr: currency === "INR" || currency === "USD" ? 0 : null,
        impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
        landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0,
        metaPurchaseValue: 0, leads: 0, orders: 0, grossRevenue: 0,
        refunds: 0, refundAmount: 0, revenue: 0,
        utmSources: [], utmMediums: [], utmTerms: [], utmContents: [],
        attribution: "none", adBreakdown: [],
      };
    }

    for (const campaign of metadataRows.rows) {
      if (!campaign.id) continue;
      const row = baseCampaign(campaign.id, campaign.name || campaign.id);
      row.objective = campaign.objective || null;
      row.status = campaign.effective_status || null;
      row.dailyBudget = campaign.daily_budget ? number(campaign.daily_budget) / 100 : null;
      row.lifetimeBudget = campaign.lifetime_budget ? number(campaign.lifetime_budget) / 100 : null;
      byId.set(campaign.id, row);
    }

    for (const insight of insights.rows) {
      const id = String(insight.campaign_id || "").trim();
      if (!id) continue;
      const row = byId.get(id) || baseCampaign(id, insight.campaign_name || id);
      row.campaignName = insight.campaign_name || row.campaignName;
      row.spend += number(insight.spend);
      row.spendInr = currency === "INR" ? row.spend : currency === "USD" ? row.spend * usdInrRate : null;
      row.impressions += number(insight.impressions);
      row.reach += number(insight.reach);
      row.clicks += number(insight.clicks);
      row.linkClicks += number(insight.inline_link_clicks);
      row.landingPageViews += action(insight.actions, ["landing_page_view"]);
      row.addToCarts += action(insight.actions, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"]);
      row.checkouts += action(insight.actions, ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"]);
      row.metaPurchases += action(insight.actions, PURCHASE_ACTIONS);
      row.metaPurchaseValue += action(insight.action_values, PURCHASE_ACTIONS);
      row.leads += action(insight.actions, ["lead", "offsite_conversion.fb_pixel_lead"]);
      byId.set(id, row);
    }
    return { account, campaigns: Array.from(byId.values()), warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta request failed";
    return { account: { id: accountId, name: fallbackName, currency: "INR", timezone: null, error: message }, campaigns: [], warnings: [`${fallbackName}: ${message}`] };
  }
}
