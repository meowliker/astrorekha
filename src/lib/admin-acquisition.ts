/** Read-only reporting. Explicit attribution wins; untagged entry pages use the owner-configured channel mapping. */
export type AcquisitionChannel = "meta" | "google" | "other";
export type AcquisitionFilter = "all" | "meta" | "google" | "both";
export type AcquisitionFunnel = "astrorekha" | "soulmate" | "us-soulmate" | "us-main";
export type Attribution = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function acquisitionTouch(row: Attribution): Attribution {
  // Use one whole touch; do not mix a new Google visit with old Meta cookies.
  const attribution = row.attribution as Attribution | null;
  const touches = [row.last_touch, attribution?.lastTouch, attribution?.marketing, attribution && (attribution.utm_source || attribution.gclid || attribution.landing_path) ? attribution : null];
  for (const touch of touches) {
    if (touch && typeof touch === "object" && Object.values(touch).some(Boolean)) return touch as Attribution;
  }
  // Legacy orders sometimes saved only the landing path in the attribution envelope.
  return attribution?.landing_path ? { ...row, landing_path: attribution.landing_path } : row;
}
export function acquisitionTags(touch: Attribution): Attribution {
  let query: URLSearchParams | null = null;
  try { query = new URL(text(touch.url) || text(touch.landing_url) || text(touch.landing_path), "https://astrorekha.com").searchParams; } catch { /* Older saved touches may have no URL. */ }
  const tags = { ...touch };
  if (query) for (const key of ["utm_source", "utm_medium", "utm_campaign", "gclid", "gbraid", "wbraid", "meta_campaign_id", "meta_adset_id", "meta_ad_id"]) {
    if (query.get(key)) tags[key] = query.get(key);
  }
  for (const [target, aliases] of Object.entries({meta_campaign_id:["campaign_id","fb_campaign_id"],meta_adset_id:["adset_id","fb_adset_id"],meta_ad_id:["ad_id","fb_ad_id"],google_campaign_id:["gad_campaignid"]})) {
    for (const alias of aliases) if (!tags[target]) tags[target] = query?.get(alias) || tags[alias];
  }
  return tags;
}
/** Reporting fallback only, not a claim that Google/Meta attributed a conversion. */
export function landingRouteChannel(raw: Attribution): AcquisitionChannel {
  const candidate = text(raw.landing_url) || text(raw.url) || text(raw.landing_path) || text(raw.path) || text(raw.route);
  if (!candidate) return "other";
  try {
    const url = new URL(candidate, "https://astrorekha.com");
    if (!["astrorekha.com", "www.astrorekha.com", "localhost", "127.0.0.1"].includes(url.hostname)) return "other";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (/^\/(?:discover|soulmate\/discover|us\/soulmate\/discover)(?:\/|$)/.test(path)) return "google";
    if (["/", "/us", "/soulmate", "/us/soulmate"].includes(path)) return "meta";
  } catch { /* Invalid or unavailable landing evidence remains unclassified. */ }
  return "other";
}
export function acquisitionChannel(raw: Attribution): AcquisitionChannel {
  const tags = acquisitionTags(raw);
  const source = text(tags.utm_source).toLowerCase();
  const medium = text(tags.utm_medium).toLowerCase();
  const paid = /^(cpc|ppc|paid|paidsearch|paid_search|paid_social|paid-social|paidsocial|paid social|cpm)$/;
  if (["gclid", "gbraid", "wbraid"].some((key) => text(tags[key]))) return "google";
  if (/^(google|google_ads|googleads)$/.test(source) && paid.test(medium)) return "google";
  // Explicit organic or unrelated sources override lingering Meta identifiers.
  if (source && !/^(meta|facebook|instagram|fb|ig|facebook\.com|instagram\.com|m\.facebook\.com|l\.facebook\.com|l\.instagram\.com)$/.test(source)) return "other";
  if (medium && /^(organic|referral|social|email)$/.test(medium)) return "other";
  if (["meta_campaign_id", "meta_adset_id", "meta_ad_id"].some((key) => /^\d+$/.test(text(tags[key])))) return "meta";
  if (source && paid.test(medium)) return "meta";
  // Do not replace incomplete/explicit tags with a route assumption.
  if (source || medium) return "other";
  return landingRouteChannel(tags);
}
export function isAcquisitionTest(row: Attribution) {
  const tags = acquisitionTags(acquisitionTouch(row));
  const attribution = row.attribution as Attribution | null;
  const metadata = row.metadata as Attribution | null;
  return text(tags.utm_source).toLowerCase() === "codex_qa" ||
    [attribution?.trackingEnvironment, metadata?.trackingEnvironment].some((value) => value && value !== "production");
}
export type AcquisitionRecord = { id: string; at: string; channel: AcquisitionChannel; campaign: string; product: string; currency: string; amount: number };
export type AcquisitionLanding = { id: string; at: string; channel: AcquisitionChannel; campaign: string };
export type AcquisitionTotals = { orders: number; grossMinor: number };
export type AcquisitionReport = ReturnType<typeof summarizeAcquisition>;
export function summarizeAcquisition(orders: AcquisitionRecord[], landings: AcquisitionLanding[], filter: AcquisitionFilter, offsetMinutes: number, defaultCurrency = "INR") {
  const matches = (channel: AcquisitionChannel) => filter === "all" || filter === channel || filter === "both" && channel !== "other";
  const day = (at: string) => new Date(Date.parse(at) + offsetMinutes * 60000).toISOString().slice(0, 10);
  const totals = new Map<string, AcquisitionTotals & { channel: AcquisitionChannel; currency: string }>();
  const products = new Map<string, AcquisitionTotals & { product: string; channel: AcquisitionChannel; currency: string }>();
  const daily = new Map<string, AcquisitionTotals & { date: string; channel: AcquisitionChannel; currency: string }>();
  const campaigns = new Map<string, AcquisitionTotals & { campaign: string; channel: AcquisitionChannel; currency: string }>();
  const zero = (): AcquisitionTotals => ({ orders: 0, grossMinor: 0 });
  const currencies = [...new Set(orders.filter((row) => matches(row.channel)).map((row) => row.currency))];
  if (!currencies.length) currencies.push(defaultCurrency);
  for (const channel of ["meta", "google", "other"] as const) if (matches(channel)) for (const currency of currencies) totals.set(JSON.stringify([channel, currency]), { ...zero(), channel, currency });
  const seen = new Set<string>();
  for (const row of orders) {
    if (!matches(row.channel) || seen.has(row.id)) continue;
    seen.add(row.id);
    const key = JSON.stringify([row.channel, row.currency]);
    const total = totals.get(key)!; total.orders++; total.grossMinor += row.amount;
    const date = day(row.at);
    for (const [map, value, label] of [[products, row.product, "product"], [daily, date, "date"], [campaigns, row.campaign, "campaign"]] as const) {
      const groupKey = JSON.stringify([row.channel, row.currency, value]);
      // Each map has a different label but the exact same aggregate fields.
      const target = map as Map<string, AcquisitionTotals & Record<string, string | number>>;
      const aggregate = target.get(groupKey) || { ...zero(), [label]: value, channel: row.channel, currency: row.currency };
      aggregate.orders++; aggregate.grossMinor += row.amount; target.set(groupKey, aggregate);
    }
  }
  const views = new Set<string>();
  const landingCounts: Record<AcquisitionChannel, number> = { meta: 0, google: 0, other: 0 };
  for (const row of landings) {
    if (!matches(row.channel) || views.has(row.id)) continue;
    views.add(row.id); landingCounts[row.channel]++;
  }
  return { totals: [...totals.values()], products: [...products.values()].sort((a, b) => b.grossMinor - a.grossMinor), daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), campaigns: [...campaigns.values()].sort((a, b) => b.grossMinor - a.grossMinor), landingCounts, otherOrders: new Set(orders.filter((row) => row.channel === "other").map((row) => row.id)).size };
}

