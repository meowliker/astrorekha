import type { TrackingCampaign, TrackingSummary } from "@/lib/tracking-dashboard";

export type TrackingHourlyMetric = "orders" | "revenue" | "roas";
type HourRow = { key: string; name: string; hours: Array<number | null> };

/** ROAS uses the saved hourly Meta spend from the summary, so changing metrics makes no Meta request. */
export function buildTrackingHourlyTable(
  summary: Pick<TrackingSummary, "hourly" | "hourlySpendInr"> | null,
  campaigns: TrackingCampaign[],
  day: string,
  metric: TrackingHourlyMetric,
): { totals: Array<number | null>; campaigns: HourRow[] } {
  const visible = new Set(campaigns.map((row) => row.key));
  const sales = new Map<string, { orders: number[]; revenue: number[] }>();
  for (const item of summary?.hourly || []) {
    if (item.date !== day || !visible.has(item.campaignKey) || item.hour < 0 || item.hour > 23) continue;
    const row = sales.get(item.campaignKey) || { orders: Array(24).fill(0), revenue: Array(24).fill(0) };
    row.orders[item.hour] += item.orders;
    row.revenue[item.hour] += item.revenue;
    sales.set(item.campaignKey, row);
  }
  const totals: Array<number | null> = Array(24).fill(0);
  const totalRevenue = Array<number>(24).fill(0);
  const totalSpend = Array<number>(24).fill(0);
  const unknownSpend = metric === "roas" && campaigns.some((row) => row.accountId && row.spendInr == null);
  const sortable = campaigns.map((campaign) => {
    const sale = sales.get(campaign.key) || { orders: Array(24).fill(0), revenue: Array(24).fill(0) };
    const spend = summary?.hourlySpendInr?.[campaign.key]?.[day] || [];
    const hours = Array.from({ length: 24 }, (_, hour) => {
      totalRevenue[hour] += sale.revenue[hour];
      totalSpend[hour] += spend[hour] || 0;
      if (metric === "roas") return campaign.accountId && campaign.spendInr == null ? null : spend[hour] > 0 ? sale.revenue[hour] / spend[hour] : null;
      const value = metric === "orders" ? sale.orders[hour] : sale.revenue[hour];
      totals[hour] = (totals[hour] || 0) + value;
      return value;
    });
    const revenue = sale.revenue.reduce((sum, value) => sum + value, 0);
    const cost = spend.reduce((sum, value) => sum + value, 0);
    return { key: campaign.key, name: campaign.campaignName, hours, sortValue: metric === "roas" ? cost > 0 ? revenue / cost : -1 : hours.reduce<number>((sum, value) => sum + (value || 0), 0) };
  });
  if (metric === "roas") for (let hour = 0; hour < 24; hour++) totals[hour] = !unknownSpend && totalSpend[hour] > 0 ? totalRevenue[hour] / totalSpend[hour] : null;
  return { totals, campaigns: sortable.sort((a, b) => b.sortValue - a.sortValue).map(({ key, name, hours }) => ({ key, name, hours })) };
}
