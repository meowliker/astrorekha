"use client";

import type { PaymentAttributionPayload } from "@/lib/attribution";

const ATTRIBUTION_STORAGE_KEY = "astrorekha_attribution";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(target)) {
      return decodeURIComponent(part.slice(target.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function readStoredAttribution(): PaymentAttributionPayload {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PaymentAttributionPayload;
  } catch {
    return {};
  }
}

function writeStoredAttribution(payload: PaymentAttributionPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

function getParamValue(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function buildFbcFromFbclid(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}

export function captureAttributionFromPage(): PaymentAttributionPayload {
  if (typeof window === "undefined") return {};

  const url = new URL(window.location.href);
  const params = url.searchParams;
  const existing = readStoredAttribution();

  const fbclid = getParamValue(params, ["fbclid"]);
  const campaignId = getParamValue(params, [
    "meta_campaign_id",
    "campaign_id",
    "campaignid",
    "utm_campaign_id",
    "cid",
  ]);
  const adsetId = getParamValue(params, ["meta_adset_id", "adset_id", "adsetid"]);
  const adId = getParamValue(params, ["meta_ad_id", "ad_id", "adid"]);
  const gclid = getParamValue(params, ["gclid", "gbraid", "wbraid"]);

  const fbpFromCookie = readCookie("_fbp") || undefined;
  const fbcFromCookie = readCookie("_fbc") || undefined;
  const computedFbc = fbclid ? buildFbcFromFbclid(fbclid) : undefined;
  const nextFbc = computedFbc || fbcFromCookie || existing.fbc;

  if (computedFbc) {
    writeCookie("_fbc", computedFbc, 90 * 24 * 60 * 60);
  }

  const nowIso = new Date().toISOString();

  const merged: PaymentAttributionPayload = {
    fbclid: fbclid || existing.fbclid,
    fbc: nextFbc,
    fbp: fbpFromCookie || existing.fbp,
    utm_source: getParamValue(params, ["utm_source"]) || existing.utm_source,
    utm_medium: getParamValue(params, ["utm_medium"]) || existing.utm_medium,
    utm_campaign: getParamValue(params, ["utm_campaign"]) || existing.utm_campaign,
    utm_term: getParamValue(params, ["utm_term"]) || existing.utm_term,
    utm_content: getParamValue(params, ["utm_content"]) || existing.utm_content,
    utm_id: getParamValue(params, ["utm_id"]) || existing.utm_id,
    click_id: fbclid || gclid || existing.click_id,
    meta_campaign_id: campaignId || existing.meta_campaign_id,
    meta_adset_id: adsetId || existing.meta_adset_id,
    meta_ad_id: adId || existing.meta_ad_id,
    landing_path: existing.landing_path || `${url.pathname}${url.search}`,
    landing_url: existing.landing_url || url.href,
    referrer_url: document.referrer || existing.referrer_url,
    captured_at: nowIso,
  };

  writeStoredAttribution(merged);
  return merged;
}

export function getPaymentAttributionPayload(): PaymentAttributionPayload {
  const latest = captureAttributionFromPage();
  return {
    fbclid: latest.fbclid,
    fbc: latest.fbc,
    fbp: latest.fbp,
    utm_source: latest.utm_source,
    utm_medium: latest.utm_medium,
    utm_campaign: latest.utm_campaign,
    utm_term: latest.utm_term,
    utm_content: latest.utm_content,
    utm_id: latest.utm_id,
    click_id: latest.click_id,
    meta_campaign_id: latest.meta_campaign_id,
    meta_adset_id: latest.meta_adset_id,
    meta_ad_id: latest.meta_ad_id,
    landing_path: latest.landing_path,
    landing_url: latest.landing_url,
    referrer_url: latest.referrer_url,
    captured_at: latest.captured_at,
  };
}
