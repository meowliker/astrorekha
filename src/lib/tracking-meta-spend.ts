import { businessDate } from "./tracking-dashboard";

export type CampaignSpendRow = {
  campaign_id?: string;
  date_start?: string;
  spend?: string;
  inline_link_clicks?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const shiftDay = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Meta can return hourly rows for a multi-day range whose sum differs from its daily spend. Keep the hourly shape, anchored to the daily total. */
export function normalizeHourlySpendToDailyTotals(hourly: CampaignSpendRow[], daily: CampaignSpendRow[]): CampaignSpendRow[] {
  const key = (row: CampaignSpendRow) => `${row.campaign_id || ""}:${row.date_start || ""}`;
  const hourlyTotals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();
  for (const row of hourly) hourlyTotals.set(key(row), (hourlyTotals.get(key(row)) || 0) + amount(row.spend));
  for (const row of daily) dailyTotals.set(key(row), (dailyTotals.get(key(row)) || 0) + amount(row.spend));
  return hourly.map((row) => {
    const total = hourlyTotals.get(key(row)) || 0;
    const target = dailyTotals.get(key(row));
    if (total <= 0 || target == null) return row;
    return { ...row, spend: String(amount(row.spend) * target / total) };
  });
}

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

/** Allocate account-local clock-hour metrics into 11:30 AM IST business windows. */
export function campaignHourlySpendForBusinessDays(input: {
  hourly: CampaignSpendRow[];
  daily: CampaignSpendRow[];
  start: string;
  end: string;
  timezoneOffsetHoursUtc: number;
  accountWindow: { startMillis: number; endMillis: number };
  nowMillis: number;
  metric?: "spend" | "inline_link_clicks";
}): Map<string, Record<string, number[]>> {
  const { hourly, daily, start, end, timezoneOffsetHoursUtc, accountWindow, nowMillis } = input;
  const metric = input.metric || "spend";
  const result = new Map<string, Record<string, number[]>>();
  const rangeStart = Date.parse(`${start}T11:30:00+05:30`);
  const rangeEnd = Date.parse(`${shiftDay(end, 1)}T11:30:00+05:30`);
  for (const row of hourly) {
    const campaignId = row.campaign_id || "";
    const day = row.date_start || "";
    const hour = Number(String(row.hourly_stats_aggregated_by_advertiser_time_zone || "").match(/^(\d{1,2}):\d{2}:\d{2}/)?.[1]);
    if (!campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const rawStart = Date.parse(`${day}T00:00:00Z`) + (hour - timezoneOffsetHoursUtc) * HOUR_MS;
    const observedEnd = Math.min(rawStart + HOUR_MS, nowMillis);
    if (observedEnd <= rawStart) continue;
    const clippedStart = Math.max(rawStart, accountWindow.startMillis, rangeStart);
    const clippedEnd = Math.min(observedEnd, accountWindow.endMillis, rangeEnd);
    if (clippedEnd <= clippedStart) continue;
    const spend = amount(row[metric]) * (clippedEnd - clippedStart) / (observedEnd - rawStart);
    const days = result.get(campaignId) || {};
    for (let bucket = Math.floor((clippedStart - rangeStart) / HOUR_MS); bucket <= Math.floor((clippedEnd - rangeStart - 1) / HOUR_MS); bucket++) {
      const bucketStart = rangeStart + bucket * HOUR_MS;
      const overlap = Math.min(clippedEnd, bucketStart + HOUR_MS) - Math.max(clippedStart, bucketStart);
      const businessDay = shiftDay(start, Math.floor(bucket / 24));
      const values = days[businessDay] || Array(24).fill(0);
      values[bucket % 24] += spend * overlap / (clippedEnd - clippedStart);
      days[businessDay] = values;
    }
    result.set(campaignId, days);
  }

  // When the ad account calendar aligns exactly with the business day, the
  // dashboard uses Meta's daily total. Scale its hourly shape to that total.
  if (metric === "spend" && Math.abs(timezoneOffsetHoursUtc + 6) < 0.01) for (const row of daily) {
    const campaignId = row.campaign_id || "";
    const day = row.date_start || "";
    if (!campaignId || day < start || day > end) continue;
    const dayStart = Date.parse(`${day}T11:30:00+05:30`);
    if (accountWindow.startMillis > dayStart || accountWindow.endMillis < dayStart + DAY_MS) continue;
    const target = amount(row.spend);
    const values = result.get(campaignId)?.[day];
    const current = values?.reduce((sum, value) => sum + value, 0) || 0;
    if (target > 0 && current > 0) values!.forEach((value, index) => { values![index] = value * target / current; });
  }
  return result;
}

export function bufferedMetaRange(start: string, end: string) {
  return { since: shiftDay(start, -2), until: shiftDay(end, 2) };
}
