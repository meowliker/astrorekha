import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getMetaAccountCredentialsForRange, getMetaAccountDateRangeForRequest } from "@/lib/meta-ad-accounts";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const PURCHASE_ACTION_PRIORITY = [
  "website_purchase",
  "onsite_web_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];

function formatIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getMetaPresetDateRange(datePreset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endDate = formatIsoDate(today);

  if (datePreset === "today") {
    return { startDate: endDate, endDate };
  }
  if (datePreset === "yesterday") {
    const yesterday = formatIsoDate(addDays(today, -1));
    return { startDate: yesterday, endDate: yesterday };
  }
  if (datePreset === "this_month") {
    return {
      startDate: formatIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
      endDate,
    };
  }
  if (datePreset === "last_month") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
  }

  const match = datePreset.match(/^last_(\d+)d$/);
  const days = match ? Number(match[1]) : 30;
  return { startDate: formatIsoDate(addDays(today, -(Math.max(days, 1) - 1))), endDate };
}

type AccountMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  reach: number;
  frequency: number;
  linkClicks: number;
  leads: number;
  purchases: number;
  addToCart: number;
  initiateCheckout: number;
  pageViews: number;
  costPerLead: number;
  costPerPurchase: number;
  costPerLinkClick: number;
  roas: number;
};

function parseMetricNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getActionMetricValue(collection: any[], actionTypes: string[]): number {
  for (const actionType of actionTypes) {
    const hit = collection.find((row: any) => row?.action_type === actionType);
    if (hit) return parseMetricNumber(hit.value);
  }
  return 0;
}

