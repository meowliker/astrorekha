import { CHAT_UNLIMITED_PASS_NAME, CHAT_UNLIMITED_PASS_TYPE } from "./chat-unlimited-pass";
import type { PricingConfig } from "@/lib/pricing";

export type TrackingPayment = {
  id: string;
  payu_txn_id: string | null;
  customer_email: string | null;
  type: string | null;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  amount: number;
  payment_status: string;
  created_at: string;
  fulfilled_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  meta_campaign_id: string | null;
  fb_campaign_id: string | null;
  meta_adset_id: string | null;
  fb_adset_id: string | null;
  meta_ad_id: string | null;
  fb_ad_id: string | null;
};

export type TrackingCampaign = {
  key: string;
  accountId: string | null;
  accountName: string;
  currency: string;
  campaignId: string | null;
  campaignName: string;
  objective: string | null;
  status: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spend: number;
  /** Meta's account-calendar spend, paired with its calendar insight metrics. */
  metaCalendarSpend?: number;
  spendInr: number | null;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  /** Meta link clicks allocated into the 11:30 AM IST business-day range. */
  businessLinkClicks?: number;
  /** Tagged arrivals recorded on AstroRekha during the selected 11:30 AM IST business days. */
  utmVisits?: number;
  utmVisitBreakdown?: Array<{ adsetId: string | null; adId: string | null; term: string; content: string; visits: number }>;
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;
  metaPurchases: number;
  metaPurchaseValue: number;
  leads: number;
  orders: number;
  grossRevenue: number;
  refunds: number;
  refundAmount: number;
  revenue: number;
  utmSources: string[];
  utmMediums: string[];
  utmTerms: string[];
  utmContents: string[];
  attribution: "meta_id" | "utm_id" | "unique_name" | "utm_only" | "none";
  adBreakdown: Array<{ adsetId: string | null; adId: string | null; term: string; content: string; orders: number; grossRevenue: number; refunds: number; refundAmount: number; revenue: number }>;
};

export type TrackingChild = TrackingCampaign & { level: "adset" | "ad"; id: string; parentId: string };
export type TrackingActivity = { id: string; accountId: string; accountName: string; at: string; actor: string; action: string; object: string; objectType: string; detail: string };

export type TrackingSale = {
  id: string;
  email: string;
  productType: string;
  productName: string;
  amount: number;
  at: string;
  campaign: string | null;
  accountId: string | null;
};

export type TrackingHour = { date: string; hour: number; campaignKey: string; orders: number; revenue: number };

export type TrackingSummary = {
  accounts: Array<{ id: string; name: string; currency: string; timezone: string | null; error?: string }>;
  campaigns: TrackingCampaign[];
  hourly: TrackingHour[];
  hourlyUtmVisits: Record<string, Record<string, number[]>>;
  utmVisitsAvailable: boolean;
  hourlySpendInr: Record<string, Record<string, number[]>>;
  totals: { spendInr: number; indianSpendInr: number; gst: number; profit: number | null; orders: number; attributedOrders: number; grossRevenue: number; refundAmount: number; revenue: number };
  accountDailySpendInr: Record<string, Record<string, { total: number; indian: number }>>;
  dates: { start: string; end: string };
  fxRate: number;
  fxRateSource: string;
  warnings: string[];
  fetchedAt: string;
};

export function istDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Match the Profit Sheet: a reporting day runs from 11:30 AM IST to 11:29 AM IST.
export function businessDate(date: Date): string {
  return istDate(new Date(date.getTime() - (11 * 60 + 30) * 60_000));
}

export function businessDayStartUtc(date: string): string {
  return new Date(`${date}T11:30:00+05:30`).toISOString();
}

export function nextBusinessDayStartUtc(date: string): string {
  const next = new Date(businessDayStartUtc(date));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export function businessHourBucket(date: Date): { date: string; hour: number } {
  const day = businessDate(date);
  const hour = Math.floor((date.getTime() - new Date(businessDayStartUtc(day)).getTime()) / 3_600_000);
  return { date: day, hour };
}

export function paidAt(payment: TrackingPayment): string {
  return payment.fulfilled_at || payment.created_at;
}

export function isMetaSource(source: string | null): boolean {
  return ["facebook", "fb", "instagram", "ig", "meta"].includes(String(source || "").trim().toLowerCase());
}

export function campaignNameKey(value: string | null): string {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function productLabel(payment: TrackingPayment, pricing: PricingConfig): { type: string; name: string } {
  const type = String(payment.type || "unknown").toLowerCase();
  const ids = String(payment.bundle_id || "").split(",").map((item) => item.trim()).filter(Boolean);
  const features = String(payment.feature || "").split(",").map((item) => item.trim()).filter(Boolean);
  const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").trim();
  const find = (items: Array<{ id: string; name: string }>, id: string) => items.find((item) => item.id === id)?.name;
  if (type === "bundle" || type === "bundle_payment") {
    return { type: "Bundle", name: ids.map((id) => find(pricing.bundles, id) || readable(id)).join(" + ") || "Bundle" };
  }
  if (type === "report") {
    const names = ids.length ? ids.map((id) => find(pricing.reports, id) || readable(id)) : features.map(readable);
    return { type: "Report", name: names.join(" + ") || "Report" };
  }
  if (type === "upsell") {
    const names = ids.length ? ids.map((id) => find(pricing.upsells, id) || find(pricing.reports, id) || readable(id)) : features.map(readable);
    return { type: "Add-on", name: names.join(" + ") || "Add-on" };
  }
  if (type === "coins") {
    const count = Math.floor(Math.max(0, Number(payment.coins || 0)) / 3);
    return { type: "Coins", name: count ? `${count} Elysia questions` : "Elysia questions" };
  }
  if (type === CHAT_UNLIMITED_PASS_TYPE) return { type: "Chat pass", name: CHAT_UNLIMITED_PASS_NAME };
  return { type: readable(type) || "Purchase", name: ids.concat(features).map(readable).join(" + ") || "Purchase" };
}
