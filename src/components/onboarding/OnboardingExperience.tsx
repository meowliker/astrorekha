"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { ASTROREKHA_ASSETS } from "@/lib/assets";
import { onboardingDestination } from "@/lib/google-ads-funnel";

const GoogleAdsExperience = createContext(false);
const LOCAL_ASSETS = {
  logo: "/logo.webp", elysia: "/elysia.webp", palmScanner: "/palmscanner-optimized.mp4",
  palmOutline: "/palmoutline.webp", male: "/male.webp", female: "/female.webp",
};

/** The route chooses its presentation for every visitor, never a referrer or bot check. */
export function GoogleAdsExperienceProvider({ children }: { children: ReactNode }) {
  return <GoogleAdsExperience.Provider value={true}>{children}</GoogleAdsExperience.Provider>;
}
export const useGoogleAdsExperience = () => useContext(GoogleAdsExperience);
export function useOnboardingAssets() {
  return useGoogleAdsExperience() ? LOCAL_ASSETS : ASTROREKHA_ASSETS;
}

/** Reuse the existing screens and handlers; questions and the Ads paywall stay scoped. */
export function useOnboardingRouter() {
  const router = useNextRouter();
  const googleAds = useGoogleAdsExperience();
  const scoped = useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(onboardingDestination(href, true), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(onboardingDestination(href, true), options),
    prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(onboardingDestination(href, true), options),
  }), [router]);
  return googleAds ? scoped : router;
}