function getRoasValue(insight: any): number {
  const roasSources = [insight?.website_purchase_roas, insight?.purchase_roas];
  for (const source of roasSources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      const prioritized = getActionMetricValue(source, PURCHASE_ACTION_PRIORITY);
      if (prioritized > 0) return prioritized;
      if (source.length > 0) {
        const fallback = parseMetricNumber(source[0]?.value);
        if (fallback > 0) return fallback;
      }
    } else {
      const parsed = parseMetricNumber(source);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

async function fetchMetaJson(url: string) {
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Meta API HTTP ${res.status}`);
  }
  return data;
}

function parseAccountMetrics(insight: any): AccountMetrics {
  const actions = insight?.actions || [];
  const costPerAction = insight?.cost_per_action_type || [];

  return {
    spend: parseMetricNumber(insight?.spend),
    impressions: parseMetricNumber(insight?.impressions),
    clicks: parseMetricNumber(insight?.clicks),
    cpc: parseMetricNumber(insight?.cpc),
    cpm: parseMetricNumber(insight?.cpm),
    ctr: parseMetricNumber(insight?.ctr),
    reach: parseMetricNumber(insight?.reach),
    frequency: parseMetricNumber(insight?.frequency),
    linkClicks: getActionMetricValue(actions, ["link_click"]),
    leads: getActionMetricValue(actions, ["lead"]),
    purchases: getActionMetricValue(actions, PURCHASE_ACTION_PRIORITY),
    addToCart: getActionMetricValue(actions, ["offsite_conversion.fb_pixel_add_to_cart"]),
    initiateCheckout: getActionMetricValue(actions, ["offsite_conversion.fb_pixel_initiate_checkout"]),
    pageViews: getActionMetricValue(actions, ["landing_page_view"]),
    costPerLead: getActionMetricValue(costPerAction, ["lead"]),
    costPerPurchase: getActionMetricValue(costPerAction, PURCHASE_ACTION_PRIORITY),
    costPerLinkClick: getActionMetricValue(costPerAction, ["link_click"]),
    roas: getRoasValue(insight),
  };
}

function mergeAccountMetrics(items: AccountMetrics[]): AccountMetrics {
  const total = items.reduce(
    (acc, item) => ({
      spend: acc.spend + item.spend,
      impressions: acc.impressions + item.impressions,
      clicks: acc.clicks + item.clicks,
      reach: acc.reach + item.reach,
      linkClicks: acc.linkClicks + item.linkClicks,
      leads: acc.leads + item.leads,
      purchases: acc.purchases + item.purchases,
      addToCart: acc.addToCart + item.addToCart,
      initiateCheckout: acc.initiateCheckout + item.initiateCheckout,
      pageViews: acc.pageViews + item.pageViews,
      weightedRoasSpend: acc.weightedRoasSpend + item.roas * item.spend,
      weightedFrequencyImpressions: acc.weightedFrequencyImpressions + item.frequency * item.impressions,
    }),
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      linkClicks: 0,
      leads: 0,
      purchases: 0,
      addToCart: 0,
      initiateCheckout: 0,
      pageViews: 0,
      weightedRoasSpend: 0,
      weightedFrequencyImpressions: 0,
    }
  );

  return {
    spend: total.spend,
    impressions: total.impressions,
    clicks: total.clicks,
    cpc: total.clicks > 0 ? total.spend / total.clicks : 0,
    cpm: total.impressions > 0 ? (total.spend / total.impressions) * 1000 : 0,
    ctr: total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0,
    reach: total.reach,
    frequency: total.impressions > 0 ? total.weightedFrequencyImpressions / total.impressions : 0,
    linkClicks: total.linkClicks,
    leads: total.leads,
    purchases: total.purchases,
    addToCart: total.addToCart,
    initiateCheckout: total.initiateCheckout,
    pageViews: total.pageViews,
    costPerLead: total.leads > 0 ? total.spend / total.leads : 0,
    costPerPurchase: total.purchases > 0 ? total.spend / total.purchases : 0,
    costPerLinkClick: total.linkClicks > 0 ? total.spend / total.linkClicks : 0,
    roas: total.spend > 0 ? total.weightedRoasSpend / total.spend : 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const datePreset = searchParams.get("datePreset") || "last_30d";
    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("id", token)
      .single();

    if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const requestedRange =
      customStartDate && customEndDate
        ? { startDate: customStartDate, endDate: customEndDate }
        : getMetaPresetDateRange(datePreset);
    const credentials = await getMetaAccountCredentialsForRange(supabase, requestedRange);

    if (credentials.length === 0) {
      return NextResponse.json({
        configured: false,
        error: "Meta Ads not configured. Add the active Meta ad account in Admin Revenue > Ad Accounts.",
      });
    }

    const accountResponses = await Promise.all(
      credentials.map(async (credential) => {
        const { accountId: adAccountId, accessToken } = credential;
        const accountDateRange = getMetaAccountDateRangeForRequest(
          credential,
          requestedRange.startDate,
          requestedRange.endDate
        );
        if (!accountDateRange) return null;
        const dateParams = `time_range={"since":"${accountDateRange.startDate}","until":"${accountDateRange.endDate}"}`;
        const accountBase = `${META_BASE_URL}/act_${adAccountId}`;
        const [insightsData, campaignsData, dailyData, activeCampaignsData, accountMeta] = await Promise.all([
          fetchMetaJson(
            `${accountBase}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,conversions,cost_per_conversion,purchase_roas,website_purchase_roas&${dateParams}&access_token=${accessToken}`
          ),
          fetchMetaJson(
            `${accountBase}/insights?fields=campaign_name,campaign_id,spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type,purchase_roas,website_purchase_roas&level=campaign&${dateParams}&limit=200&access_token=${accessToken}`
          ),
          fetchMetaJson(
            `${accountBase}/insights?fields=spend,impressions,clicks,reach,actions&time_increment=1&${dateParams}&limit=90&access_token=${accessToken}`
          ),
          fetchMetaJson(
            `${accountBase}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=200&access_token=${accessToken}`
          ),
          fetchMetaJson(`${accountBase}?fields=id,name,currency,timezone_name&access_token=${accessToken}`),
        ]);

        const accountInsights = insightsData?.data?.[0] || {};
        const metrics = parseAccountMetrics(accountInsights);

        const campaigns = (campaignsData?.data || []).map((c: any) => {
          const cActions = c.actions || [];
          const cCostPerAction = c.cost_per_action_type || [];
          return {
            name: c.campaign_name,
            id: `${adAccountId}:${c.campaign_id}`,
            campaignId: c.campaign_id,
            accountId: adAccountId,
            accountName: accountMeta?.name || `act_${adAccountId}`,
            spend: parseMetricNumber(c.spend),
            impressions: parseMetricNumber(c.impressions),
            clicks: parseMetricNumber(c.clicks),
            cpc: parseMetricNumber(c.cpc),
            ctr: parseMetricNumber(c.ctr),
            reach: parseMetricNumber(c.reach),
            leads: getActionMetricValue(cActions, ["lead"]),
            purchases: getActionMetricValue(cActions, PURCHASE_ACTION_PRIORITY),
            linkClicks: getActionMetricValue(cActions, ["link_click"]),
            costPerLead: getActionMetricValue(cCostPerAction, ["lead"]),
            costPerPurchase: getActionMetricValue(cCostPerAction, PURCHASE_ACTION_PRIORITY),
            roas: getRoasValue(c),
          };
        });

        const dailyBreakdown = (dailyData?.data || []).map((d: any) => {
          const dActions = d.actions || [];
          return {
            date: d.date_start,
            spend: parseMetricNumber(d.spend),
            impressions: parseMetricNumber(d.impressions),
            clicks: parseMetricNumber(d.clicks),
            reach: parseMetricNumber(d.reach),
            linkClicks: getActionMetricValue(dActions, ["link_click"]),
          };
        });

        const activeCampaigns = (activeCampaignsData?.data || []).map((c: any) => ({
          name: c.name,
          status: c.status,
          objective: c.objective,
          dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
          accountId: adAccountId,
          accountName: accountMeta?.name || `act_${adAccountId}`,
        }));

        return {
          accountId: adAccountId,
          accountName: credential.label || accountMeta?.name || `act_${adAccountId}`,
          accountMeta,
          metrics,
          campaigns,
          dailyBreakdown,
          activeCampaigns,
        };
      })
    );

    const validAccountResponses = accountResponses.filter(
      (item): item is Exclude<(typeof accountResponses)[number], null> => Boolean(item)
    );

    const mergedMetrics = mergeAccountMetrics(validAccountResponses.map((item) => item.metrics));
    const campaigns = validAccountResponses
      .flatMap((item) => item.campaigns)
      .sort((a, b) => b.spend - a.spend);

    const dailyByDate = new Map<
      string,
      { date: string; spend: number; impressions: number; clicks: number; reach: number; linkClicks: number }
    >();
    validAccountResponses.forEach((item) => {
      item.dailyBreakdown.forEach((row: {
        date: string;
        spend: number;
        impressions: number;
        clicks: number;
        reach: number;
        linkClicks: number;
      }) => {
        const current = dailyByDate.get(row.date) || {
          date: row.date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          linkClicks: 0,
        };
        current.spend += row.spend;
        current.impressions += row.impressions;
        current.clicks += row.clicks;
        current.reach += row.reach;
        current.linkClicks += row.linkClicks;
        dailyByDate.set(row.date, current);
      });
    });

    const dailyBreakdown = Array.from(dailyByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const activeCampaigns = validAccountResponses.flatMap((item) => item.activeCampaigns);

    return NextResponse.json({
      configured: true,
      datePreset,
      customDateRange: customStartDate && customEndDate ? { start: customStartDate, end: customEndDate } : null,
      requestedRange,
      timezone: "Ad Account Timezone (typically IST for India accounts)",
      accountCount: credentials.length,
      accountIds: credentials.map((entry) => entry.accountId),
      account: mergedMetrics,
      accounts: validAccountResponses.map((item) => ({
        id: item.accountId,
        name: item.accountName,
        metrics: item.metrics,
        campaigns: item.campaigns,
        dailyBreakdown: item.dailyBreakdown,
        activeCampaigns: item.activeCampaigns,
      })),
      campaigns,
      dailyBreakdown,
      activeCampaigns,
      activeCampaignCount: activeCampaigns.length,
    });
  } catch (error: any) {
    console.error("Meta Ads API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Meta Ads data" },
      { status: 500 }
    );
  }
}
