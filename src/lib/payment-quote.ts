import type { PricingConfig } from "./pricing";
import { isReportAvailableForPurchase } from "./customer-report-visibility";
import { CHAT_UNLIMITED_PASS_ID, CHAT_UNLIMITED_PASS_NAME, CHAT_UNLIMITED_PASS_PRICE_INR } from "./chat-unlimited-pass";
import { buildSoulmateCart } from "./soulmate-cart";

export type PaymentQuote = {
  version: 1; scope: "reports" | "soulmate";
  type: "bundle" | "upsell" | "report" | "coins" | "chat_pass" | "soulmate";
  productIds: string[]; productName: string; currency: "INR";
  amount: number; baseAmount: number | null; gstAmount: number | null;
  taxMode: "exclusive_gst" | "inclusive";
  features: string[]; coins: number; chatPassMinutes: number;
  soulmate?: ReturnType<typeof buildSoulmateCart>;
};

const BONUS: Record<string, number> = {
  "palm-reading": 15, "palm-birth": 15, "palm-birth-compat": 30,
  "palm-birth-sketch": 30, "palm-birth-sketch-aura-astro": 60,
};
function paise(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 10000000) throw new Error("Invalid configured price");
  return Math.round(value * 100);
}

/** Snapshot server catalog values so later price edits never change a pending order. */
export function quotePaymentOrder(pricing: PricingConfig, input: {
  type: string; bundleId?: string; packageId?: string; addOns?: unknown;
}): PaymentQuote {
  const base: PaymentQuote = {
    version: 1, scope: "reports", type: "report", productIds: [], productName: "",
    currency: "INR", amount: 0, baseAmount: null, gstAmount: null,
    taxMode: "inclusive", features: [], coins: 0, chatPassMinutes: 0,
  };
  if (input.type === "bundle") {
    const plan = pricing.bundles.find(p => p.id === input.bundleId && p.active);
    if (!plan || BONUS[plan.id] === undefined) throw new Error("Bundle unavailable");
    const amount = paise(plan.displayPrice || plan.price);
    const gst = Math.round(amount * 18 / 100);
    // Paused standalone reports included in existing bundles remain included,
    // matching PayU's current bundle fulfillment rather than silently removing them.
    return { ...base, type: "bundle", productIds: [plan.id], productName: plan.name,
      amount: amount + gst, baseAmount: amount, gstAmount: gst, taxMode: "exclusive_gst",
      features: [...new Set(plan.features)], coins: BONUS[plan.id] };
  }
  if (input.type === "upsell") {
    const ids = (input.bundleId || input.packageId || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length) throw new Error("Invalid add-on selection");
    const plans = ids.map(id => pricing.upsells.find(p => p.id === id && p.active));
    if (plans.some(p => !p || !isReportAvailableForPurchase(p.feature))) throw new Error("Add-on unavailable");
    const valid = plans as PricingConfig["upsells"];
    return { ...base, type: "upsell", productIds: ids, productName: valid.map(p => p.name).join(" + "),
      amount: valid.reduce((sum, p) => sum + paise(p.price), 0), features: [...new Set(valid.map(p => p.feature))] };
  }
  if (input.type === "report") {
    const plan = pricing.reports.find(p => p.id === input.packageId && p.active);
    if (!plan || !isReportAvailableForPurchase(plan.feature)) throw new Error("Report unavailable");
    return { ...base, productIds: [plan.id], productName: plan.name, amount: paise(plan.price), features: [plan.feature] };
  }
  if (input.type === "coins") {
    const plan = pricing.coinPackages.find(p => p.id === input.packageId && p.active);
    if (!plan || !Number.isSafeInteger(plan.coins) || plan.coins <= 0) throw new Error("Question pack unavailable");
    return { ...base, type: "coins", productIds: [plan.id], productName: `${Math.floor(plan.coins / 3)} Questions`,
      amount: paise(plan.price), coins: plan.coins };
  }
  if (input.type === "chat_pass") {
    if (input.packageId && input.packageId !== CHAT_UNLIMITED_PASS_ID) throw new Error("Invalid chat pass");
    return { ...base, type: "chat_pass", productIds: [CHAT_UNLIMITED_PASS_ID], productName: CHAT_UNLIMITED_PASS_NAME,
      amount: paise(CHAT_UNLIMITED_PASS_PRICE_INR), chatPassMinutes: 20 };
  }
  if (input.type === "soulmate") {
    if (input.packageId !== "standard" && input.packageId !== "express") throw new Error("Invalid Soulmate plan");
    const cart = buildSoulmateCart(input.packageId, input.addOns ?? []);
    return { ...base, scope: "soulmate", type: "soulmate", productIds: [input.packageId, ...cart.addOns],
      productName: cart.productInfo, amount: cart.amount, baseAmount: cart.baseAmount,
      gstAmount: cart.gstAmount, taxMode: "exclusive_gst", soulmate: cart };
  }
  throw new Error("Unsupported purchase type");
}
