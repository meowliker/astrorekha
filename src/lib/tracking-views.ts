export const TRACKING_VIEW_COLUMN_IDS = new Set([
  "campaign", "account", "campaignId", "status", "objective", "budget", "spend", "spendInr",
  "dailyBudget", "lifetimeBudget", "impressions", "reach", "frequency", "clicks",
  "linkClicks", "linkCtr", "ctr", "cpc", "cpm", "landingPageViews", "addToCarts",
  "checkouts", "leads", "metaPurchases", "metaCostPerPurchase", "metaPurchaseValue",
  "metaRoas", "utmVisits", "orders", "conversionRate", "grossRevenue", "refunds", "refundAmount", "revenue",
  "utmRoas", "cpa", "aov", "utmSource", "utmMedium", "utmTerm", "utmContent",
]);

export type TrackingViewConfig = {
  columnIds: string[];
  sort: { id: string; desc: boolean };
  accountId: string;
  search: string;
  hourMetric: "orders" | "revenue" | "roas" | "cvr";
  activeOnly?: boolean;
  activeScope?: "campaign" | "adset" | "ad" | "all";
};

export type TrackingSavedView = TrackingViewConfig & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeTrackingView(input: unknown): TrackingViewConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const columns = Array.isArray(value.columnIds) ? value.columnIds : [];
  const columnIds = Array.from(new Set(columns.filter((id): id is string => typeof id === "string" && TRACKING_VIEW_COLUMN_IDS.has(id))));
  if (!columnIds.length) return null;
  const rawSort = value.sort && typeof value.sort === "object" ? value.sort as Record<string, unknown> : {};
  const sortId = typeof rawSort.id === "string" && TRACKING_VIEW_COLUMN_IDS.has(rawSort.id) ? rawSort.id : "spendInr";
  return {
    columnIds,
    sort: { id: sortId, desc: rawSort.desc !== false },
    accountId: typeof value.accountId === "string" ? value.accountId.slice(0, 100) : "all",
    search: typeof value.search === "string" ? value.search.slice(0, 120) : "",
    hourMetric: value.hourMetric === "revenue" || value.hourMetric === "roas" || value.hourMetric === "cvr" ? value.hourMetric : "orders",
    activeOnly: value.activeOnly === true,
    activeScope: ["campaign", "adset", "ad", "all"].includes(String(value.activeScope)) ? value.activeScope as TrackingViewConfig["activeScope"] : "all",
  };
}
