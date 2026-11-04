import type { Metadata } from "next";
import WelcomeClient from "../welcome/WelcomeClient";
import { GoogleAdsExperienceProvider } from "@/components/onboarding/OnboardingExperience";

export const metadata: Metadata = {
  title: "AstroRekha | Personalized AI Palm Reading",
  description: "Explore AI-generated palm readings and birth-chart insights for personal reflection. Complete the steps, then choose a one-time digital report bundle.",
  alternates: { canonical: "https://astrorekha.com/discover" },
};

export default function GoogleAdsEntry() {
  return <GoogleAdsExperienceProvider><WelcomeClient /></GoogleAdsExperienceProvider>;
}
