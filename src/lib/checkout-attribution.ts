import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { sanitizePaymentAttribution } from "./attribution";
import { getSupabaseAdmin } from "./supabase-admin";
import { gaSessionCookieName, parseGaClientId, parseGaSessionId } from "./ga-cookie-parsers";

const COOKIE = "ar_checkout_attribution";
const MAX_AGE = 2 * 60 * 60;
function signature(payload: string) {
  const key = process.env.REPORT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Checkout attribution signing unavailable");
  return createHmac("sha256", key).update(`astrorekha:checkout-attribution:v1:${payload}`).digest("base64url");
}
export function checkoutAttributionToken(orderId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ orderId, exp: Math.floor(now / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readCheckoutAttributionToken(token: string | undefined, now = Date.now()): string | null {
  try {
    if (!token || token.length > 2048) return null;
    const [payload, mac, extra] = token.split(".");
    if (!payload || !mac || extra !== undefined) return null;
    const a = Buffer.from(mac), b = Buffer.from(signature(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof decoded.orderId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(decoded.orderId) &&
      Number.isSafeInteger(decoded.exp) && decoded.exp > now / 1000 ? decoded.orderId : null;
  } catch { return null; }
}
/** This cookie permits attribution capture only; it grants no payment or report access. */
export function withCheckoutAttribution(response: NextResponse, orderId: string) {
  try {
    response.cookies.set(COOKIE, checkoutAttributionToken(orderId), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
    });
  } catch { console.warn("[checkout-attribution] Capture cookie unavailable"); }
  return response;
}

/** Only a new, explicitly tagged main-funnel visit. Never infer an ad from the route here. */
export function checkoutAdTouch(rawUrl: unknown, origin: string) {
  if (typeof rawUrl !== "string" || rawUrl.length > 4096) return null;
  try {
    const url = new URL(rawUrl);
    if (url.origin !== origin || !/^\/(?:discover(?:\/.*)?|onboarding(?:\/.*)?)?$/.test(url.pathname)) return null;
    const p = url.searchParams;
    const touch = sanitizePaymentAttribution({
      ...Object.fromEntries(p), google_campaign_id: p.get("gad_campaignid"),
      meta_campaign_id: p.get("meta_campaign_id") || p.get("campaign_id"),
      meta_adset_id: p.get("meta_adset_id") || p.get("adset_id"),
      meta_ad_id: p.get("meta_ad_id") || p.get("ad_id"),
      landing_path: url.pathname + url.search, landing_url: url.href,
    });
    const paid = /^(cpc|ppc|paid|paid_social|paid-social|paidsocial|paid_search|paidsearch|cpm)$/i.test(touch.utm_medium || "");
    const source = /^(google|googleads|google_ads|meta|facebook|instagram|fb|ig)$/i.test(touch.utm_source || "");
    if (!(touch.gclid || touch.gbraid || touch.wbraid || touch.fbclid || (paid && source))) return null;
    return touch;
  } catch { return null; }
}

/** Append evidence, never mutate a payment. The provider's paid timestamp selects the winner later. */
export async function captureCheckoutAdTouch(request: NextRequest, rawUrl: unknown) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return;
  const id = readCheckoutAttributionToken(request.cookies.get(COOKIE)?.value);
  const touch = checkoutAdTouch(rawUrl, request.nextUrl.origin);
  if (!id || !touch) return;
  const db = getSupabaseAdmin({ fresh: true });
  const { data: order, error } = await db.from("payments").select("id,payment_status,fulfilled_at,created_at")
    .eq("id", id).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
  if (error) throw error;
  if (!order || order.fulfilled_at || !["created", "pending", "failed"].includes(order.payment_status) ||
      Date.now() - Date.parse(order.created_at) > MAX_AGE * 1000) return;
  const sessionCookie = gaSessionCookieName(process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID);
  const { error: saveError } = await db.from("checkout_attribution_touches").upsert({
    payment_id: id,
    touch_key: createHash("sha256").update(JSON.stringify(touch)).digest("hex"),
    touch,
    ga_client_id: parseGaClientId(request.cookies.get("_ga")?.value),
    ga_session_id: sessionCookie ? parseGaSessionId(request.cookies.get(sessionCookie)?.value) : null,
    // observed_at is assigned by the database, never supplied by the browser.
  }, { onConflict: "payment_id,touch_key", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(2000));
  if (saveError) throw saveError;
}

export function paymentAttributionPatch(touchInput: unknown, observedAt: string) {
  const t = sanitizePaymentAttribution(touchInput);
  return {
    last_touch: { ...t, captured_at: observedAt, attribution_origin: "checkout_ad_touch" },
    utm_source: t.utm_source || null, utm_medium: t.utm_medium || null, utm_campaign: t.utm_campaign || null,
    utm_term: t.utm_term || null, utm_content: t.utm_content || null, utm_id: t.utm_id || null,
    click_id: t.click_id || null, fbclid: t.fbclid || null,
    meta_campaign_id: t.meta_campaign_id || null, meta_adset_id: t.meta_adset_id || null, meta_ad_id: t.meta_ad_id || null,
    fb_campaign_id: t.meta_campaign_id || null, fb_adset_id: t.meta_adset_id || null, fb_ad_id: t.meta_ad_id || null,
    landing_path: t.landing_path || null, landing_url: t.landing_url || null, attribution_captured_at: observedAt,
  };
}

/** Optional analytics step, called only AFTER verified payment and durable unlocks. */
export async function finalizeCheckoutAttribution(order: Record<string, unknown>, paidAt: string) {
  const db = getSupabaseAdmin({ fresh: true });
  const created = String(order.created_at || "");
  if (!Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(paidAt))) return order;
  const { data: touch, error } = await db.from("checkout_attribution_touches")
    .select("touch,observed_at,ga_client_id,ga_session_id")
    .eq("payment_id", order.id).gte("observed_at", created).lte("observed_at", paidAt)
    .order("observed_at", { ascending: false }).order("touch_key").limit(1).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
  if (error) throw error;
  if (!touch) return order;
  const patch = {
    ...paymentAttributionPatch(touch.touch, touch.observed_at),
    ...(touch.ga_client_id && touch.ga_session_id ? { ga_client_id: touch.ga_client_id, ga_session_id: touch.ga_session_id } : {}),
  };
  // Never reattribute an already emitted purchase. The first touch and all financial/fulfillment fields are untouched.
  const { data, error: saveError } = await db.from("payments").update(patch).eq("id", order.id)
    .eq("payment_status", "paid").is("ga_purchase_sent_at", null).is("meta_purchase_sent_at", null)
    .select("id").abortSignal(AbortSignal.timeout(2000)).maybeSingle();
  if (saveError) throw saveError;
  return data ? { ...order, ...patch } : order;
}
