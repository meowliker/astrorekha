import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing } from "@/lib/pricing";
import { getMetaAccountCredentialsForRange, getMetaAccountCredentialsFromEnv } from "@/lib/meta-ad-accounts";
import { fetchMetaTrackingAccount, fetchMetaTrackingExactHourlySpend } from "@/lib/tracking-meta";
import { calculateProfitSheetGst, indianAdGstApplies } from "@/lib/profit-sheet-gst";
import { readTrackedUtmVisits, visitHour, type TrackingUtmVisit } from "@/lib/tracking-utm-visits";
import {
  businessDate, businessDayStartUtc, businessHourBucket, campaignNameKey, isMetaSource,
  nextBusinessDayStartUtc, paidAt, productLabel,
  type TrackingCampaign, type TrackingHour, type TrackingPayment, type TrackingSale, type TrackingSummary,
} from "@/lib/tracking-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PAID = ["paid", "success", "captured"];
const PAYMENT_FIELDS = "id,payu_txn_id,customer_email,type,bundle_id,feature,coins,amount,payment_status,created_at,fulfilled_at,utm_source,utm_medium,utm_campaign,utm_term,utm_content,meta_campaign_id,fb_campaign_id,meta_adset_id,fb_adset_id,meta_ad_id,fb_ad_id";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function defaultDates(): { start: string; end: string } {
  const end = businessDate(new Date());
  return { start: end, end };
}

async function paidPayments(supabase: ReturnType<typeof getSupabaseAdmin>, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  // Paid time is used for hourly sales. Old payments without fulfilled_at use created_at.
  for (const fallback of [false, true]) {
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from("payments").select(PAYMENT_FIELDS).in("payment_status", PAID);
      query = fallback
        ? query.is("fulfilled_at", null).gte("created_at", start).lt("created_at", end)
        : query.gte("fulfilled_at", start).lt("fulfilled_at", end);
      const { data, error } = await query.order(fallback ? "created_at" : "fulfilled_at", { ascending: true }).range(offset, offset + 499);
      if (error) throw new Error(`Unable to read paid orders: ${error.message}`);
      rows.push(...(data || []) as TrackingPayment[]);
      if (!data || data.length < 500) break;
      if (offset >= 19_500) throw new Error("Too many orders for this range. Choose fewer days.");
    }
  }
  return Array.from(new Map(rows.filter((row) => !row.id.startsWith("pay_refund_")).map((row) => [row.id, row])).values());
}

async function refundPayments(supabase: ReturnType<typeof getSupabaseAdmin>, start: string, end: string): Promise<TrackingPayment[]> {
  const rows: TrackingPayment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("payments").select(PAYMENT_FIELDS)
      .like("id", "pay_refund_%").gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error(`Unable to read refunds: ${error.message}`);
    rows.push(...(data || []) as TrackingPayment[]);
    if (!data || data.length < 500) break;
    if (offset >= 19_500) throw new Error("Too many refunds for this range. Choose fewer days.");
  }
  return rows.filter((row) => /refund|chargeback|reversal/i.test(row.payment_status));
}

