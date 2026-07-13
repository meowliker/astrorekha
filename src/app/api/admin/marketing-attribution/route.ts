import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  META_TRACKING_URL_PARAMETERS,
  type MarketingEventName,
} from "@/lib/marketing-events";
import { getMetaAccountCredentialsFromEnv } from "@/lib/meta-ad-accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const SUCCESS_STATUSES = new Set(["success", "paid", "captured"]);

type MarketingEventRow = {
  event_name?: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  route?: string | null;
  path?: string | null;
  product_type?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  payment_id?: string | null;
  payu_txn_id?: string | null;
  amount?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  created_at?: string | null;
};

type PaymentRow = {
  id?: string | null;
  payu_txn_id?: string | null;
  user_id?: string | null;
  customer_email?: string | null;
  type?: string | null;
  bundle_id?: string | null;
  feature?: string | null;
  amount?: number | null;
  payment_status?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  created_at?: string | null;
  fulfilled_at?: string | null;
};

type SpendMetrics = {
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  adName?: string | null;
  spendInr: number;
  impressions: number;
  clicks: number;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveDateRange(searchParams: URLSearchParams) {
  const now = new Date();
  const customStart = parseIsoDate(searchParams.get("startDate"));
  const customEnd = parseIsoDate(searchParams.get("endDate"));
  if (customStart) {
    const end = customEnd || startOfUtcDay(now);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start: customStart, end, startDate: formatIsoDate(customStart), endDate: formatIsoDate(new Date(end.getTime() - 1)) };
  }

  const days = Math.max(1, Math.min(180, Number(searchParams.get("days") || 7) || 7));
  const end = new Date(now);
  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - days);
  return { start, end, startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
}

function uniqueKey(row: MarketingEventRow | PaymentRow): string {
  const value = row as MarketingEventRow & PaymentRow;
  return String(value.user_id || value.email || value.customer_email || value.visitor_id || value.session_id || value.payu_txn_id || value.id || "")
    .trim()
    .toLowerCase();
}

function isSuccessfulPayment(payment: PaymentRow): boolean {
  return SUCCESS_STATUSES.has(String(payment.payment_status || "").toLowerCase().trim());
}

function inRoute(row: MarketingEventRow, needles: string[]): boolean {
  const value = `${row.route || ""} ${row.path || ""}`.toLowerCase();
  return needles.some((needle) => value.includes(needle));
}

function countUnique(rows: Array<MarketingEventRow | PaymentRow>): number {
  const keys = new Set<string>();
  rows.forEach((row) => {
    const key = uniqueKey(row);
    if (key) keys.add(key);
  });
  return keys.size;
}

function toInrFromPaise(amount?: number | null): number {
  const parsed = Number(amount || 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed / 100;
}

function campaignKey(row: MarketingEventRow | PaymentRow): string {
  return (
    row.meta_ad_id ||
    row.meta_adset_id ||
    row.meta_campaign_id ||
    row.utm_campaign ||
    row.utm_content ||
    "unattributed"
  );
}

function hasMarketingAttribution(row: MarketingEventRow | PaymentRow): boolean {
  return (
    campaignKey(row) !== "unattributed" ||
    !!row.utm_source ||
    !!row.utm_medium
  );
}

function productKey(row: PaymentRow): string {
  return `${row.type || "unknown"}:${row.bundle_id || row.feature || "unknown"}`;
}

function labelProduct(row: PaymentRow): string {
  return row.bundle_id || row.feature || row.type || "Unknown product";
}

function mergeSpend(target: SpendMetrics, source: SpendMetrics) {
  target.spendInr += source.spendInr;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.campaignId ||= source.campaignId;
  target.campaignName ||= source.campaignName;
  target.adsetId ||= source.adsetId;
  target.adsetName ||= source.adsetName;
  target.adId ||= source.adId;
  target.adName ||= source.adName;
}

async function fetchUsdInrRate(): Promise<number> {
  const envRate = Number(process.env.USD_INR_EXCHANGE_RATE || process.env.EXCHANGE_RATE_USD_INR || 0);
  if (Number.isFinite(envRate) && envRate > 0) return envRate;

  try {
    const response = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=INR", {
      next: { revalidate: 60 * 60 * 6 },
    });
    const data = await response.json();
    const rate = Number(data?.rates?.INR || 0);
    return Number.isFinite(rate) && rate > 0 ? rate : 85;
  } catch {
    return 85;
  }
}

