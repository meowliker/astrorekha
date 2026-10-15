import { GST_RATE, type DeliveryId } from "./chat-data";

export type AddOnId = "description" | "colour" | "priority" | "timeline";
export type CheckoutAddOn = { id: AddOnId; title: string; price: number | null; plan: DeliveryId };
// Merchant-approved prices, excluding GST. Fulfillment activation is separate from this catalog.
export const checkoutAddOns: readonly CheckoutAddOn[] = [
  { id: "description", title: "Soulmate Description: When&Where, Initials, Traits, Job [RECOMMENDED]", price: 399, plan: "standard" },
  { id: "colour", title: "Upgrade from Black&White to Colored Version of your Soulmate Sketch", price: 299, plan: "standard" },
  { id: "priority", title: "Priority Delivery - receive sketch within 12 hours instead of 48 [POPULAR]", price: 249, plan: "standard" },
  { id: "timeline", title: "Soulmate Connection Timeline", price: 399, plan: "express" },
];

export function addOnsForPlan(planId: DeliveryId) {
  return checkoutAddOns.filter((item) => item.plan === planId);
}

export function sanitizeAddOnIds(value: unknown, planId?: DeliveryId): AddOnId[] {
  if (!Array.isArray(value)) return [];
  return checkoutAddOns.filter((item) => (!planId || item.plan === planId) && value.includes(item.id)).map((item) => item.id);
}

export function checkoutTotals(base: number, selected: readonly AddOnId[], catalog: readonly CheckoutAddOn[] = checkoutAddOns) {
  const items = catalog.filter((item) => selected.includes(item.id));
  if (items.some((item) => item.price === null) || selected.some((id) => !catalog.some((item) => item.id === id))) return null;
  const subtotalPaise = Math.round(base * 100) + items.reduce((sum, item) => sum + Math.round(item.price! * 100), 0);
  const gstPaise = Math.round(subtotalPaise * GST_RATE / 100);
  return { subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100 };
}