async function fxRate(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<{ rate: number; source: string }> {
  const { data } = await supabase.from("profit_sheet").select("exchange_rate,date")
    .not("exchange_rate", "is", null).order("date", { ascending: false }).limit(1).maybeSingle();
  const rate = Number(data?.exchange_rate);
  if (Number.isFinite(rate) && rate > 0) return { rate, source: `Profit Sheet rate · ${data?.date}` };
  const envRate = Number(process.env.USD_INR_EXCHANGE_RATE || process.env.EXCHANGE_RATE_USD_INR);
  return { rate: Number.isFinite(envRate) && envRate > 0 ? envRate : 85, source: "Fallback estimate" };
}

function emptyUtmCampaign(key: string, id: string | null, name: string, source: TrackingCampaign["attribution"]): TrackingCampaign {
  return {
    key, accountId: null, accountName: "UTM only / unmatched", currency: "INR", campaignId: id,
    campaignName: name, objective: null, status: null, dailyBudget: null, lifetimeBudget: null,
    spend: 0, spendInr: null, impressions: 0, reach: 0, clicks: 0, linkClicks: 0,
    landingPageViews: 0, addToCarts: 0, checkouts: 0, metaPurchases: 0,
    metaPurchaseValue: 0, leads: 0, orders: 0, grossRevenue: 0, refunds: 0,
    refundAmount: 0, revenue: 0, utmSources: [], utmMediums: [], utmTerms: [],
    utmContents: [], attribution: source, adBreakdown: [],
  };
}

function attachOrders(campaigns: TrackingCampaign[], sales: TrackingPayment[], refunds: TrackingPayment[], parents: Map<string, TrackingPayment>) {
  const byId = new Map(campaigns.filter((row) => row.campaignId).map((row) => [row.campaignId!, row]));
  const byName = new Map<string, TrackingCampaign[]>();
  for (const row of campaigns) {
    const key = campaignNameKey(row.campaignName);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) || []), row]);
  }
  const extra = new Map<string, TrackingCampaign>();
  const hourMap = new Map<string, TrackingHour>();
  const assigned = new Map<string, TrackingCampaign>();
  let attributedOrders = 0;

  function campaignFor(payment: TrackingPayment): TrackingCampaign {
    const id = payment.meta_campaign_id || payment.fb_campaign_id;
    if (id) {
      const found = byId.get(id);
      if (found) { found.attribution = "meta_id"; return found; }
      const key = `utm-id:${id}`;
      if (!extra.has(key)) extra.set(key, emptyUtmCampaign(key, id, payment.utm_campaign || id, "utm_only"));
      return extra.get(key)!;
    }
    // Some existing Meta URL templates store the numeric campaign ID in utm_campaign.
    // Exact ID matching remains safe even when utm_source is missing.
    const exactId = /^\d{8,24}$/.test(payment.utm_campaign || "") ? byId.get(payment.utm_campaign!) : null;
    if (exactId) {
      if (exactId.attribution === "none") exactId.attribution = "utm_id";
      return exactId;
    }
    if (payment.utm_campaign && isMetaSource(payment.utm_source)) {
      const matches = byName.get(campaignNameKey(payment.utm_campaign)) || [];
      if (matches.length === 1) {
        if (matches[0].attribution === "none") matches[0].attribution = "unique_name";
        return matches[0];
      }
      const key = `utm-name:${campaignNameKey(payment.utm_campaign)}`;
      if (!extra.has(key)) extra.set(key, emptyUtmCampaign(key, null, payment.utm_campaign, "utm_only"));
      return extra.get(key)!;
    }
    const key = "unattributed";
    if (!extra.has(key)) extra.set(key, emptyUtmCampaign(key, null, "Unattributed / other sources", "none"));
    return extra.get(key)!;
  }

  function addHour(payment: TrackingPayment, row: TrackingCampaign, amount: number, isRefund: boolean) {
    const at = new Date(isRefund ? payment.created_at : paidAt(payment));
    const { date, hour } = businessHourBucket(at);
    const key = `${date}:${hour}:${row.key}`;
    const bucket = hourMap.get(key) || { date, hour, campaignKey: row.key, orders: 0, revenue: 0 };
    bucket.orders += isRefund ? 0 : 1;
    bucket.revenue += isRefund ? -amount : amount;
    hourMap.set(key, bucket);
  }

  for (const payment of sales) {
    const row = campaignFor(payment);
    assigned.set(payment.id, row);
    if (row.accountId) attributedOrders++;
    const amount = Number(payment.amount || 0) / 100;
    row.orders++;
    row.grossRevenue += amount;
    row.revenue += amount;
    if (payment.utm_source && !row.utmSources.includes(payment.utm_source)) row.utmSources.push(payment.utm_source);
    if (payment.utm_medium && !row.utmMediums.includes(payment.utm_medium)) row.utmMediums.push(payment.utm_medium);
    if (payment.utm_term && !row.utmTerms.includes(payment.utm_term)) row.utmTerms.push(payment.utm_term);
    if (payment.utm_content && !row.utmContents.includes(payment.utm_content)) row.utmContents.push(payment.utm_content);
    const term = payment.utm_term || "—";
    const content = payment.utm_content || "—";
    const adsetId = payment.meta_adset_id || payment.fb_adset_id || null;
    const adId = payment.meta_ad_id || payment.fb_ad_id || null;
    const detail = row.adBreakdown.find((item) => item.adsetId === adsetId && item.adId === adId && item.term === term && item.content === content);
    if (detail) { detail.orders++; detail.grossRevenue += amount; detail.revenue += amount; }
    else row.adBreakdown.push({ adsetId, adId, term, content, orders: 1, grossRevenue: amount, refunds: 0, refundAmount: 0, revenue: amount });
    addHour(payment, row, amount, false);
  }

  for (const refund of refunds) {
    const parentId = refund.payu_txn_id || "";
    const parent = parents.get(parentId);
    const row = assigned.get(parentId) || (parent ? campaignFor(parent) : campaignFor(refund));
    const amount = Math.abs(Number(refund.amount || 0)) / 100;
    row.refunds++;
    row.refundAmount += amount;
    row.revenue -= amount;
    const source = parent || refund;
    const adsetId = source.meta_adset_id || source.fb_adset_id || null;
    const adId = source.meta_ad_id || source.fb_ad_id || null;
    const detail = row.adBreakdown.find((item) => item.adsetId === adsetId && item.adId === adId && item.term === (source.utm_term || "—") && item.content === (source.utm_content || "—"));
    if (detail) { detail.refunds++; detail.refundAmount += amount; detail.revenue -= amount; }
    addHour(refund, row, amount, true);
  }
  return { campaigns: campaigns.concat(Array.from(extra.values())), hourly: Array.from(hourMap.values()), attributedOrders };
}

