import type { TrackingCampaign, TrackingSummary } from "@/lib/tracking-dashboard";

export type TrackingHourlyMetric = "orders" | "revenue" | "roas" | "cvr";
export type TrackingHourlyCell = { orders: number; revenue: number; spend: number | null; roas: number | null; clicks: number | null; cvr: number | null };
type HourRow = { key: string; name: string; hours: Array<number | null>; details: TrackingHourlyCell[] };

/** Build selected-day windows from payment times and the same Meta hourly Insights snapshot. */
export function buildTrackingHourlyTable(
  summary: Pick<TrackingSummary, "hourly" | "hourlySpendInr"> | null,
  campaigns: TrackingCampaign[],
  day: string,
  metric: TrackingHourlyMetric,
  spendReady = true,
  failedAccountIds: ReadonlySet<string> = new Set(),
  linkClicks: Record<string, Record<string, number[]>> = {},
): { totals: Array<number | null>; totalDetails: TrackingHourlyCell[]; campaigns: HourRow[] } {
  const count = 24;
  const visible = new Set(campaigns.map((row) => row.key));
  const sales = new Map<string, { orders: number[]; revenue: number[] }>();
  for (const item of summary?.hourly || []) {
    if (item.date !== day || !visible.has(item.campaignKey) || item.hour < 0 || item.hour >= count) continue;
    const row = sales.get(item.campaignKey) || { orders: Array(count).fill(0), revenue: Array(count).fill(0) };
    row.orders[item.hour] += item.orders;
    row.revenue[item.hour] += item.revenue;
    sales.set(item.campaignKey, row);
  }
  const totalRevenue = Array<number>(count).fill(0);
  const totalSpend = Array<number>(count).fill(0);
  const totalOrders = Array<number>(count).fill(0);
  const matchedOrders = Array<number>(count).fill(0);
  const totalClicks = Array<number>(count).fill(0);
  const unknownMeta = !spendReady || campaigns.some((row) => row.accountId && (row.spendInr == null || failedAccountIds.has(row.accountId)));
  const sortable = campaigns.map((campaign) => {
    const sale = sales.get(campaign.key) || { orders: Array(count).fill(0), revenue: Array(count).fill(0) };
    const spend = summary?.hourlySpendInr?.[campaign.key]?.[day] || [];
    const clicks = linkClicks[campaign.key]?.[day] || [];
    const available = spendReady && !!campaign.accountId && campaign.spendInr != null && !failedAccountIds.has(campaign.accountId);
    const details = Array.from({ length: count }, (_, hour): TrackingHourlyCell => {
      const cost = spend[hour] || 0;
      const clickCount = clicks[hour] || 0;
      totalRevenue[hour] += sale.revenue[hour];
      totalOrders[hour] += sale.orders[hour];
      if (available) matchedOrders[hour] += sale.orders[hour];
      totalSpend[hour] += cost;
      totalClicks[hour] += clickCount;
      return { orders: sale.orders[hour], revenue: sale.revenue[hour],
        spend: available ? cost : null, clicks: available ? clickCount : null,
        roas: available && cost > 0 ? sale.revenue[hour] / cost : null,
        cvr: available && clickCount > 0 ? sale.orders[hour] / clickCount * 100 : null };
    });
    const hours = details.map((cell) => cell[metric]);
    const revenue = sale.revenue.reduce((sum, value) => sum + value, 0);
    const cost = spend.reduce((sum, value) => sum + value, 0);
    const orders = sale.orders.reduce((sum, value) => sum + value, 0);
    const clickCount = clicks.reduce((sum, value) => sum + value, 0);
    const sortValue = metric === "roas" ? cost > 0 ? revenue / cost : -1 : metric === "cvr" ? clickCount > 0 ? orders / clickCount : -1 : hours.reduce<number>((sum, value) => sum + (value || 0), 0);
    return { key: campaign.key, name: campaign.campaignName, hours, details, sortValue };
  });
  const totalDetails = Array.from({ length: count }, (_, hour): TrackingHourlyCell => ({
    orders: totalOrders[hour], revenue: totalRevenue[hour],
    spend: unknownMeta ? null : totalSpend[hour], clicks: unknownMeta ? null : totalClicks[hour],
    roas: !unknownMeta && totalSpend[hour] > 0 ? totalRevenue[hour] / totalSpend[hour] : null,
    cvr: !unknownMeta && totalClicks[hour] > 0 ? matchedOrders[hour] / totalClicks[hour] * 100 : null,
  }));
  return { totals: totalDetails.map((cell) => cell[metric]), totalDetails,
    campaigns: sortable.sort((a, b) => b.sortValue - a.sortValue).map(({ key, name, hours, details }) => ({ key, name, hours, details })) };
}
