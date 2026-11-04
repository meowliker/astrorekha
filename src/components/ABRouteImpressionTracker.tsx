"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_LAYOUT_B_CONFIG } from "@/lib/layout-b-funnel";
import { GOOGLE_ADS_PAYWALL, isGoogleAdsFunnelPath } from "@/lib/google-ads-funnel";
import {
  getABTestId,
  getABVariant,
  getABVisitorId,
  shouldTrackRouteImpressionOnce,
  trackABEvent,
} from "@/lib/ab-test-tracking";

const DEFAULT_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;
const SKIP_ROUTES = new Set<string>([
  "/onboarding/bundle-pricing",
  "/onboarding/bundle-pricing-b",
  GOOGLE_ADS_PAYWALL,
]);

export default function ABRouteImpressionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const route = typeof pathname === "string" ? pathname.trim() : "";
    if (!route.startsWith("/onboarding/") && route !== "/onboarding" && !isGoogleAdsFunnelPath(route)) return;
    if (SKIP_ROUTES.has(route)) return;

    const variant = getABVariant("A");
    const testId = getABTestId() || DEFAULT_TEST_ID;
    const visitorId = getABVisitorId();
    if (!visitorId) return;

    const shouldTrack = shouldTrackRouteImpressionOnce({
      testId,
      variant,
      visitorId,
      route,
    });
    if (!shouldTrack) return;

    trackABEvent({
      testId,
      variant,
      visitorId,
      route,
      eventType: "impression",
      metadata: {
        source: "route-tracker",
        page: route,
      },
    }).catch(() => {});
  }, [pathname]);

  return null;
}
