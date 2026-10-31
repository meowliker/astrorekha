import type { Metadata } from "next";
import { headers } from "next/headers";
import { SoulmateExperience } from "./soulmate-experience";

// Each visitor must receive their own location, never another visitor's cached city.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Soulmate Sketch | Astro Rekha",
  description:
    "Put a face to the possibilities of love. Discover a personalized AI soulmate sketch with Astro Rekha.",
};

export default async function SoulmatePage() {
  const requestHeaders = await headers();
  const encodedCity = requestHeaders.get("x-vercel-ip-city");
  const country = requestHeaders.get("x-vercel-ip-country");
  let city: string | null = null;

  if (encodedCity) {
    try {
      city = decodeURIComponent(encodedCity).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || null;
    } catch {
      // Malformed or missing geolocation must not prevent the page from loading.
    }
  }

  const visitorLocation = city
    ? [city, country && /^[A-Z]{2}$/.test(country) ? country : null].filter(Boolean).join(", ")
    : null;

  return <SoulmateExperience visitorLocation={visitorLocation} />;
}
