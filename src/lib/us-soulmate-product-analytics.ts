import type { SoulmateAnalyticsOrder } from "./us-soulmate-analytics";

const PRODUCTS = [
  ["us_soulmate_standard", "Soulmate Sketch"], ["us_soulmate_express", "Complete Soulmate Vision"],
  ["description", "Soulmate Description"], ["colour", "Color Upgrade"],
  ["priority", "Priority Delivery"], ["timeline", "Soulmate Connection Timeline"],
] as const;
export type ProductAnalyticsOrder = SoulmateAnalyticsOrder & {
  plan?: string; base_amount?: number; discount_amount?: number; gst_amount?: number;
  line_items?: { id: string; name: string; amount_paise: number; quantity: number }[] | null;
};
/** Allocate the amount actually received before tax, using stored item prices.
 * Largest remainders keep discounted item totals exact to the cent. */
export function summarizeUSProducts(orders: ProductAnalyticsOrder[]) {
  const rows = new Map<string, { id: string; name: string; orders: number; units: number; listRevenue: number; discount: number; revenue: number }>(PRODUCTS.map(([id, name]) => [id, { id, name, orders: 0, units: 0, listRevenue: 0, discount: 0, revenue: 0 }]));
  let unallocatedOrders = 0;
  for (const order of orders) {
    const stored = order.line_items?.filter((item) => Number.isSafeInteger(item.amount_paise) && item.amount_paise >= 0 && Number.isSafeInteger(item.quantity) && item.quantity > 0) || [];
    const items = stored.length ? stored : order.base_amount && ["standard", "express"].includes(order.plan || "") ? [{ id: `us_soulmate_${order.plan}`, name: "Soulmate package", amount_paise: order.base_amount, quantity: 1 }] : [];
    const listTotal = items.reduce((sum, item) => sum + item.amount_paise * item.quantity, 0);
    if (!listTotal || (order.line_items?.length && stored.length !== order.line_items.length) || (order.base_amount !== undefined && listTotal !== order.base_amount) || !Number.isSafeInteger(order.gst_amount)) { unallocatedOrders++; continue; }
    const net = order.amount - order.gst_amount!;
    if (net < 0 || net > listTotal) { unallocatedOrders++; continue; }
    const allocated = items.map((item, index) => { const exact = net * item.amount_paise * item.quantity / listTotal; return { index, cents: Math.floor(exact), remainder: exact % 1 }; });
    let remaining = net - allocated.reduce((sum, item) => sum + item.cents, 0);
    for (const item of [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) { if (remaining-- > 0) item.cents++; }
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const row = rows.get(item.id) || { id: item.id, name: item.name, orders: 0, units: 0, listRevenue: 0, discount: 0, revenue: 0 };
      if (!seen.has(item.id)) row.orders++;
      seen.add(item.id); row.units += item.quantity;
      row.listRevenue += item.amount_paise * item.quantity;
      row.revenue += allocated[index].cents;
      row.discount += item.amount_paise * item.quantity - allocated[index].cents;
      rows.set(item.id, row);
    });
  }
  return { rows: [...rows.values()], unallocatedOrders, totalRevenue: [...rows.values()].reduce((sum, row) => sum + row.revenue, 0) };
}
