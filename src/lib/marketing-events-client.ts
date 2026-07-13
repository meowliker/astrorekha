"use client";

import type { PaymentAttributionPayload } from "@/lib/attribution";
import { captureAttributionFromPage, getPaymentAttributionPayload } from "@/lib/attribution-client";

const VISITOR_KEY = "astrorekha_marketing_visitor_id";
const SESSION_KEY = "astrorekha_marketing_session_id";

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
