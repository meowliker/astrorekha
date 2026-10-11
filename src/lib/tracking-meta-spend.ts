import { businessDate } from "@/lib/tracking-dashboard";

export type CampaignSpendRow = {
  campaign_id?: string;
  date_start?: string;
  spend?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const shiftDay = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Allocate Meta's account-local hourly spend to the Profit Sheet's 11:30 IST reporting window. */
export function campaignSpendForBusinessDays(input: {
  hourly: CampaignSpendRow[];
  daily: CampaignSpendRow[];
  start: string;
  end: string;
  timezoneOffsetHoursUtc: number;
  accountWindow: { startMillis: number; endMillis: number };
  nowMillis: number;
}): Map<string, number> {
  const { hourly, daily, start, end, timezoneOffsetHoursUtc, accountWindow, nowMillis } = input;
  const result = new Map<string, number>();
  const add = (campaignId: string, spend: number) => result.set(campaignId, (result.get(campaignId) || 0) + spend);
  const aligned = Math.abs(timezoneOffsetHoursUtc + 6) < 0.01;
  const dailyApplied = new Set<string>();

  if (aligned) for (const row of daily) {
    const day = row.date_start || "";
    const campaignId = row.campaign_id || "";
    if (!campaignId || day < start || day > end) continue;
    const dayStart = Date.parse(`${day}T11:30:00+05:30`);
    if (accountWindow.startMillis > dayStart || accountWindow.endMillis < dayStart + DAY_MS) continue;
    const spend = amount(row.spend);
    if (spend <= 0) continue;
    add(campaignId, spend);
    dailyApplied.add(`${campaignId}:${day}`);
  }

  for (const row of hourly) {
    const campaignId = row.campaign_id || "";
    const day = row.date_start || "";
    if (!campaignId || dailyApplied.has(`${campaignId}:${day}`)) continue;
    const hour = Number(String(row.hourly_stats_aggregated_by_advertiser_time_zone || "").match(/^(\d{1,2}):\d{2}:\d{2}/)?.[1]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const rawStart = Date.parse(`${day}T00:00:00Z`) + (hour - timezoneOffsetHoursUtc) * HOUR_MS;
    if (rawStart >= nowMillis) continue;
    const observedEnd = Math.min(rawStart + HOUR_MS, nowMillis);
    const clippedStart = Math.max(rawStart, accountWindow.startMillis);
    const clippedEnd = Math.min(observedEnd, accountWindow.endMillis);
    if (clippedEnd <= clippedStart) continue;
    const spend = amount(row.spend) * (clippedEnd - clippedStart) / (observedEnd - rawStart);
    const firstDay = businessDate(new Date(clippedStart));
    const lastDay = businessDate(new Date(clippedEnd - 1));
    if (firstDay === lastDay) {
      if (firstDay >= start && firstDay <= end) add(campaignId, spend);
      continue;
    }
    const boundary = Date.parse(`${lastDay}T11:30:00+05:30`);
    const firstShare = (boundary - clippedStart) / (clippedEnd - clippedStart);
    if (firstDay >= start && firstDay <= end) add(campaignId, spend * firstShare);
    if (lastDay >= start && lastDay <= end) add(campaignId, spend * (1 - firstShare));
  }
  return result;
}

export function bufferedMetaRange(start: string, end: string) {
  return { since: shiftDay(start, -2), until: shiftDay(end, 2) };
}