async function fetchMetaSpend(startDate: string, endDate: string): Promise<{
  configured: boolean;
  adSpend: Map<string, SpendMetrics>;
  adsetSpend: Map<string, SpendMetrics>;
  campaignSpend: Map<string, SpendMetrics>;
}> {
  const credentials = getMetaAccountCredentialsFromEnv();
  const adSpend = new Map<string, SpendMetrics>();
  const adsetSpend = new Map<string, SpendMetrics>();
  const campaignSpend = new Map<string, SpendMetrics>();

  if (credentials.length === 0) {
    return { configured: false, adSpend, adsetSpend, campaignSpend };
  }

  const usdInrRate = await fetchUsdInrRate();

  await Promise.all(
    credentials.map(async ({ accountId, accessToken }) => {
      try {
        const accountBase = `${META_BASE_URL}/act_${accountId}`;
        const accountResponse = await fetch(`${accountBase}?fields=currency&access_token=${accessToken}`, {
          cache: "no-store",
        });
        const account = await accountResponse.json();
        const currency = String(account?.currency || "INR").toUpperCase();
        const multiplier = currency === "INR" ? 1 : currency === "USD" ? usdInrRate : 1;
        const dateParams = `time_range=${encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }))}`;
        let nextUrl: string | null = `${accountBase}/insights?fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks&level=ad&${dateParams}&limit=500&access_token=${accessToken}`;
        let pageCount = 0;

        while (nextUrl && pageCount < 20) {
          pageCount += 1;
          const response: Response = await fetch(nextUrl, { cache: "no-store" });
          const data: { data?: any[]; paging?: { next?: string } } = await response.json();

          for (const item of data?.data || []) {
            const spend = Number(item.spend || 0) * multiplier;
            const metrics: SpendMetrics = {
              campaignId: item.campaign_id || null,
              campaignName: item.campaign_name || null,
              adsetId: item.adset_id || null,
              adsetName: item.adset_name || null,
              adId: item.ad_id || null,
              adName: item.ad_name || null,
              spendInr: Number.isFinite(spend) ? spend : 0,
              impressions: Number(item.impressions || 0) || 0,
              clicks: Number(item.clicks || 0) || 0,
            };

            if (metrics.adId) mergeSpend(adSpend.get(metrics.adId) || adSpend.set(metrics.adId, { ...metrics, spendInr: 0, impressions: 0, clicks: 0 }).get(metrics.adId)!, metrics);
            if (metrics.adsetId) mergeSpend(adsetSpend.get(metrics.adsetId) || adsetSpend.set(metrics.adsetId, { ...metrics, spendInr: 0, impressions: 0, clicks: 0 }).get(metrics.adsetId)!, metrics);
            if (metrics.campaignId) mergeSpend(campaignSpend.get(metrics.campaignId) || campaignSpend.set(metrics.campaignId, { ...metrics, spendInr: 0, impressions: 0, clicks: 0 }).get(metrics.campaignId)!, metrics);
          }

          nextUrl = typeof data?.paging?.next === "string" ? data.paging.next : null;
        }
      } catch (error) {
        console.warn("[marketing-attribution] Meta spend fetch failed", accountId, error);
      }
    })
  );

  return { configured: true, adSpend, adsetSpend, campaignSpend };
}

