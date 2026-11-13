export type PaymentAttributionPayload = {
  google_campaign_id?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_id?: string;
  click_id?: string;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  landing_path?: string;
  landing_url?: string;
  referrer_url?: string;
  captured_at?: string;
};

const TEXT_LIMIT = 512;

function cleanText(value: unknown, maxLen: number = TEXT_LIMIT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function cleanId(value: unknown): string | null {
  const cleaned = cleanText(value, 128);
  if (!cleaned) return null;
  const normalized = cleaned.replace(/[^a-zA-Z0-9._:-]/g, "");
  return normalized || null;
}

export function sanitizePaymentAttribution(input: unknown): PaymentAttributionPayload {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  let landingParams: URLSearchParams | undefined;
  try { landingParams = new URL(cleanText(raw.landing_url, 2048) || cleanText(raw.landing_path, 2048) || "", "https://astrorekha.com").searchParams; } catch { /* Optional malformed URL. */ }
  const rawCapturedAt = cleanText(raw.captured_at, 64);
  const normalizedCapturedAt =
    rawCapturedAt && !Number.isNaN(new Date(rawCapturedAt).getTime())
      ? new Date(rawCapturedAt).toISOString()
      : undefined;

  const payload: PaymentAttributionPayload = {
    google_campaign_id: cleanId(raw.google_campaign_id || raw.gad_campaignid || landingParams?.get("gad_campaignid")) || undefined,
    gclid: cleanText(raw.gclid || landingParams?.get("gclid"), 512) || undefined,
    gbraid: cleanText(raw.gbraid || landingParams?.get("gbraid"), 512) || undefined,
    wbraid: cleanText(raw.wbraid || landingParams?.get("wbraid"), 512) || undefined,
    fbclid: cleanText(raw.fbclid, 256) || undefined,
    fbc: cleanText(raw.fbc, 256) || undefined,
    fbp: cleanText(raw.fbp, 256) || undefined,
    utm_source: cleanText(raw.utm_source, 128) || undefined,
    utm_medium: cleanText(raw.utm_medium, 128) || undefined,
    utm_campaign: cleanText(raw.utm_campaign, 256) || undefined,
    utm_term: cleanText(raw.utm_term, 256) || undefined,
    utm_content: cleanText(raw.utm_content, 256) || undefined,
    utm_id: cleanText(raw.utm_id, 256) || undefined,
    click_id: cleanText(raw.click_id, 256) || undefined,
    meta_campaign_id: cleanId(raw.meta_campaign_id) || undefined,
    meta_adset_id: cleanId(raw.meta_adset_id) || undefined,
    meta_ad_id: cleanId(raw.meta_ad_id) || undefined,
    landing_path: cleanText(raw.landing_path, 512) || undefined,
    landing_url: cleanText(raw.landing_url, 2048) || undefined,
    referrer_url: cleanText(raw.referrer_url, 2048) || undefined,
    captured_at: normalizedCapturedAt,
  };

  // Auto-tagged Google clicks need no manually configured UTM parameters.
  if (payload.gclid || payload.gbraid || payload.wbraid) {
    payload.utm_source ||= "google";
    payload.utm_medium ||= "cpc";
  }
  if (!payload.click_id) payload.click_id = payload.gclid || payload.gbraid || payload.wbraid;
  if (!payload.click_id && payload.fbclid) {
    payload.click_id = payload.fbclid;
  }

  return payload;
}

/** Prefer a server-captured whole touch; preserve matching cookies without mixing campaigns. */
export function resolvePaymentAttribution(serverTouch: unknown, browserInput: unknown, refererInput: unknown = {}): PaymentAttributionPayload {
  const browser = sanitizePaymentAttribution(browserInput);
  if (serverTouch && typeof serverTouch === "object") {
    const touch = serverTouch as Record<string, unknown>;
    return sanitizePaymentAttribution({
      fbc: browser.fbc, fbp: browser.fbp, ...touch,
      meta_campaign_id: touch.meta_campaign_id || touch.campaign_id,
      meta_adset_id: touch.meta_adset_id || touch.adset_id,
      meta_ad_id: touch.meta_ad_id || touch.ad_id,
    });
  }
  return sanitizePaymentAttribution({ ...sanitizePaymentAttribution(refererInput),
    ...Object.fromEntries(Object.entries(browser).filter(([, value]) => value !== undefined)) });
}
