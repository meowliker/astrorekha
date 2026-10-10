import { cookies } from "next/headers";
import { gaSessionCookieName, parseGaClientId, parseGaSessionId } from "@/lib/ga-cookie-parsers";

export type AttributionTouch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  fbclid: string | null;
  landing_path: string | null;
  captured_at: string | null;
};

function parseTouch(raw: string | undefined): AttributionTouch | null {
  if (!raw) return null;
  try {
    const input = JSON.parse(raw) as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const read = (key: keyof AttributionTouch) =>
      typeof input[key] === "string" ? input[key].slice(0, 512) : null;
    return {
      utm_source: read("utm_source"), utm_medium: read("utm_medium"),
      utm_campaign: read("utm_campaign"), utm_term: read("utm_term"),
      utm_content: read("utm_content"), campaign_id: read("campaign_id"),
      adset_id: read("adset_id"), ad_id: read("ad_id"), fbclid: read("fbclid"),
      landing_path: read("landing_path"), captured_at: read("captured_at"),
    };
  } catch {
    return null;
  }
}

/** Read the first-party touch and GA cookies at server-side order creation. */
export async function readOrderAttribution() {
  const jar = await cookies();
  const firstTouch = parseTouch(jar.get("ar_utm_first")?.value);
  const lastTouch = parseTouch(jar.get("ar_utm_last")?.value);
  const sessionCookie = gaSessionCookieName(
    process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID
  );
  return {
    firstTouch,
    lastTouch,
    gaClientId: parseGaClientId(jar.get("_ga")?.value),
    gaSessionId: sessionCookie ? parseGaSessionId(jar.get(sessionCookie)?.value) : null,
  };
}
