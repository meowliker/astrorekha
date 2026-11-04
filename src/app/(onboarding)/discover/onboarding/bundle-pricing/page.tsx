import type { Metadata } from "next";
import BundlePricingPage from "../../../onboarding/bundle-pricing/page";
import { GoogleAdsExperienceProvider } from "@/components/onboarding/OnboardingExperience";

export const metadata: Metadata = { title: "Choose Your Digital Reading | AstroRekha", robots: { index: false, follow: false } };
export default function DiscoverBundlePricingPage() {
  return <GoogleAdsExperienceProvider><BundlePricingPage /></GoogleAdsExperienceProvider>;
}
