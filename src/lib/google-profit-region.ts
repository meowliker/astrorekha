import type { AcquisitionFunnel } from "./admin-acquisition";

const INDIA = { id: "6752275511", name: "Astro India", timezone: "Asia/Calcutta", label: "India · IST" } as const;
const USA = { id: "4870113996", name: "Astro USA", timezone: "America/New_York", label: "US · New York" } as const;

/** Workspace region fixes the Google account and its full calendar reporting day. */
export function googleProfitRegion(funnel: AcquisitionFunnel) {
  return funnel === "us-main" || funnel === "us-soulmate" ? USA : INDIA;
}

export function googleProfitToday(funnel: AcquisitionFunnel, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: googleProfitRegion(funnel).timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
