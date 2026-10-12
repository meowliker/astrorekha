import assert from "node:assert/strict";
import type { TrackingCampaign } from "../src/lib/tracking-dashboard";
import { buildTrackingHourlyTable } from "../src/lib/tracking-hourly-table";
import { campaignHourlySpendForBusinessDays } from "../src/lib/tracking-meta-spend";
import { normalizeTrackingView } from "../src/lib/tracking-views";

const day = "2026-10-12";
const start = Date.parse(`${day}T11:30:00+05:30`);
const aligned = campaignHourlySpendForBusinessDays({
  hourly: [
    { campaign_id: "123", date_start: day, spend: "100", hourly_stats_aggregated_by_advertiser_time_zone: "00:00:00 - 00:59:59" },
    { campaign_id: "123", date_start: day, spend: "100", hourly_stats_aggregated_by_advertiser_time_zone: "01:00:00 - 01:59:59" },
  ],
  daily: [{ campaign_id: "123", date_start: day, spend: "240" }],
  start: day, end: day, timezoneOffsetHoursUtc: -6,
  accountWindow: { startMillis: start, endMillis: start + 86_400_000 },
  nowMillis: start + 172_800_000,
});
assert.equal(aligned.get("123")?.[day][0], 120);
assert.equal(aligned.get("123")?.[day][1], 120);

const crossing = campaignHourlySpendForBusinessDays({
  hourly: [
    { campaign_id: "123", date_start: day, spend: "60", hourly_stats_aggregated_by_advertiser_time_zone: "00:00:00 - 00:59:59" },
    { campaign_id: "123", date_start: day, spend: "80", hourly_stats_aggregated_by_advertiser_time_zone: "01:00:00 - 01:59:59" },
  ],
  daily: [], start: "2026-10-11", end: day, timezoneOffsetHoursUtc: -5,
  accountWindow: { startMillis: start - 86_400_000, endMillis: start + 86_400_000 },
  nowMillis: start + 172_800_000,
});
assert.equal(crossing.get("123")?.["2026-10-11"][23], 60);
assert.equal(crossing.get("123")?.[day][0], 80);

const campaigns = [
  { key: "meta:1:123", campaignName: "Meta campaign", accountId: "1", spendInr: 240 },
  { key: "unattributed", campaignName: "Unattributed", accountId: null, spendInr: null },
] as TrackingCampaign[];
const summary = {
  hourly: [
    { date: day, hour: 0, campaignKey: "meta:1:123", orders: 1, revenue: 240 },
    { date: day, hour: 0, campaignKey: "unattributed", orders: 1, revenue: 60 },
  ],
  hourlySpendInr: { "meta:1:123": { [day]: aligned.get("123")?.[day] || [] } },
};
const roas = buildTrackingHourlyTable(summary, campaigns, day, "roas");
assert.equal(roas.totals[0], 2.5);
assert.equal(roas.totals[1], 0);
assert.equal(roas.totals[2], null);
assert.equal(roas.campaigns.find((row) => row.key === "meta:1:123")?.hours[0], 2);
assert.equal(roas.campaigns.find((row) => row.key === "unattributed")?.hours[0], null);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "orders").totals[0], 2);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "revenue").totals[0], 300);
assert.equal(normalizeTrackingView({ columnIds: ["campaign"], hourMetric: "roas" })?.hourMetric, "roas");
console.log("Tracking hourly ROAS checks passed");
