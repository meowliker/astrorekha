import type { Metadata } from "next";
import { SoulmateExperience } from "../soulmate-experience";
import { SoulmateDiscoverProvider } from "@/components/soulmate-discover/Experience";

export const metadata: Metadata = {
  title: "Personalized AI Soulmate Sketch | AstroRekha",
  description: "Explore a personalized AI-generated digital portrait for personal reflection. Review examples, packages, full prices and delivery information before ordering.",
  alternates: { canonical: "https://astrorekha.com/soulmate/discover" },
};
export default function DiscoverSoulmate() {
  return <SoulmateDiscoverProvider region="india"><SoulmateExperience visitorLocation={null} /></SoulmateDiscoverProvider>;
}
