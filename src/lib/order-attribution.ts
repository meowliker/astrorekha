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
  google_campaign_id: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  landing_path: string | null;
  captured_at: string | null;
};

export function parseTouch(raw: string | undefined): AttributionTouch | null {
  if (!raw) return null;
  try {
    const input = JSON.parse(raw) as Record<string, unknown>;
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const read = (key: keyof AttributionTouch) =>
      typeof input[key] === "string" ? input[key].slice(0, 512) : null;
    return {
      utm_source: read("utm_source"), utm_medium: read("utm_medium"),
      utm_campaign: read("utm_campaign"), utm_term: read("utm_term"),
      utm_content: read("utm_content"), campaign_id: read("campaign_id") || (typeof input.meta_campaign_id === "string" ? input.meta_campaign_id.slice(0, 128) : null),
      adset_id: read("adset_id") || (typeof input.meta_adset_id === "string" ? input.meta_adset_id.slice(0, 128) : null), ad_id: read("ad_id") || (typeof input.meta_ad_id === "string" ? input.meta_ad_id.slice(0, 128) : null), fbclid: read("fbclid"),
      google_campaign_id: read("google_campaign_id") || (typeof input.gad_campaignid === "string" ? input.gad_campaignid.slice(0, 128) : null),
      gclid: read("gclid"), gbraid: read("gbraid"), wbraid: read("wbraid"),
      landing_path: read("landing_path"), captured_at: read("captured_at"),
    };
  } catch {
    return null;
  }
}

/** Read the first-party touch and GA cookies at server-side order creation. */
export async function readOrderAttribution(scope: "main" | "soulmate" = "main") {
  const jar = await cookies();
  const prefix = scope === "soulmate" ? "ar_soulmate_utm" : "ar_utm";
  const read = (kind: "first" | "last") => {
    const touch = parseTouch(jar.get(`${prefix}_${kind}`)?.value);
    if (touch && (scope !== "main" || !/^\/(?:us|soulmate)(?:\/|$)/.test(touch.landing_path || ""))) return touch;
    // Only adopt legacy shared cookies if their landing belongs to this funnel.
    const legacy = parseTouch(jar.get(`ar_utm_${kind}`)?.value);
    return scope === "soulmate" && /^\/soulmate(?:\/|$)/.test(legacy?.landing_path || "") ? legacy : null;
  };
  const firstTouch = read("first"), lastTouch = read("last");
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