export type AdSource = "all" | "meta" | "google";
/** Workspace membership is separate from paid-ad attribution. Normal workspaces
 * retain Instagram, organic, direct and untagged receipts; only Google traffic
 * and the dedicated Google funnel destinations belong in Google workspaces. */
export function workspaceChannel(row: Attribution): "meta" | "google" {
  const touch = acquisitionTouch(row);
  return acquisitionChannel(touch) === "google" || landingRouteChannel(touch) === "google" ? "google" : "meta";
}
export function parseAdSource(params: URLSearchParams): AdSource {
  const value = params.get("adSource") || "all";
  if (value !== "all" && value !== "meta" && value !== "google") throw new Error("Invalid ad source.");
  return value;
}
export function matchesAdSource(row: object, source: AdSource) {
  return source === "all" || !isAcquisitionTest(row as Attribution) && workspaceChannel(row as Attribution) === source;
}
export function gaSourceFilter(source: AdSource) {
  if (source === "all") return undefined;
  const google = { orGroup: { expressions: [
    { andGroup: { expressions: [
      { filter: { fieldName: "sessionSource", stringFilter: { matchType: "FULL_REGEXP" as const, value: "(?i)(google|google_ads|googleads)", caseSensitive: false } } },
      { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "FULL_REGEXP" as const, value: "(?i)(cpc|ppc|paid|paidsearch|paid_search|paid_social|paid-social|paidsocial|paid social|cpm)", caseSensitive: false } } },
    ] } },
    { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "FULL_REGEXP" as const, value: "^/(discover|soulmate/discover|us/soulmate/discover)([/\\?].*)?$", caseSensitive: false } } },
  ] } };
  return source === "google" ? google : { notExpression: google };
}

