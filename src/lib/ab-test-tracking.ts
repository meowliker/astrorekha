"use client";

import { DEFAULT_LAYOUT_B_CONFIG, type LayoutVariant } from "@/lib/layout-b-funnel";
import { generateUserId } from "@/lib/user-profile";

export type { LayoutVariant };

const DEFAULT_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;
const VISITOR_KEY = "astrorekha_ab_visitor_id";
const TEST_ID_KEY = "astrorekha_ab_test_id";
const VARIANT_KEY = "astrorekha_layout_variant";
const EVENT_DEDUPE_PREFIX = "astrorekha_ab_event_seen";
const CHECKOUT_STARTED_DEDUPE_TTL_MS = 5 * 60 * 1000;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getABVisitorId(): string {
  if (!canUseBrowserStorage()) return "";
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const generated = localStorage.getItem("astrorekha_user_id") || generateUserId();
  localStorage.setItem(VISITOR_KEY, generated);
  return generated;
}

export function getABVariant(fallback: LayoutVariant = "A"): LayoutVariant {
  if (!canUseBrowserStorage()) return fallback;
  return localStorage.getItem(VARIANT_KEY) === "B" ? "B" : "A";
}

export function getABTestId(): string {
  if (!canUseBrowserStorage()) return DEFAULT_TEST_ID;
  return localStorage.getItem(TEST_ID_KEY) || DEFAULT_TEST_ID;
}

type TrackABEventPayload = {
  eventType: "impression" | "conversion" | "bounce" | "checkout_started";
  route?: string;
  variant?: LayoutVariant;
  testId?: string;
  visitorId?: string;
  metadata?: Record<string, unknown>;
  keepalive?: boolean;
};

function getEventRoute(payload: TrackABEventPayload): string {
  const route = payload.route?.trim();
  if (route) return route;

  const metadataRoute = payload.metadata?.route;
  return typeof metadataRoute === "string" ? metadataRoute.trim() : "";
}

function getABEventDedupeKey(params: {
  payload: TrackABEventPayload;
  testId: string;
  variant: LayoutVariant;
  visitorId: string;
}): string | null {
  if (params.payload.eventType === "conversion") return null;

  const route = getEventRoute(params.payload) || "unknown";
  return `${params.payload.eventType}:${params.testId}:${params.variant}:${params.visitorId}:${route}`;
}

function shouldSkipDedupedABEvent(params: {
  payload: TrackABEventPayload;
  testId: string;
  variant: LayoutVariant;
  visitorId: string;
}): boolean {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;

  const dedupeKey = getABEventDedupeKey(params);
  if (!dedupeKey) return false;

  try {
    const storageKey = `${EVENT_DEDUPE_PREFIX}:${dedupeKey}`;
    const now = Date.now();
    const lastSeen = Number(sessionStorage.getItem(storageKey) || 0);

    if (lastSeen > 0) {
      if (params.payload.eventType === "checkout_started") {
        if (now - lastSeen < CHECKOUT_STARTED_DEDUPE_TTL_MS) {
          return true;
        }
      } else {
        return true;
      }
    }

    sessionStorage.setItem(storageKey, String(now));
  } catch {
    return false;
  }

  return false;
}

export async function trackABEvent(payload: TrackABEventPayload): Promise<void> {
  const variant = payload.variant || getABVariant("A");
  const testId = payload.testId || getABTestId();
  const visitorId = payload.visitorId || getABVisitorId();
  if (!variant || !testId || !visitorId) return;
  if (shouldSkipDedupedABEvent({ payload, testId, variant, visitorId })) return;

  const route = payload.route?.trim();
  const mergedMetadata = {
    ...(payload.metadata || {}),
    ...(route ? { route } : {}),
  };

  const shouldUseKeepAlive =
    payload.keepalive ?? (payload.eventType === "impression" || payload.eventType === "bounce");

  await fetch("/api/ab-test/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      testId,
      variant,
      eventType: payload.eventType,
      visitorId,
      metadata: mergedMetadata,
    }),
    keepalive: shouldUseKeepAlive,
  });
}

export function shouldTrackRouteImpressionOnce(params: {
  testId: string;
  variant: LayoutVariant;
  visitorId: string;
  route: string;
}): boolean {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return true;
  const key = `astrorekha_ab_route_impression:${params.testId}:${params.variant}:${params.visitorId}:${params.route}`;
  if (sessionStorage.getItem(key)) {
    return false;
  }
  sessionStorage.setItem(key, "1");
  return true;
}