function attachUtmVisits(campaigns: TrackingCampaign[], visits: TrackingUtmVisit[]) {
  const byId = new Map(campaigns.filter((row) => row.campaignId).map((row) => [row.campaignId!, row]));
  const byName = new Map<string, TrackingCampaign[]>();
  for (const row of campaigns.filter((item) => item.accountId)) {
    const key = campaignNameKey(row.campaignName);
    byName.set(key, [...(byName.get(key) || []), row]);
  }
  const byKey = new Map(campaigns.map((row) => [row.key, row]));
  const hourly: Record<string, Record<string, number[]>> = {};
  for (const row of campaigns) { row.utmVisits = 0; row.utmVisitBreakdown = []; }
  for (const visit of visits) {
    // Use the tags on the actual landing URL, never attribution inherited from a later page view.
    const campaignId = visit.campaignId || (/^\d{8,24}$/.test(visit.campaignName || "") ? visit.campaignName : null);
    let row = campaignId ? byId.get(campaignId) : undefined;
    if (!row && campaignId) {
      const key = `utm-id:${campaignId}`;
      row = byKey.get(key);
      if (!row) { row = emptyUtmCampaign(key, campaignId, visit.campaignName || campaignId, "utm_only"); byKey.set(key, row); campaigns.push(row); }
    }
    if (!row && visit.campaignName && isMetaSource(visit.source)) {
      const nameKey = campaignNameKey(visit.campaignName);
      const matches = byName.get(nameKey) || [];
      if (matches.length === 1) row = matches[0];
      else {
        const key = `utm-name:${nameKey}`;
        row = byKey.get(key);
        if (!row) { row = emptyUtmCampaign(key, null, visit.campaignName, "utm_only"); byKey.set(key, row); campaigns.push(row); }
      }
    }
    if (!row) continue;
    row.utmVisits = (row.utmVisits || 0) + 1;
    row.utmVisitBreakdown ||= [];
    const term = visit.term || "—";
    const content = visit.content || "—";
    const detail = row.utmVisitBreakdown!.find((item) => item.adsetId === visit.adsetId && item.adId === visit.adId && item.term === term && item.content === content);
    if (detail) detail.visits++;
    else row.utmVisitBreakdown!.push({ adsetId: visit.adsetId, adId: visit.adId, term, content, visits: 1 });
    const { date, hour } = visitHour(visit);
    const buckets = (hourly[row.key] ||= {});
    (buckets[date] ||= Array(24).fill(0))[hour]++;
  }
  return hourly;
}

