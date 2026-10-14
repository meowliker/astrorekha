import assert from "node:assert/strict";
import { accountTrackingDayMode, trackingDate, trackingDayStartUtc, trackingHourBucket, type TrackingCampaign } from "../src/lib/tracking-dashboard";
import { buildTrackingHourlyTable } from "../src/lib/tracking-hourly-table";
import { campaignHourlySpendForBusinessDays, campaignSpendForBusinessDays, metaPurchasesMatchBusinessWindow, metaPurchasesMatchWindow, normalizeHourlySpendToDailyTotals } from "../src/lib/tracking-meta-spend";
import { normalizeTrackingView } from "../src/lib/tracking-views";
import { parseTrackedUtmVisit, visitHour } from "../src/lib/tracking-utm-visits";

const day = "2026-10-12";
const start = Date.parse(`${day}T11:30:00+05:30`);
const fullBusinessWindow = { startMillis: start, endMillis: start + 86_400_000 };
assert.equal(metaPurchasesMatchBusinessWindow("America/Costa_Rica", fullBusinessWindow, { start: day, end: day }), true);
assert.equal(metaPurchasesMatchBusinessWindow("Asia/Kolkata", fullBusinessWindow, { start: day, end: day }), false);
assert.equal(metaPurchasesMatchBusinessWindow("America/Costa_Rica", { startMillis: start + 1, endMillis: start + 86_400_000 }, { start: day, end: day }), false);
assert.equal(metaPurchasesMatchBusinessWindow("America/Costa_Rica", fullBusinessWindow, { start: day, end: "2026-10-13" }), false);
const midnightIst = Date.parse(trackingDayStartUtc(day, "calendar_ist"));
const fullIndianWindow = { startMillis: midnightIst, endMillis: midnightIst + 86_400_000 };
assert.equal(accountTrackingDayMode("Asia/Kolkata"), "calendar_ist");
assert.equal(accountTrackingDayMode("America/Costa_Rica"), "business_1130_ist");
assert.equal(metaPurchasesMatchWindow("Asia/Kolkata", fullIndianWindow, { start: day, end: day }, "calendar_ist"), true);
assert.equal(metaPurchasesMatchWindow("America/Costa_Rica", fullIndianWindow, { start: day, end: day }, "calendar_ist"), false);
assert.equal(metaPurchasesMatchWindow("Asia/Kolkata", { ...fullIndianWindow, startMillis: midnightIst + 1 }, { start: day, end: day }, "calendar_ist"), false);
const earlyMorning = new Date(`${day}T02:15:00+05:30`);
assert.equal(trackingDate(earlyMorning, "calendar_ist"), day);
assert.deepEqual(trackingHourBucket(earlyMorning, "calendar_ist"), { date: day, hour: 2 });
assert.deepEqual(trackingHourBucket(earlyMorning, "business_1130_ist"), { date: "2026-10-11", hour: 14 });
assert.deepEqual(visitHour({ at: earlyMorning.toISOString(), campaignId: "123", campaignName: null, source: "facebook", adsetId: null, adId: null, term: null, content: null }, "calendar_ist"), { date: day, hour: 2 });
const normalized = normalizeHourlySpendToDailyTotals([
  { campaign_id: "123", date_start: day, spend: "60" },
  { campaign_id: "123", date_start: day, spend: "50" },
], [{ campaign_id: "123", date_start: day, spend: "100" }]);
assert.equal(Number(normalized.reduce((sum, row) => sum + Number(row.spend), 0).toFixed(2)), 100);
assert.equal(Number(normalized[0].spend), 60 * 100 / 110);
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
const indianHourly = [
  { campaign_id: "123", date_start: day, spend: "100", hourly_stats_aggregated_by_advertiser_time_zone: "00:00:00 - 00:59:59" },
  { campaign_id: "123", date_start: day, spend: "100", hourly_stats_aggregated_by_advertiser_time_zone: "01:00:00 - 01:59:59" },
];
const indianDaily = [{ campaign_id: "123", date_start: day, spend: "240" }];
const indianInput = { hourly: indianHourly, daily: indianDaily, start: day, end: day,
  timezoneOffsetHoursUtc: 5.5, accountWindow: fullIndianWindow, nowMillis: midnightIst + 86_400_000,
  dayMode: "calendar_ist" as const };
assert.equal(campaignSpendForBusinessDays(indianInput).get("123"), 240);
assert.deepEqual(campaignHourlySpendForBusinessDays(indianInput).get("123")?.[day].slice(0, 2), [120, 120]);
assert.equal(campaignHourlySpendForBusinessDays(indianInput).get("123")?.[day].reduce((sum, value) => sum + value, 0), 240);
assert.equal(campaignSpendForBusinessDays({ ...indianInput, dayMode: "business_1130_ist" }).get("123") || 0, 0);
const usAccountOnIndianClock = { hourly: [
  { campaign_id: "123", date_start: "2026-10-11", spend: "100", hourly_stats_aggregated_by_advertiser_time_zone: "12:00:00 - 12:59:59" },
  { campaign_id: "123", date_start: "2026-10-11", spend: "50", hourly_stats_aggregated_by_advertiser_time_zone: "13:00:00 - 13:59:59" },
], daily: [], start: day, end: day, timezoneOffsetHoursUtc: -6,
accountWindow: fullIndianWindow, nowMillis: midnightIst + 86_400_000, dayMode: "calendar_ist" as const };
assert.equal(campaignSpendForBusinessDays(usAccountOnIndianClock).get("123"), 100);
assert.deepEqual(campaignHourlySpendForBusinessDays(usAccountOnIndianClock).get("123")?.[day].slice(0, 2), [75, 25]);

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

