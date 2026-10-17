import { deliveryPlans, type DeliveryId } from "@/app/us/soulmate/chat-data";
import { addOnsForPlan, checkoutTotals, sanitizeAddOnIds } from "@/app/us/soulmate/checkout-addons";

export type SoulmateAssetKind = "sketch" | "description" | "timeline";
export type SoulmateLineItem = { id: string; name: string; amount_paise: number; quantity: 1; includes: string[] };
export type SoulmateEntitlements = { sketch: "colour" | "black_and_white"; description: boolean; timeline: boolean; delivery: "standard" | "priority" | "express"; promised_hours: number; scheduled_hours: number; required_assets: SoulmateAssetKind[] };
export function buildSoulmateCart(planId: DeliveryId, input: unknown = []) {
  const plan = deliveryPlans.find((item) => item.id === planId);
  const catalog = addOnsForPlan(planId);
  if (!plan || !Array.isArray(input) || input.some((id) => typeof id !== "string" || !catalog.some((item) => item.id === id))) throw new Error("Invalid add-ons for this package.");
  const addOns = sanitizeAddOnIds(input, planId);
  const total = checkoutTotals(plan.price, addOns, catalog);
  if (!total) throw new Error("US pricing has not been configured.");
  const colour = planId === "express" || addOns.includes("colour");
  const description = planId === "express" || addOns.includes("description");
  const timeline = addOns.includes("timeline");
  const entitlements: SoulmateEntitlements = {
    sketch: colour ? "colour" : "black_and_white", description, timeline,
    delivery: planId === "express" ? "express" : addOns.includes("priority") ? "priority" : "standard",
    promised_hours: addOns.includes("priority") ? 12 : plan.displayHours,
    scheduled_hours: planId === "express" || addOns.includes("priority") ? 12 : 48,
    required_assets: ["sketch", ...(description ? ["description" as const] : []), ...(timeline ? ["timeline" as const] : [])],
  };
  const lineItems: SoulmateLineItem[] = [{ id: `us_soulmate_${planId}`, name: plan.checkoutTitle, amount_paise: Math.round(plan.price * 100), quantity: 1, includes: planId === "express" ? ["colour_sketch", "description", "priority_delivery"] : ["black_and_white_sketch"] },
    ...catalog.filter((item) => addOns.includes(item.id)).map((item) => ({ id: item.id, name: item.title, amount_paise: Math.round(item.price! * 100), quantity: 1 as const, includes: [item.id] }))];
  const shortNames = { description: "Description", colour: "Color", priority: "Priority", timeline: "Timeline" };
  return { addOns, lineItems, entitlements, baseAmount: Math.round(total.subtotal * 100), gstAmount: Math.round(total.gst * 100), amount: Math.round(total.total * 100), productInfo: plan.checkoutTitle + (addOns.length ? ` + ${addOns.map((id) => shortNames[id]).join(" + ")}` : "") };
}
