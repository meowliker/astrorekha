import { trackingHourBucket, type TrackingActivity, type TrackingCampaign, type TrackingDayMode } from "@/lib/tracking-dashboard";

export type TrackingBudgetMarker = {
  at: string;
  object: string;
  objectType: string;
  before: number;
  after: number;
  currency: string;
  detail: string;
};

/** Place real Meta budget edits in the same IST windows as hourly sales. */
export function hourlyBudgetMarkers(
  activities: TrackingActivity[],
  campaigns: Array<Pick<TrackingCampaign, "key" | "accountId" | "campaignId">>,
  day: string,
  dayMode: TrackingDayMode,
): Record<string, TrackingBudgetMarker[][]> {
  const byCampaign = new Map(campaigns.filter((row) => row.accountId && row.campaignId)
    .map((row) => [`${row.accountId}:${row.campaignId}`, row.key]));
  const markers: Record<string, TrackingBudgetMarker[][]> = {};
  for (const activity of activities) {
    if (!activity.budgetChange || !activity.campaignId || !activity.at) continue;
    const key = byCampaign.get(`${activity.accountId}:${activity.campaignId}`);
    if (!key) continue;
    const at = new Date(activity.at);
    if (Number.isNaN(at.getTime())) continue;
    const bucket = trackingHourBucket(at, dayMode);
    if (bucket.date !== day || bucket.hour < 0 || bucket.hour >= 24) continue;
    const hours = markers[key] ||= Array.from({ length: 24 }, () => []);
    hours[bucket.hour].push({ at: activity.at, object: activity.object, objectType: activity.objectType,
      ...activity.budgetChange, detail: activity.detail });
  }
  for (const hours of Object.values(markers)) for (const changes of hours) changes.sort((a, b) => a.at.localeCompare(b.at));
  return markers;
}