// Meta displays 11:00–12:00 and 12:00–13:00; the Profit Sheet cell spans 11:30–12:30.
const istWindow = campaignHourlySpendForBusinessDays({
  hourly: [
    { campaign_id: "123", date_start: day, spend: "1856", hourly_stats_aggregated_by_advertiser_time_zone: "11:00:00 - 11:59:59" },
    { campaign_id: "123", date_start: day, spend: "1784.86", hourly_stats_aggregated_by_advertiser_time_zone: "12:00:00 - 12:59:59" },
  ],
  daily: [], start: day, end: day, timezoneOffsetHoursUtc: 5.5,
  accountWindow: { startMillis: start, endMillis: start + 86_400_000 },
  nowMillis: start + 86_400_000,
});
assert.equal(Number(istWindow.get("123")?.[day][0].toFixed(2)), 1820.43);
const hourlyClicks = campaignHourlySpendForBusinessDays({
  hourly: [{ campaign_id: "123", date_start: day, spend: "120", inline_link_clicks: "12", hourly_stats_aggregated_by_advertiser_time_zone: "11:00:00 - 11:59:59" }],
  daily: [], start: day, end: day, timezoneOffsetHoursUtc: 5.5,
  accountWindow: { startMillis: start, endMillis: start + 86_400_000 }, nowMillis: start + 86_400_000,
  metric: "inline_link_clicks",
});
assert.equal(hourlyClicks.get("123")?.[day][0], 6);

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
  hourlyUtmVisits: { "meta:1:123": { [day]: [8, 6] } },
  utmVisitsAvailable: true,
};
const roas = buildTrackingHourlyTable(summary, campaigns, day, "roas");
assert.equal(roas.totals[0], 2.5);
assert.equal(roas.totals[1], 0);
assert.equal(roas.totals[2], null);
assert.equal(roas.campaigns.find((row) => row.key === "meta:1:123")?.hours[0], 2);
assert.equal(roas.campaigns.find((row) => row.key === "unattributed")?.hours[0], null);
assert.deepEqual({ ...roas.campaigns.find((row) => row.key === "meta:1:123")?.details[0], cvr: null }, { orders: 1, revenue: 240, spend: 120, visits: 8, roas: 2, cvr: null });
assert.equal(roas.campaigns.find((row) => row.key === "meta:1:123")?.details[0].cvr?.toFixed(2), "12.50");
assert.deepEqual({ ...roas.totalDetails[0], cvr: null }, { orders: 2, revenue: 300, spend: 120, visits: 8, roas: 2.5, cvr: null });
assert.equal(roas.totalDetails[0].cvr?.toFixed(2), "12.50");
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "roas", false).totalDetails[0].spend, null);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "roas", true, new Set(["1"])).campaigns[0].details[0].spend, null);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "orders").totals[0], 2);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "revenue").totals[0], 300);
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "cvr").totals[0]?.toFixed(2), "12.50");
assert.equal(buildTrackingHourlyTable(summary, campaigns, day, "cvr", false).totals[0]?.toFixed(2), "12.50");
assert.equal(buildTrackingHourlyTable({ ...summary, utmVisitsAvailable: false }, campaigns, day, "cvr").totals[0], null);
assert.equal(parseTrackedUtmVisit({ created_at: `${day}T13:00:00Z`, url: "https://astrorekha.com/?utm_source=facebook&utm_campaign=TEST&campaign_id=123" })?.campaignId, "123");
assert.equal(parseTrackedUtmVisit({ created_at: `${day}T13:00:00Z`, url: "https://astrorekha.com/dashboard?utm_source=facebook" }), null);
assert.equal(parseTrackedUtmVisit({ created_at: `${day}T13:00:00Z`, url: "https://astrorekha.com/?utm_campaign=TEST" }), null);
assert.equal(parseTrackedUtmVisit({ created_at: `${day}T13:00:00Z`, url: "https://astrorekha.com/?utm_campaign=12345678" })?.campaignName, "12345678");
assert.equal(roas.totals.length, 24);
assert.equal(normalizeTrackingView({ columnIds: ["campaign"], hourMetric: "roas" })?.hourMetric, "roas");
assert.equal(normalizeTrackingView({ columnIds: ["conversionRate"], hourMetric: "cvr" })?.hourMetric, "cvr");
assert.equal(normalizeTrackingView({ columnIds: ["campaign"], allTiming: "both" })?.allTiming, "both");
console.log("Tracking hourly ROAS checks passed");
