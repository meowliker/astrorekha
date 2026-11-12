"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingBoundary } from "./MarketingBoundary";

const privateAnalyticsPath = (path: string) =>
  /^\/(support(?:\/.*)?|partner-analytics|admin\/analytics-access)\/?$/.test(path);

export function AppTelemetry({ children }: { children: ReactNode }) {
  const privatePage = privateAnalyticsPath(usePathname());
  const initialPrivate = useRef(privatePage).current;

  useEffect(() => {
    if (privatePage !== initialPrivate) window.location.replace(window.location.href);
  }, [privatePage, initialPrivate]);

  // Credential forms must mount in a fresh document without any previously loaded telemetry.
  if (privatePage !== initialPrivate) return null;
  if (privatePage) return children;
  return <><MarketingBoundary />{children}<Analytics /><SpeedInsights /></>;
}
