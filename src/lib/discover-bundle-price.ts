import type { BundlePlan } from "./pricing";

/** Matches the existing bundle checkout's display-price base and 18 percent GST. */
export function discoverBundlePrice(plan: Pick<BundlePlan, "displayPrice" | "price">) {
  const base = plan.displayPrice || plan.price;
  const gst = Math.round(base * 0.18 * 100) / 100;
  return { base, gst, total: Math.round((base + gst) * 100) / 100 };
}
export const bundlePriceLabel = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);
