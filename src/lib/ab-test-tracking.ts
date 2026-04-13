"use client";

import { DEFAULT_LAYOUT_B_CONFIG, type LayoutVariant } from "@/lib/layout-b-funnel";
import { generateUserId } from "@/lib/user-profile";

const DEFAULT_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;
const VISITOR_KEY = "astrorekha_ab_visitor_id";
const TEST_ID_KEY = "astrorekha_ab_test_id";
const VARIANT_KEY = "astrorekha_layout_variant";

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

export async function trackABEvent(payload: TrackABEventPayload): Promise<void> {
  const variant = payload.variant || getABVariant("A");
  const testId = payload.testId || getABTestId();
  const visitorId = payload.visitorId || getABVisitorId();
  if (!variant || !testId || !visitorId) return;

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
