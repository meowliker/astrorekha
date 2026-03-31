import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import { classifyPayUEvent } from "@/lib/finance-events";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const PAYU_BASE_URL = "https://info.payu.in/merchant/postservice?form=2";

// Generate SHA-512 hash for PayU
function generateHash(input: string): string {
  return crypto.createHash("sha512").update(input).digest("hex");
}

interface PayUTransaction {
  txnid: string;
  amount: string;
  status: string;
  addedon: string;
  net_amount_debit?: string;
  field9?: string;
  error_Message?: string;
  unmappedstatus?: string;
}

// Fetch PayU transactions for a date range
async function fetchPayUTransactions(fromDate: string, toDate: string): Promise<PayUTransaction[]> {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    console.log("PayU credentials not configured");
    return [];
  }

  const command = "get_Transaction_Details";
  const hashString = `${merchantKey}|${command}|${fromDate}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", fromDate);
  formData.append("var2", toDate);
  formData.append("hash", hash);

  try {
    const response = await fetch(PAYU_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formData.toString(),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return [];
    }

    if (data.status === 1 && data.Transaction_details) {
      const allTxns = Array.isArray(data.Transaction_details) 
        ? data.Transaction_details 
        : Object.values(data.Transaction_details);
      
      const financialTxns = allTxns.filter((txn: any) => {
        const financial = classifyPayUEvent(txn as Record<string, unknown>);
        return financial.kind !== "ignore";
      });

      console.log(`PayU: ${allTxns.length} total, ${financialTxns.length} financial`);
      if (financialTxns.length > 0) {
        console.log(`First financial txn amount: ${financialTxns[0].amount}`);
      }

      return financialTxns;
    }
  } catch (err) {
    console.error("PayU fetch error:", err);
  }

  return [];
}

// Calculate date range from preset
function getDateRangeFromPreset(preset: string): { startDate: string; endDate: string } {
  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  
  let startDate: Date;
  let endDate: Date = today;

  switch (preset) {
    case "today":
      startDate = today;
      break;
    case "yesterday":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      endDate = startDate;
      break;
    case "last_3d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 2);
      break;
    case "last_7d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);
      break;
    case "last_14d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 13);
      break;
    case "last_30d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);
      break;
    case "last_60d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 59);
      break;
    case "last_90d":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 89);
      break;
    case "this_week":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      break;
    case "last_week":
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - startDate.getDay() - 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      break;
    case "this_month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "last_month":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case "this_quarter":
      const currentQuarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
      break;
    case "last_quarter":
      const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
      const lastQuarterYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const adjustedQuarter = lastQuarter < 0 ? 3 : lastQuarter;
      startDate = new Date(lastQuarterYear, adjustedQuarter * 3, 1);
      endDate = new Date(lastQuarterYear, adjustedQuarter * 3 + 3, 0);
      break;
    case "this_year":
      startDate = new Date(today.getFullYear(), 0, 1);
      break;
    case "last_year":
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;
    case "maximum":
      startDate = new Date("2024-01-01");
      break;
    default:
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);
  }

  return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
}

interface AdMetrics {
  id: string;
  name: string;
  status: string;
  spend: number;
  budget: number | null;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  purchases: number;
  costPerPurchase: number;
  reach: number;
}

interface AdSetData extends AdMetrics {
  ads: AdMetrics[];
}

interface CampaignData extends AdMetrics {
  adsets: AdSetData[];
}

// Fetch exchange rate
async function fetchExchangeRate(): Promise<number> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await response.json();
    return data.rates?.INR || 85;
  } catch {
    return 85;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const datePreset = searchParams.get("datePreset") || "last_7d";
    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");
    const customExchangeRate = searchParams.get("exchangeRate");

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
        error: "Meta Ads not configured",
      });
    }

    // Get exchange rate
    const exchangeRate = customExchangeRate ? parseFloat(customExchangeRate) : await fetchExchangeRate();

    // Calculate actual date range for PayU
    let actualStartDate: string;
    let actualEndDate: string;
    
    if (customStartDate && customEndDate) {
      actualStartDate = customStartDate;
      actualEndDate = customEndDate;
    } else {
      const dateRange = getDateRangeFromPreset(datePreset);
      actualStartDate = dateRange.startDate;
      actualEndDate = dateRange.endDate;
    }

    // Fetch PayU transactions for the date range to get actual revenue
    console.log(`Fetching PayU transactions from ${actualStartDate} to ${actualEndDate}`);
    const payuTransactions = await fetchPayUTransactions(actualStartDate, actualEndDate);
    
    // Debug: log first transaction to see field names
    if (payuTransactions.length > 0) {
      console.log("Sample PayU transaction:", JSON.stringify(payuTransactions[0]));
    }
    
    const classifiedPayu = payuTransactions
      .map((txn: any) => ({
        txn,
        financial: classifyPayUEvent(txn as Record<string, unknown>),
      }))
      .filter((row) => row.financial.kind !== "ignore");

    const grossRevenue = classifiedPayu
      .filter((row) => row.financial.kind === "sale")
      .reduce((sum, row) => sum + row.financial.amount, 0);
    const refundAmount = classifiedPayu
      .filter((row) => row.financial.kind === "refund")
      .reduce((sum, row) => sum + row.financial.amount, 0);
    const totalRevenue = grossRevenue - refundAmount;
    const totalSales = classifiedPayu.filter((row) => row.financial.kind === "sale").length;
    const totalRefunds = classifiedPayu.filter((row) => row.financial.kind === "refund").length;
    console.log(`PayU: ${totalSales} sales, ₹${totalRevenue.toFixed(2)} revenue`);

    // Build date range params for Meta
    let dateParams: string;
    if (customStartDate && customEndDate) {
      dateParams = `time_range={"since":"${customStartDate}","until":"${customEndDate}"}`;
    } else {
      dateParams = `date_preset=${datePreset}`;
    }

    // Fields to fetch for insights
    const insightFields = "spend,impressions,clicks,cpc,cpm,ctr,reach,actions,cost_per_action_type";

    // 1. Fetch all campaigns with their insights
    const campaignsUrl = `${META_BASE_URL}/act_${adAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget&limit=100&access_token=${metaAccessToken}`;
    const campaignsRes = await fetch(campaignsUrl);
    const campaignsData = await campaignsRes.json();

    if (campaignsData.error) {
      return NextResponse.json({
        configured: true,
        error: `Meta API Error: ${campaignsData.error.message}`,
      });
    }

    // 2. Fetch campaign-level insights
    const campaignInsightsUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=campaign_id,campaign_name,${insightFields}&level=campaign&${dateParams}&limit=100&access_token=${metaAccessToken}`;
    const campaignInsightsRes = await fetch(campaignInsightsUrl);
    const campaignInsightsData = await campaignInsightsRes.json();

    // 3. Fetch adset-level insights
    const adsetInsightsUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=adset_id,adset_name,campaign_id,${insightFields}&level=adset&${dateParams}&limit=500&access_token=${metaAccessToken}`;
    const adsetInsightsRes = await fetch(adsetInsightsUrl);
    const adsetInsightsData = await adsetInsightsRes.json();

    // 4. Fetch ad-level insights
    const adInsightsUrl = `${META_BASE_URL}/act_${adAccountId}/insights?fields=ad_id,ad_name,adset_id,campaign_id,${insightFields}&level=ad&${dateParams}&limit=500&access_token=${metaAccessToken}`;
    const adInsightsRes = await fetch(adInsightsUrl);
    const adInsightsData = await adInsightsRes.json();

    // 5. Fetch adsets with budget info
    const adsetsUrl = `${META_BASE_URL}/act_${adAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget&limit=500&access_token=${metaAccessToken}`;
    const adsetsRes = await fetch(adsetsUrl);
    const adsetsData = await adsetsRes.json();

    // 6. Fetch ads with status
    const adsUrl = `${META_BASE_URL}/act_${adAccountId}/ads?fields=id,name,status,adset_id&limit=500&access_token=${metaAccessToken}`;
    const adsRes = await fetch(adsUrl);
    const adsData = await adsRes.json();

    // Helper to extract metrics from insights
    const extractMetrics = (insight: any) => {
      const actions = insight?.actions || [];
      const costPerAction = insight?.cost_per_action_type || [];

      const getPurchases = () => {
        const purchase = actions.find((a: any) => 
          a.action_type === "purchase" || 
          a.action_type === "offsite_conversion.fb_pixel_purchase"
        );
        return purchase ? parseInt(purchase.value) : 0;
      };

      const getCostPerPurchase = () => {
        const cpa = costPerAction.find((a: any) => 
          a.action_type === "purchase" || 
          a.action_type === "offsite_conversion.fb_pixel_purchase"
        );
        return cpa ? parseFloat(cpa.value) : 0;
      };

      return {
        spend: parseFloat(insight?.spend || "0"),
        impressions: parseInt(insight?.impressions || "0"),
        clicks: parseInt(insight?.clicks || "0"),
        cpc: parseFloat(insight?.cpc || "0"),
        cpm: parseFloat(insight?.cpm || "0"),
        ctr: parseFloat(insight?.ctr || "0"),
        reach: parseInt(insight?.reach || "0"),
        purchases: getPurchases(),
        costPerPurchase: getCostPerPurchase(),
      };
    };

    // Create lookup maps
    const campaignInsightsMap = new Map();
    (campaignInsightsData.data || []).forEach((c: any) => {
      campaignInsightsMap.set(c.campaign_id, c);
    });

    const adsetInsightsMap = new Map();
    (adsetInsightsData.data || []).forEach((a: any) => {
      adsetInsightsMap.set(a.adset_id, a);
    });

    const adInsightsMap = new Map();
    (adInsightsData.data || []).forEach((a: any) => {
      adInsightsMap.set(a.ad_id, a);
    });

    const adsetInfoMap = new Map();
    (adsetsData.data || []).forEach((a: any) => {
      adsetInfoMap.set(a.id, a);
    });

    const adInfoMap = new Map();
    (adsData.data || []).forEach((a: any) => {
      adInfoMap.set(a.id, a);
    });

    // Group adsets by campaign
    const adsetsByCampaign = new Map<string, any[]>();
    (adsetsData.data || []).forEach((adset: any) => {
      const campaignId = adset.campaign_id;
      if (!adsetsByCampaign.has(campaignId)) {
        adsetsByCampaign.set(campaignId, []);
      }
      adsetsByCampaign.get(campaignId)!.push(adset);
    });

    // Group ads by adset
    const adsByAdset = new Map<string, any[]>();
    (adsData.data || []).forEach((ad: any) => {
      const adsetId = ad.adset_id;
      if (!adsByAdset.has(adsetId)) {
        adsByAdset.set(adsetId, []);
      }
      adsByAdset.get(adsetId)!.push(ad);
    });

    // Build hierarchical structure
    const campaigns: CampaignData[] = (campaignsData.data || []).map((campaign: any) => {
      const campaignInsight = campaignInsightsMap.get(campaign.id);
      const metrics = extractMetrics(campaignInsight);
      
      const budget = campaign.daily_budget 
        ? parseFloat(campaign.daily_budget) / 100 
        : (campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null);

      // Get adsets for this campaign
      const campaignAdsets = adsetsByCampaign.get(campaign.id) || [];
      
      const adsets: AdSetData[] = campaignAdsets.map((adset: any) => {
        const adsetInsight = adsetInsightsMap.get(adset.id);
        const adsetMetrics = extractMetrics(adsetInsight);
        
        const adsetBudget = adset.daily_budget 
          ? parseFloat(adset.daily_budget) / 100 
          : (adset.lifetime_budget ? parseFloat(adset.lifetime_budget) / 100 : null);

        // Get ads for this adset
        const adsetAds = adsByAdset.get(adset.id) || [];
        
        const ads: AdMetrics[] = adsetAds.map((ad: any) => {
          const adInsight = adInsightsMap.get(ad.id);
          const adMetrics = extractMetrics(adInsight);
          
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            budget: null,
            ...adMetrics,
          };
        });

        return {
          id: adset.id,
          name: adset.name,
          status: adset.status,
          budget: adsetBudget,
          ...adsetMetrics,
          ads,
        };
      });

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        budget,
        ...metrics,
        adsets,
      };
    });

    // Sort campaigns by spend (highest first)
    campaigns.sort((a, b) => b.spend - a.spend);

    // Calculate totals
    const totals = campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        purchases: acc.purchases + c.purchases,
        reach: acc.reach + c.reach,
      }),
      { spend: 0, impressions: 0, clicks: 0, purchases: 0, reach: 0 }
    );

    // Calculate spend in INR and profit
    const totalSpendINR = totals.spend * exchangeRate;
    const gst = totalRevenue * 0.05; // 5% GST
    const netRevenue = totalRevenue - gst;
    const profit = netRevenue - totalSpendINR;
    const roas = totalSpendINR > 0 ? totalRevenue / totalSpendINR : 0;

    return NextResponse.json({
      configured: true,
      exchangeRate,
      datePreset,
      dateRange: { start: actualStartDate, end: actualEndDate },
      customDateRange: customStartDate && customEndDate ? { start: customStartDate, end: customEndDate } : null,
      campaigns,
      // Revenue data from PayU
      revenue: {
        totalRevenue,
        grossRevenue,
        refundAmount,
        totalSales,
        totalRefunds,
        gst,
        netRevenue,
        totalSpendINR,
        profit,
        roas,
      },
      totals: {
        ...totals,
        spendINR: totalSpendINR,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        costPerPurchase: totals.purchases > 0 ? totals.spend / totals.purchases : 0,
      },
    });
  } catch (error: any) {
    console.error("Meta Ads Breakdown API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch Meta Ads breakdown" },
      { status: 500 }
    );
  }
}
