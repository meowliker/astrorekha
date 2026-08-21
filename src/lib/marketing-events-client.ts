"use client";

import type { PaymentAttributionPayload } from "@/lib/attribution";
import { captureAttributionFromPage, getPaymentAttributionPayload } from "@/lib/attribution-client";

const VISITOR_KEY = "astrorekha_marketing_visitor_id";
const SESSION_KEY = "astrorekha_marketing_session_id";
const EVENT_DEDUPE_PREFIX = "astrorekha_marketing_event_seen";
const PAGE_VIEW_DEDUPE_TTL_MS = 30 * 60 * 1000;

export type ClientMarketingEventInput = {
  eventName: string;
  productType?: string | null;
  productId?: string | null;
  productName?: string | null;
  paymentId?: string | null;
  payuTxnId?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  attribution?: PaymentAttributionPayload | null;
  keepalive?: boolean;
  dedupeKey?: string | null;
  dedupeTtlMs?: number | null;
};

function createTrackingId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now()}_${random}`;
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getOrCreateLocalStorageValue(key: string, prefix: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = createTrackingId(prefix);
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return null;
  }
}

function getOrCreateSessionStorageValue(key: string, prefix: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = createTrackingId(prefix);
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return null;
  }
}

function getMarketingEventDedupeKey(input: ClientMarketingEventInput, route: string): string | null {
  const configuredKey = input.dedupeKey?.trim();
  if (configuredKey) return configuredKey;
  if (input.eventName === "page_view") return `page_view:${route}`;
  return null;
}

function shouldSkipDedupedMarketingEvent(input: ClientMarketingEventInput, route: string): boolean {
  if (typeof window === "undefined") return false;

  const dedupeKey = getMarketingEventDedupeKey(input, route);
  if (!dedupeKey) return false;

  try {
    const storageKey = `${EVENT_DEDUPE_PREFIX}:${dedupeKey}`;
    const now = Date.now();
    const lastSeen = Number(window.sessionStorage.getItem(storageKey) || 0);
    const ttlMs = input.dedupeTtlMs ?? PAGE_VIEW_DEDUPE_TTL_MS;

    if (lastSeen > 0 && (ttlMs <= 0 || now - lastSeen < ttlMs)) {
      return true;
    }

    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    return false;
  }

  return false;
}

export function getMarketingVisitorId(): string | null {
  return getOrCreateLocalStorageValue(VISITOR_KEY, "visitor");
}

export function getMarketingSessionId(): string | null {
  return getOrCreateSessionStorageValue(SESSION_KEY, "session");
}

export function captureMarketingAttribution(): PaymentAttributionPayload {
  return captureAttributionFromPage();
}

export async function trackMarketingEvent(input: ClientMarketingEventInput): Promise<void> {
  if (typeof window === "undefined") return;

  const attribution = input.attribution || getPaymentAttributionPayload();
  const path = window.location.pathname;
  const route = `${path}${window.location.search}`;
  if (shouldSkipDedupedMarketingEvent(input, route)) return;

  const body = {
    eventName: input.eventName,
    visitorId: getMarketingVisitorId(),
    sessionId: getMarketingSessionId(),
    userId: readLocalStorage("astrorekha_user_id"),
    email: readLocalStorage("astrorekha_email") || readLocalStorage("astrorekha_checkout_email"),
    route,
    path,
    url: window.location.href,
    referrerUrl: document.referrer,
    productType: input.productType,
    productId: input.productId,
    productName: input.productName,
    paymentId: input.paymentId,
    payuTxnId: input.payuTxnId,
    amount: input.amount,
    currency: input.currency || "INR",
    metadata: input.metadata || {},
    attribution,
  };

  try {
    await fetch("/api/marketing/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: input.keepalive ?? true,
    });
  } catch {
    // Analytics should never interrupt the user journey.
  }
}
