import type { PricingConfig } from "@/lib/pricing";
import { quotePaymentOrder, type PaymentQuote } from "@/lib/payment-quote";
import { isReportAvailableForPurchase } from "@/lib/customer-report-visibility";
import { CHAT_UNLIMITED_PASS_ID, CHAT_UNLIMITED_PASS_NAME } from "@/lib/chat-unlimited-pass";
import { deliveryPlans } from "@/app/soulmate/chat-data";
import { addOnsForPlan } from "@/app/soulmate/checkout-addons";

export const COLLECTIONS = [
  { id: "bundles", name: "Report bundles" },
  { id: "reports", name: "Individual reports" },
  { id: "addons", name: "Report add-ons" },
  { id: "chat", name: "Elysia chat" },
  { id: "soulmate", name: "Soulmate sketch packages" },
] as const;

type Selection = Parameters<typeof quotePaymentOrder>[1];
type Product = {
  id: string;
  source_id: string;
  collection_id: string;
  name: string;
  description: string;
  digital: boolean;
  requires_shipping: boolean;
  payment_methods: string[];
  price: ReturnType<typeof price>;
  selection: Selection;
  includes: { features: string[]; coins: number; chat_pass_minutes: number };
};
function price(quote: PaymentQuote) {
  return {
    currency: quote.currency,
    unit: "paise",
    payable_minor: quote.amount,
    base_minor: quote.baseAmount,
    gst_minor: quote.gstAmount,
    tax_mode: quote.taxMode,
  };
}

/** Quotes use the checkout's existing prices and GST rounding. This builds data only. */
export function buildCatalogue(pricing: PricingConfig) {
  const products: Product[] = [];
  function add(collection: string, id: string, name: string, description: string, selection: Selection) {
    const quote = quotePaymentOrder(pricing, selection);
    const product = {
      id: `${selection.type}:${id}`,
      source_id: id,
      collection_id: collection,
      name,
      description,
      digital: true,
      requires_shipping: false,
      payment_methods: ["prepaid"],
      price: price(quote),
      selection,
      includes: { features: quote.features, coins: quote.coins, chat_pass_minutes: quote.chatPassMinutes },
    };
    products.push(product);
    return product;
  }
  for (const plan of pricing.bundles.filter(plan => plan.active)) {
    add("bundles", plan.id, plan.name, plan.description, { type: "bundle", bundleId: plan.id });
  }
  for (const plan of pricing.reports.filter(plan => plan.active && isReportAvailableForPurchase(plan.feature))) {
    add("reports", plan.id, plan.name, "", { type: "report", packageId: plan.id });
  }
  for (const plan of pricing.upsells.filter(plan => plan.active && isReportAvailableForPurchase(plan.feature))) {
    add("addons", plan.id, plan.name, "", { type: "upsell", packageId: plan.id });
  }
  for (const plan of pricing.coinPackages.filter(plan => plan.active)) {
    const quote = quotePaymentOrder(pricing, { type: "coins", packageId: plan.id });
    add("chat", plan.id, quote.productName, "Elysia chat question pack", { type: "coins", packageId: plan.id });
  }
  add("chat", CHAT_UNLIMITED_PASS_ID, CHAT_UNLIMITED_PASS_NAME, "20 minutes of unlimited Elysia chat", { type: "chat_pass", packageId: CHAT_UNLIMITED_PASS_ID });
  for (const plan of deliveryPlans) {
    add("soulmate", plan.id, plan.checkoutTitle, plan.delivery, { type: "soulmate", packageId: plan.id });
    // Enumerate valid package/add-on combinations with complete payable totals.
    const addons = addOnsForPlan(plan.id).filter(addon => addon.price !== null);
    for (let mask = 1; mask < 2 ** addons.length; mask++) {
      const selected = addons.filter((_, index) => mask & (1 << index)).map(addon => addon.id);
      const selection = { type: "soulmate", packageId: plan.id, addOns: selected };
      const quote = quotePaymentOrder(pricing, selection);
      add("soulmate", `${plan.id}+${selected.join("+")}`, quote.productName, plan.delivery, selection);
    }
  }
  const collections = COLLECTIONS.map(collection => ({
    ...collection,
    product_count: products.filter(product => product.collection_id === collection.id).length,
  }));
  return { collections, products };
}