async function summary(supabase: ReturnType<typeof getSupabaseAdmin>, dates: { start: string; end: string }): Promise<TrackingSummary> {
  const start = businessDayStartUtc(dates.start);
  const end = nextBusinessDayStartUtc(dates.end);
  const [rate, sales, refunds, visitResult] = await Promise.all([
    fxRate(supabase), paidPayments(supabase, start, end), refundPayments(supabase, start, end),
    readTrackedUtmVisits(supabase, start, end).then((visits) => ({ visits, error: null as string | null }))
      .catch((error) => ({ visits: [] as TrackingUtmVisit[], error: error instanceof Error ? error.message : "UTM arrivals unavailable" })),
  ]);
  const parents = new Map(sales.map((sale) => [sale.id, sale]));
  const missingParentIds = Array.from(new Set(refunds.map((row) => row.payu_txn_id).filter((id): id is string => !!id && !parents.has(id))));
  for (let i = 0; i < missingParentIds.length; i += 200) {
    const { data, error } = await supabase.from("payments").select(PAYMENT_FIELDS).in("id", missingParentIds.slice(i, i + 200));
    if (error) throw new Error(`Unable to read refunded orders: ${error.message}`);
    for (const row of (data || []) as TrackingPayment[]) parents.set(row.id, row);
  }
  const configured = await getMetaAccountCredentialsForRange(supabase, { startDate: dates.start, endDate: dates.end });
  const credentials = configured.length ? configured : getMetaAccountCredentialsFromEnv({ startDate: dates.start, endDate: dates.end });
  const distinct = Array.from(new Map(credentials.map((credential) => [credential.accountId, credential])).values());
  const meta = await Promise.all(distinct.map(async (credential) => {
    return fetchMetaTrackingAccount(credential, dates, rate.rate);
  }));
  const campaigns = meta.flatMap((result) => result.campaigns);
  const joined = attachOrders(campaigns, sales, refunds, parents);
  const hourlyUtmVisits = visitResult.error ? {} : attachUtmVisits(joined.campaigns, visitResult.visits);
  const grossRevenue = sales.reduce((sum, row) => sum + Number(row.amount || 0) / 100, 0);
  const refundAmount = refunds.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)) / 100, 0);
  const warnings = meta.flatMap((result) => result.warnings);
  if (visitResult.error) warnings.push(`${visitResult.error}. AR CVR is unavailable.`);
  if (!credentials.length) warnings.push("No Meta ad accounts are configured for this range. UTM orders are still shown.");
  if (joined.attributedOrders < sales.length) warnings.push(`${sales.length - joined.attributedOrders} paid orders could not be matched to a unique Meta campaign.`);
  // Match the Profit Sheet's net GST calculation and 11:30 AM IST business day.
  const spendInr = campaigns.reduce((sum, row) => sum + (row.spendInr || 0), 0);
  const indianSpendInr = campaigns.reduce((sum, row) => sum + (row.currency === "INR" ? row.spendInr || 0 : 0), 0);
  const revenue = grossRevenue - refundAmount;
  const gst = Array.from({ length: Math.floor((Date.parse(dates.end) - Date.parse(dates.start)) / 86_400_000) + 1 }, (_, index) => {
      const day = new Date(Date.parse(`${dates.start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
      const dailyRevenue = joined.hourly.filter((hour) => hour.date === day).reduce((sum, hour) => sum + hour.revenue, 0);
      const dailyIndianSpend = meta.reduce((sum, account) => sum + (account.dailySpendInr[day]?.indian || 0), 0);
      return indianAdGstApplies(day) ? calculateProfitSheetGst(dailyRevenue, 0.18, dailyIndianSpend).gst : dailyRevenue * 0.05;
    }).reduce((sum, value) => sum + value, 0);
  const profitAvailable = meta.every((result) => !result.account.error) && campaigns.every((row) => row.spendInr !== null || row.spend === 0);
  return {
    accounts: meta.map((result) => result.account), campaigns: joined.campaigns, hourly: joined.hourly,
    hourlyUtmVisits, utmVisitsAvailable: !visitResult.error,
    hourlySpendInr: Object.assign({}, ...meta.map((result) => result.hourlySpendInr)),
    accountDailySpendInr: Object.fromEntries(meta.map((result) => [result.account.id, result.dailySpendInr])),
    totals: {
      spendInr, indianSpendInr, gst, profit: profitAvailable ? revenue - gst - spendInr : null,
      orders: sales.length, attributedOrders: joined.attributedOrders, grossRevenue,
      refundAmount, revenue,
    },
    dates, fxRate: rate.rate, fxRateSource: rate.source, warnings, fetchedAt: new Date().toISOString(),
  };
}

async function live(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<{ sales: TrackingSale[]; todayCount: number; todayRevenue: number; fetchedAt: string }> {
  const today = businessDate(new Date());
  const start = businessDayStartUtc(today);
  const end = new Date().toISOString();
  const [payments, settings] = await Promise.all([
    paidPayments(supabase, start, end),
    supabase.from("settings").select("value").eq("key", "pricing").maybeSingle(),
  ]);
  const pricing = normalizePricing(settings.data?.value || DEFAULT_PRICING);
  const sales = payments.sort((a, b) => paidAt(b).localeCompare(paidAt(a))).slice(0, 24).map((row) => {
    const product = productLabel(row, pricing);
    return {
      id: row.id, email: row.customer_email || "Customer", productType: product.type,
      productName: product.name, amount: Number(row.amount || 0) / 100,
      at: paidAt(row), campaign: row.utm_campaign, accountId: row.meta_campaign_id || row.fb_campaign_id,
    };
  });
  return { sales, todayCount: payments.length,
    todayRevenue: payments.reduce((sum, row) => sum + Number(row.amount || 0) / 100, 0), fetchedAt: new Date().toISOString() };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const token = request.headers.get("x-admin-session");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: session, error } = await supabase.from("admin_sessions")
      .select("id,expires_at").eq("id", token).maybeSingle();
    if (error || !session || new Date(session.expires_at) <= new Date()) return json({ error: "Session expired" }, 401);
    const params = new URL(request.url).searchParams;
    if (params.get("mode") === "live") return json(await live(supabase));
    if (params.get("mode") === "hourly-spend") {
      const day = params.get("day");
      if (!validDate(day) || day > businessDate(new Date())) return json({ error: "Choose a valid IST day." }, 400);
      const configured = await getMetaAccountCredentialsForRange(supabase, { startDate: day, endDate: day });
      const credentials = configured.length ? configured : getMetaAccountCredentialsFromEnv({ startDate: day, endDate: day });
      const rate = await fxRate(supabase);
      const results = await Promise.all(Array.from(new Map(credentials.map((credential) => [credential.accountId, credential])).values()).map(async (credential) => {
        try { return { accountId: credential.accountId, spend: await fetchMetaTrackingExactHourlySpend(credential, day, rate.rate), warning: null }; }
        catch (error) { return { accountId: credential.accountId, spend: { hourlySpendInr: {} }, warning: `${credential.label || credential.accountId}: ${error instanceof Error ? error.message : "Meta hourly spend unavailable"}` }; }
      }));
      return json({ hourlySpendInr: Object.assign({}, ...results.map((result) => result.spend.hourlySpendInr)),
        failedAccountIds: results.filter((result) => result.warning).map((result) => result.accountId),
        warnings: results.map((result) => result.warning).filter(Boolean), fetchedAt: new Date().toISOString() });
    }
    const defaults = defaultDates();
    const start = params.get("start") || defaults.start;
    const end = params.get("end") || defaults.end;
    if (!validDate(start) || !validDate(end) || start > end || end > businessDate(new Date()) ||
        (Date.parse(end) - Date.parse(start)) / 86_400_000 > 30) {
      return json({ error: "Choose a valid IST date range of up to 31 days." }, 400);
    }
    return json(await summary(supabase, { start, end }));
  } catch (error) {
    console.error("[admin/tracking]", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Tracking data unavailable" }, 500);
  }
}
