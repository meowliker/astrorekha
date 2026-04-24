import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const datePreset = searchParams.get("datePreset") || "last_30d";
    const customStartDate = searchParams.get("startDate"); // YYYY-MM-DD
    const customEndDate = searchParams.get("endDate");     // YYYY-MM-DD

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin session
    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("*")
      .eq("id", token)
      .single();

    if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const metaAccessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!metaAccessToken || !adAccountId) {
      return NextResponse.json({
        configured: false,
        error: "Meta Ads not configured. Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to environment variables.",
      });
    }

    // Build date range params - use custom dates if provided, otherwise use preset
    let dateParams: string;
    if (customStartDate && customEndDate) {
      dateParams = `time_range={"since":"${customStartDate}","until":"${customEndDate}"}`;
    } else {
      dateParams = `date_preset=${datePreset}`;
    }

    // Fetch account-level insights
    const insightsUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,conversions,cost_per_conversion,purchase_roas,website_purchase_roas&${dateParams}&access_token=${metaAccessToken}`;
    
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    if (insightsData.error) {
      return NextResponse.json({
        configured: true,
        error: `Meta API Error: ${insightsData.error.message}`,
        errorType: insightsData.error.type,
        errorCode: insightsData.error.code,
      });
    }

    // Fetch campaign-level breakdown
    const campaignsUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=campaign_name,campaign_id,spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type,purchase_roas,website_purchase_roas&level=campaign&${dateParams}&limit=50&access_token=${metaAccessToken}`;

    const campaignsRes = await fetch(campaignsUrl);
    const campaignsData = await campaignsRes.json();

    // Fetch daily breakdown for chart
    const dailyUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=spend,impressions,clicks,reach,actions&time_increment=1&${dateParams}&limit=90&access_token=${metaAccessToken}`;

    const dailyRes = await fetch(dailyUrl);
    const dailyData = await dailyRes.json();

    // Fetch active campaigns count
    const activeCampaignsUrl = `${META_BASE_URL}/act_${adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=50&access_token=${metaAccessToken}`;

    const activeCampaignsRes = await fetch(activeCampaignsUrl);
    const activeCampaignsData = await activeCampaignsRes.json();

    // Parse account insights
    const accountInsights = insightsData.data?.[0] || {};
    
    // Extract key actions (purchases, leads, etc.)
    const actions = accountInsights.actions || [];
    const costPerAction = accountInsights.cost_per_action_type || [];

    const getActionValue = (actionTypes: string[]) => {
      return getActionMetricValue(actions, actionTypes);
    };

    const getCostPerAction = (actionTypes: string[]) => {
      return getActionMetricValue(costPerAction, actionTypes);
    };

    // Parse campaign insights
    const campaigns = (campaignsData.data || []).map((c: any) => {
      const cActions = c.actions || [];
      const cCostPerAction = c.cost_per_action_type || [];
      
      const getCampaignAction = (actionTypes: string[]) => {
        return getActionMetricValue(cActions, actionTypes);
      };

      const getCampaignCPA = (actionTypes: string[]) => {
        return getActionMetricValue(cCostPerAction, actionTypes);
      };

      return {
        name: c.campaign_name,
        id: c.campaign_id,
        spend: parseFloat(c.spend || "0"),
        impressions: parseInt(c.impressions || "0"),
        clicks: parseInt(c.clicks || "0"),
        cpc: parseFloat(c.cpc || "0"),
        ctr: parseFloat(c.ctr || "0"),
        reach: parseInt(c.reach || "0"),
        leads: getCampaignAction(["lead"]),
        purchases: getCampaignAction(PURCHASE_ACTION_PRIORITY),
        linkClicks: getCampaignAction(["link_click"]),
        costPerLead: getCampaignCPA(["lead"]),
        costPerPurchase: getCampaignCPA(PURCHASE_ACTION_PRIORITY),
        roas: getRoasValue(c),
      };
    });

    // Parse daily data for chart
    const dailyBreakdown = (dailyData.data || []).map((d: any) => {
      const dActions = d.actions || [];
      const getLinkClicks = () => {
        const action = dActions.find((a: any) => a.action_type === "link_click");
        return action ? parseInt(action.value) : 0;
      };

      return {
        date: d.date_start,
        spend: parseFloat(d.spend || "0"),
        impressions: parseInt(d.impressions || "0"),
        clicks: parseInt(d.clicks || "0"),
        reach: parseInt(d.reach || "0"),
        linkClicks: getLinkClicks(),
      };
    });

    // Active campaigns
    const activeCampaigns = (activeCampaignsData.data || []).map((c: any) => ({
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
      lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
    }));

    return NextResponse.json({
      configured: true,
      datePreset,
      customDateRange: customStartDate && customEndDate ? { start: customStartDate, end: customEndDate } : null,
      timezone: "Ad Account Timezone (typically IST for India accounts)",
      account: {
        spend: parseFloat(accountInsights.spend || "0"),
        impressions: parseInt(accountInsights.impressions || "0"),
        clicks: parseInt(accountInsights.clicks || "0"),
        cpc: parseFloat(accountInsights.cpc || "0"),
        cpm: parseFloat(accountInsights.cpm || "0"),
        ctr: parseFloat(accountInsights.ctr || "0"),
        reach: parseInt(accountInsights.reach || "0"),
        frequency: parseFloat(accountInsights.frequency || "0"),
        // Key conversion actions
        linkClicks: getActionValue(["link_click"]),
        leads: getActionValue(["lead"]),
        purchases: getActionValue(PURCHASE_ACTION_PRIORITY),
        addToCart: getActionValue(["offsite_conversion.fb_pixel_add_to_cart"]),
        initiateCheckout: getActionValue(["offsite_conversion.fb_pixel_initiate_checkout"]),
        pageViews: getActionValue(["landing_page_view"]),
        // Cost per action
        costPerLead: getCostPerAction(["lead"]),
        costPerPurchase: getCostPerAction(PURCHASE_ACTION_PRIORITY),
        costPerLinkClick: getCostPerAction(["link_click"]),
        roas: getRoasValue(accountInsights),
      },
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
