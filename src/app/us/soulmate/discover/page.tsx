import type { Metadata } from "next";
import { SoulmateExperience } from "../soulmate-experience";
import { SoulmateDiscoverProvider } from "@/components/soulmate-discover/Experience";

export const metadata: Metadata = {
  title: "Personalized AI Soulmate Sketch in USD | AstroRekha",
  description: "Explore a personalized AI-generated digital portrait for personal reflection. Review USD packages and full prices. Pay securely by card through Stripe.",
  alternates: { canonical: "https://astrorekha.com/us/soulmate/discover" },
};
export default function DiscoverUSSoulmate() {
  return <SoulmateDiscoverProvider region="us"><SoulmateExperience visitorLocation={null} /></SoulmateDiscoverProvider>;
}
