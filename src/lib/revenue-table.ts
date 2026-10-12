import type { RevenueOrder } from "./revenue-dashboard";
export type SortDirection = "asc" | "desc";
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  direction: SortDirection,
) {
  // Missing values always sort last, in either direction.
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "en", { numeric: true });
  return direction === "asc" ? result : -result;
}
const orderKeys = [
  "createdAt",
  "gatewayId",
  "product",
  "customer",
  "state",
  "amountPaise",
  "netPaise",
  "source",
  "campaign",
] as const;
export function filterAndSortOrders(
  orders: RevenueOrder[],
  params: URLSearchParams,
) {
  const query = (params.get("orderQuery") || "").trim().toLowerCase();
  const selected = (param: string, value: string) =>
    !params.get(param) ||
    params.get(param) === "all" ||
    params.get(param) === value;
  const key =
    orderKeys.find((k) => k === params.get("orderSort")) || "createdAt";
  const direction = params.get("orderDirection") === "asc" ? "asc" : "desc";
  return orders
    .filter(
      (o) =>
        selected("orderProduct", o.productKey) &&
        selected("orderState", o.state) &&
        selected("orderCategory", o.category) &&
        selected("orderSource", o.source) &&
        selected("orderCampaign", o.campaign) &&
        (!query ||
          `${o.gatewayId} ${o.customer} ${o.product} ${o.campaign} ${o.source}`
            .toLowerCase()
            .includes(query)),
    )
    .sort(
      (a, b) =>
        compareValues(a[key], b[key], direction) || a.id.localeCompare(b.id),
    );
}
