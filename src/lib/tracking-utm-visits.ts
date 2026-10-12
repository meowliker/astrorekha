import { businessHourBucket, isMetaSource } from "./tracking-dashboard";
import type { getSupabaseAdmin } from "./supabase-admin";

type LandingRow = { created_at: string; url: string | null };

export type TrackingUtmVisit = {
  at: string;
  campaignId: string | null;
  campaignName: string | null;
  source: string | null;
  adsetId: string | null;
  adId: string | null;
  term: string | null;
  content: string | null;
};

const value = (params: URLSearchParams, ...keys: string[]) => {
  for (const key of keys) {
    const text = params.get(key)?.trim();
    if (text) return text;
  }
  return null;
};

/** Only count page views whose actual arrival URL carries campaign tags; stored attribution persists on later pages. */
export function parseTrackedUtmVisit(row: LandingRow): TrackingUtmVisit | null {
  if (!row.url || !Number.isFinite(Date.parse(row.created_at))) return null;
  let url: URL;
  try { url = new URL(row.url); } catch { return null; }
  const params = url.searchParams;
  const campaignId = value(params, "meta_campaign_id", "campaign_id", "campaignid", "utm_campaign_id");
  const campaignName = value(params, "utm_campaign");
  const source = value(params, "utm_source");
  if (!campaignId && !/^\d{8,24}$/.test(campaignName || "") && (!campaignName || !isMetaSource(source))) return null;
  return {
    at: row.created_at, campaignId, campaignName, source,
    adsetId: value(params, "meta_adset_id", "adset_id", "adsetid"),
    adId: value(params, "meta_ad_id", "ad_id", "adid"),
    term: value(params, "utm_term"), content: value(params, "utm_content"),
  };
}

export async function readTrackedUtmVisits(
  supabase: ReturnType<typeof getSupabaseAdmin>, start: string, end: string,
): Promise<TrackingUtmVisit[]> {
  const visits: TrackingUtmVisit[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("marketing_events")
      .select("created_at,url").eq("event_name", "page_view")
      .or("url.ilike.%utm_campaign=%,url.ilike.%campaign_id=%")
      .gte("created_at", start).lt("created_at", end)
      .order("created_at", { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(`Unable to read UTM arrivals: ${error.message}`);
    for (const row of (data || []) as LandingRow[]) {
      const visit = parseTrackedUtmVisit(row);
      if (visit) visits.push(visit);
    }
    if (!data || data.length < 1000) break;
    if (offset >= 99_000) throw new Error("Too many UTM arrivals for this range. Choose fewer days.");
  }
  return visits;
}

export function visitHour(visit: TrackingUtmVisit) {
  return businessHourBucket(new Date(visit.at));
}