function findSpend(row: PaymentRow, spend: Awaited<ReturnType<typeof fetchMetaSpend>>): SpendMetrics | null {
  if (row.meta_ad_id && spend.adSpend.has(row.meta_ad_id)) return spend.adSpend.get(row.meta_ad_id)!;
  if (row.meta_adset_id && spend.adsetSpend.has(row.meta_adset_id)) return spend.adsetSpend.get(row.meta_adset_id)!;
  if (row.meta_campaign_id && spend.campaignSpend.has(row.meta_campaign_id)) return spend.campaignSpend.get(row.meta_campaign_id)!;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

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

    const range = resolveDateRange(searchParams);
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const [eventsResult, paymentsResult, spend] = await Promise.all([
      supabase
        .from("marketing_events")
        .select("*")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("payments")
        .select("*")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .limit(10000),
      fetchMetaSpend(range.startDate, range.endDate),
    ]);

    const eventsAvailable = !eventsResult.error;
    const allEvents: MarketingEventRow[] = eventsAvailable ? eventsResult.data || [] : [];
    const events = allEvents.filter(hasMarketingAttribution);
    const payments: PaymentRow[] = paymentsResult.data || [];
    const attributedPayments = payments.filter(hasMarketingAttribution);
    const paidPayments = attributedPayments.filter(isSuccessfulPayment);

    const stageDefinitions: Array<{ id: string; label: string; rows: Array<MarketingEventRow | PaymentRow> }> = [
      {
        id: "page_view",
        label: "Page Viewed",
        rows: events.filter((event) => event.event_name === ("page_view" satisfies MarketingEventName)),
      },
      {
        id: "onboarding_started",
        label: "Onboarding Started",
        rows: events.filter((event) => inRoute(event, ["/onboarding"])),
      },
      {
        id: "email_captured",
        label: "Email Captured",
        rows: events.filter((event) => inRoute(event, ["step-15", "step-19"]) || !!event.email),
      },
      {
        id: "pricing_viewed",
        label: "Pricing Viewed",
        rows: events.filter((event) => inRoute(event, ["bundle-pricing", "bundle-upsell"])),
      },
      {
        id: "checkout_started",
        label: "Checkout Started",
        rows: events.filter((event) => event.event_name === ("checkout_started" satisfies MarketingEventName)),
      },
      {
        id: "purchase_success",
        label: "Purchase Success",
        rows: events.filter((event) => event.event_name === ("purchase_success" satisfies MarketingEventName)),
      },
    ];

    const funnel = stageDefinitions.map((stage, index) => {
      const visitors = countUnique(stage.rows);
      const previous = index > 0 ? countUnique(stageDefinitions[index - 1].rows) : visitors;
      return {
        id: stage.id,
        label: stage.label,
        visitors,
        dropOffFromPrevious: index > 0 ? Math.max(0, previous - visitors) : 0,
        conversionFromPreviousPercent: index > 0 && previous > 0 ? Number(((visitors / previous) * 100).toFixed(2)) : 100,
      };
    });

    const productMap = new Map<string, any>();
    paidPayments.forEach((payment) => {
      const key = productKey(payment);
      const current =
        productMap.get(key) ||
        productMap.set(key, {
          key,
          label: labelProduct(payment),
          productType: payment.type || "unknown",
          productId: payment.bundle_id || payment.feature || null,
          orders: 0,
          revenueInr: 0,
          estimatedGstInr: 0,
          estimatedProfitBeforeAdSpendInr: 0,
        }).get(key);
      const revenue = toInrFromPaise(payment.amount);
      current.orders += 1;
      current.revenueInr += revenue;
      current.estimatedGstInr += revenue * 0.05;
      current.estimatedProfitBeforeAdSpendInr += revenue * 0.95;
    });

    const campaignMap = new Map<string, any>();
    paidPayments.forEach((payment) => {
      const key = campaignKey(payment);
      const current =
        campaignMap.get(key) ||
        campaignMap.set(key, {
          key,
          utmCampaign: payment.utm_campaign || null,
          utmContent: payment.utm_content || null,
          metaCampaignId: payment.meta_campaign_id || null,
          metaAdsetId: payment.meta_adset_id || null,
          metaAdId: payment.meta_ad_id || null,
          orders: 0,
          revenueInr: 0,
          adSpendInr: 0,
          impressions: 0,
          clicks: 0,
          cpcInr: 0,
          cpaInr: 0,
          cpmInr: 0,
          ctr: 0,
          budgetInr: null,
          metaPurchases: null,
          estimatedProfitAfterAdSpendInr: 0,
          products: {} as Record<string, { orders: number; revenueInr: number }>,
        }).get(key);

      const revenue = toInrFromPaise(payment.amount);
      const product = labelProduct(payment);
      current.orders += 1;
      current.revenueInr += revenue;
      current.products[product] ||= { orders: 0, revenueInr: 0 };
      current.products[product].orders += 1;
      current.products[product].revenueInr += revenue;

      const spendMetrics = findSpend(payment, spend);
      if (spendMetrics) {
        current.campaignName ||= spendMetrics.campaignName || null;
        current.adsetName ||= spendMetrics.adsetName || null;
        current.adName ||= spendMetrics.adName || null;
      }
    });

    for (const campaign of campaignMap.values()) {
      const spendMetrics =
        (campaign.metaAdId && spend.adSpend.get(campaign.metaAdId)) ||
        (campaign.metaAdsetId && spend.adsetSpend.get(campaign.metaAdsetId)) ||
        (campaign.metaCampaignId && spend.campaignSpend.get(campaign.metaCampaignId)) ||
        null;
      campaign.adSpendInr = spendMetrics ? Number(spendMetrics.spendInr.toFixed(2)) : 0;
      campaign.impressions = spendMetrics?.impressions || 0;
      campaign.clicks = spendMetrics?.clicks || 0;
      campaign.cpcInr = campaign.clicks > 0 ? Number((campaign.adSpendInr / campaign.clicks).toFixed(2)) : 0;
      campaign.cpaInr = campaign.orders > 0 ? Number((campaign.adSpendInr / campaign.orders).toFixed(2)) : 0;
      campaign.cpmInr = campaign.impressions > 0 ? Number(((campaign.adSpendInr / campaign.impressions) * 1000).toFixed(2)) : 0;
      campaign.ctr = campaign.impressions > 0 ? Number(((campaign.clicks / campaign.impressions) * 100).toFixed(2)) : 0;
      campaign.estimatedProfitAfterAdSpendInr = Number((campaign.revenueInr * 0.95 - campaign.adSpendInr).toFixed(2));
      campaign.roas = campaign.adSpendInr > 0 ? Number((campaign.revenueInr / campaign.adSpendInr).toFixed(2)) : null;
      campaign.revenueInr = Number(campaign.revenueInr.toFixed(2));
      campaign.products = Object.entries(campaign.products).map(([label, value]: [string, any]) => ({
        label,
        orders: value.orders,
        revenueInr: Number(value.revenueInr.toFixed(2)),
      }));
    }

    const revenueInr = paidPayments.reduce((sum, payment) => sum + toInrFromPaise(payment.amount), 0);
    const attributedRevenueInr = revenueInr;

    return NextResponse.json({
      configured: true,
      eventsAvailable,
      eventsError: eventsResult.error?.message || null,
      range: {
        start: startIso,
        end: endIso,
        startDate: range.startDate,
        endDate: range.endDate,
      },
      metaUrlParameterTemplate: META_TRACKING_URL_PARAMETERS,
      summary: {
        events: events.length,
        payments: attributedPayments.length,
        paidOrders: paidPayments.length,
        revenueInr: Number(revenueInr.toFixed(2)),
        attributedRevenueInr: Number(attributedRevenueInr.toFixed(2)),
        attributedRevenuePercent: revenueInr > 0 ? 100 : 0,
        metaSpendConfigured: spend.configured,
      },
      funnel,
      products: Array.from(productMap.values())
        .map((product) => ({
          ...product,
          revenueInr: Number(product.revenueInr.toFixed(2)),
          estimatedGstInr: Number(product.estimatedGstInr.toFixed(2)),
          estimatedProfitBeforeAdSpendInr: Number(product.estimatedProfitBeforeAdSpendInr.toFixed(2)),
        }))
        .sort((a, b) => b.revenueInr - a.revenueInr),
      campaigns: Array.from(campaignMap.values()).sort((a, b) => b.revenueInr - a.revenueInr),
    });
  } catch (error) {
    console.error("[marketing-attribution] failed", error);
    return NextResponse.json({ error: "Failed to load marketing attribution" }, { status: 500 });
  }
}