/** Refunds inherit the original purchase source, never the refund callback's tags. */
export function filterSourcePayments<T extends object>(rows: T[], source: AdSource, attribution: "first" | "last" = "last"): T[] {
  if (source === "all") return rows;
  const matches = (row: T) => !isAcquisitionTest(row as Attribution) && matchesAdSource(attribution === "first" ? { last_touch: (row as Attribution).first_touch || {} } : row, source);
  const parents = new Map<string, T>();
  for (const row of rows) {
    const r = row as Attribution;
    if (String(r.id).startsWith("pay_refund_") || Number(r.amount) < 0) continue;
    for (const key of [r.id, r.payu_txn_id, r.razorpay_order_id]) if (key) parents.set(String(key), row);
  }
  return rows.filter(row => {
    const r = row as Attribution;
    if (!String(r.id).startsWith("pay_refund_") && Number(r.amount) >= 0) return matches(row);
    const parent = parents.get(String(r.payu_txn_id)) || parents.get(`pay_${r.payu_txn_id}`) || parents.get(String(r.razorpay_order_id));
    return !!parent && matches(parent);
  });
}
export function filterSourceEvents<T extends { session_id?: string | null }>(events: T[], source: AdSource): T[] {
  if (source === "all") return events;
  const sessions = new Map<string, string>();
  for (const event of events) {
    const touch = acquisitionTouch(event as Attribution);
    const channel = workspaceChannel(event as Attribution);
    const hasEvidence = acquisitionChannel(touch) !== "other" || text(touch.utm_source) || text(touch.utm_medium) || channel === "google";
    if (event.session_id && hasEvidence && !sessions.has(event.session_id)) sessions.set(event.session_id, channel);
  }
  return events.filter(e => !isAcquisitionTest(e as Attribution) &&
    (e.session_id && sessions.has(e.session_id) ? sessions.get(e.session_id) === source : matchesAdSource(e, source)));
}
