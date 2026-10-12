import assert from "node:assert/strict";
import {
  buildRevenueDashboard,
  deduplicatePayments,
  resolveRevenueRange,
  type PaymentRow,
  type OfferEvent,
} from "../src/lib/revenue-dashboard";
import { DEFAULT_PRICING } from "../src/lib/pricing";

const range = resolveRevenueRange(
  "2026-10-10",
  "2026-10-11",
  new Date("2026-10-12T10:00:00Z"),
);
assert.equal(range.from, "2026-10-09T18:30:00.000Z");
assert.equal(range.to, "2026-10-11T18:30:00.000Z");
assert.throws(() => resolveRevenueRange("2026-02-30", "2026-10-11"));
assert.throws(() => resolveRevenueRange("2026-10-11", "2026-10-10"));
const payment = (id: string, patch: Partial<PaymentRow> = {}): PaymentRow => ({
  id,
  payu_txn_id: id,
  user_id: id,
  type: "bundle",
  bundle_id: "palm-birth",
  amount: 10000,
  currency: "INR",
  payment_status: "paid",
  created_at: "2026-10-10T08:00:00+00:00",
  ...patch,
});
const rows: PaymentRow[] = [
  payment("bundle", {
    user_id: "buyer",
    customer_email: "test@example.com",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "autumn",
  }),
  payment("bundle-copy", {
    payu_txn_id: "bundle",
    user_id: "buyer",
    created_at: "2026-10-10T09:00:00Z",
  }),
  payment("upsell", {
    user_id: "anon-buyer",
    customer_email: "TEST@example.com",
    type: "upsell",
    bundle_id: "compatibility,past-life",
    amount: 15001,
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("coins", {
    type: "coins",
    bundle_id: "coins-50",
    coins: 45,
    amount: 41600,
  }),
  payment("failed", { payment_status: "bounced" }),
  payment("open", { payment_status: "created" }),
  payment("refund-sale", { payu_txn_id: "refunded-order", amount: 30000 }),
  payment("refund-event", {
    payu_txn_id: "refunded-order",
    amount: 30000,
    payment_status: "refund_success",
    created_at: "2026-10-11T08:00:00Z",
  }),
  payment("partial-sale", { payu_txn_id: "partial-order", amount: 10000 }),
  payment("partial-refund", {
    payu_txn_id: "partial-order",
    amount: 3000,
    payment_status: "refund_success",
  }),
  payment("refund-request", { amount: 2000, payment_status: "refund_pending" }),
  payment("at-boundary", { created_at: range.from }),
  payment("excluded-boundary", { created_at: range.to }),
  payment("foreign", { currency: "USD" }),
];
const events: OfferEvent[] = [
  {
    id: "view1",
    event_name: "product_offer_view",
    product_type: "upsell",
    product_id: "compatibility",
    email: "test@example.com",
    visitor_id: "visitor",
    created_at: "2026-10-10T09:00:00Z",
  },
  {
    id: "view2",
    event_name: "product_offer_view",
    product_type: "upsell",
    product_id: "compatibility",
    visitor_id: "visitor",
    created_at: "2026-10-10T09:01:00Z",
  },
  {
    id: "late",
    event_name: "product_offer_view",
    product_type: "upsell",
    product_id: "past-life",
    email: "test@example.com",
    created_at: "2026-10-10T11:00:00Z",
  },
];
const build = (payments = rows, offerEvents: OfferEvent[] | null = events) =>
  buildRevenueDashboard({
    payments,
    events: offerEvents,
    pricing: DEFAULT_PRICING,
    range,
    attribution: "last",
  });
const d = build();
assert.equal(
  d.totals.attempts,
  9,
  "gateway duplicates, refund events, foreign currency and outside dates do not inflate checkout count",
);
assert.equal(d.totals.paid, 7);
assert.equal(d.totals.collectedPaise, 118601);
assert.equal(d.totals.refundedPaise, 33000);
assert.equal(d.totals.netPaise, 85601);
assert.equal(
  d.totals.refundPendingPaise,
  2000,
  "pending refund is not deducted",
);
assert.equal(d.quality.duplicates, 1);
assert.equal(d.quality.refundEvents, 3);
assert.equal(d.quality.excluded, 1);
for (const breakdown of [d.products, d.categories, d.daily, d.campaigns]) {
  assert.equal(
    breakdown.reduce((sum, row) => sum + row.netPaise, 0),
    d.totals.netPaise,
    "every breakdown reconciles",
  );
  assert.equal(
    breakdown.reduce((sum, row) => sum + row.attempts, 0),
    d.totals.attempts,
  );
}
assert.equal(
  d.orders.reduce((sum, row) => sum + row.netPaise, 0),
  d.totals.netPaise,
);
assert.equal(
  d.upsells.attachedBuyers,
  1,
  "email links guest and registered identity",
);
assert.equal(
  d.products.find((p) => p.key === "upsell:compatibilityTest")?.viewers,
  1,
  "same viewer deduplicated",
);
assert.equal(
  d.products.find((p) => p.key === "upsell:compatibilityTest")?.offerCvr,
  100,
  "single item offer matches combination purchase",
);
assert.equal(
  d.products.find((p) => p.key === "upsell:pastLifeReport")?.offerCvr,
  0,
  "purchase before exposure is not a conversion",
);
assert.equal(
  d.products.find((p) => p.category === "coins" && p.id === "coins-50")?.coins,
  45,
  "stored coins, not package ID or price",
);
assert.equal(
  d.reports.find((p) => p.id === "compatibilityTest")?.singleUpsellPaise,
  0,
  "no invented item allocation",
);
assert.equal(
  d.reports.find((p) => p.id === "compatibilityTest")?.sharedOrders,
  1,
);
assert.equal(build([], null).totals.checkoutCvr, null);
assert.equal(build([], null).products[0].offerCvr, null);
assert.equal(
  deduplicatePayments([
    payment("a", { payu_txn_id: "same" }),
    payment("b", { payu_txn_id: "same", amount: 20000 }),
  ]).conflicts,
  1,
);
const many = build(
  Array.from({ length: 1501 }, (_, i) => payment(`p${i}`)),
  [],
);
assert.equal(many.totals.paid, 1501, "not limited to 1000 rows");
const first = buildRevenueDashboard({
  payments: [
    payment("utm", {
      utm_source: "legacy",
      first_touch: { utm_source: "newsletter" },
      last_touch: { utm_source: "google", utm_campaign: "launch" },
    }),
  ],
  events: [],
  pricing: DEFAULT_PRICING,
  range,
  attribution: "first",
});
assert.equal(first.campaigns[0].source, "newsletter");
assert.equal(
  first.campaigns[0].campaign,
  "",
  "never combine different touches",
);
const legacy = buildRevenueDashboard({
  payments: [payment("legacy", { utm_source: "legacy" })],
  events: [],
  pricing: DEFAULT_PRICING,
  range,
  attribution: "first",
});
assert.equal(
  legacy.quality.attributedPaid,
  0,
  "missing first touch is not filled with last-touch data",
);
const partial = d.orders.find((o) => o.gatewayId === "partial-order")!;
assert.equal(
  partial.netPaise,
  7000,
  "partial refund retains original captured amount",
);
console.log(
  "Revenue dashboard: date boundaries, pagination-sized input, money, refunds, deduplication, attribution, identity, offer conversion and reconciliation passed.",
);

// Bundle cohort CVR uses people, includes report and combo paths, and keeps refunds separate.
const cohortRows = [
  payment("ba", { user_id: "A", customer_email: "a@example.test" }),
  payment("ba-repeat", {
    user_id: "A",
    bundle_id: "second-bundle",
    created_at: "2026-10-10T12:00:00Z",
  }),
  payment("bb", { user_id: "B" }),
  payment("bc", { user_id: "C" }),
  payment("bd", { user_id: "D", payment_status: "refunded" }),
  payment("no-identity", { user_id: null, customer_email: null }),
  payment("failed-bundle", { user_id: "E", payment_status: "failed" }),
  payment("a-report", {
    user_id: "A",
    type: "upsell",
    bundle_id: "compatibility",
    created_at: "2026-10-10T09:00:00Z",
  }),
  payment("a-report-repeat", {
    user_id: "guest-A",
    customer_email: "A@example.test",
    type: "report",
    bundle_id: "report-compatibility",
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("b-combo", {
    user_id: "B",
    type: "upsell",
    bundle_id: "compatibility,past-life",
    payment_status: "refunded",
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("c-standalone", {
    user_id: "C",
    type: "report",
    bundle_id: "past-life",
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("d-failed-report", {
    user_id: "D",
    type: "upsell",
    bundle_id: "compatibility",
    payment_status: "failed",
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("outsider-report", {
    user_id: "E",
    type: "upsell",
    bundle_id: "compatibility",
    created_at: "2026-10-10T10:00:00Z",
  }),
  payment("before-bundle", {
    user_id: "A",
    type: "upsell",
    bundle_id: "future-partner",
    created_at: "2026-10-10T07:00:00Z",
  }),
  payment("outside-dates", {
    user_id: "A",
    type: "upsell",
    bundle_id: "past-life",
    created_at: range.to,
  }),
];
const cohortData = build(cohortRows, [
  {
    id: "bridge-a",
    event_name: "upsell_view",
    user_id: "A",
    visitor_id: "shared-device",
    created_at: "2026-10-10T09:00:00Z",
  },
  {
    id: "bridge-b",
    event_name: "upsell_view",
    user_id: "B",
    visitor_id: "shared-device",
    created_at: "2026-10-10T09:00:00Z",
  },
]);
const cohort = cohortData.upsells.cohorts[0];
assert.equal(
  cohort.bundleBuyers,
  4,
  "repeated bundle orders deduplicate; shared tracking device does not merge buyers",
);
assert.equal(cohort.paidBundleOrders, 6);
assert.equal(cohort.unidentifiedBundleOrders, 1);
assert.equal(cohort.buyers, 3);
assert.equal(cohort.cvr, 75);
assert.equal(cohort.dropOffRate, 25);
assert.equal(cohort.retainedBuyers, 2);
assert.equal(cohort.retainedCvr, 50);
const compat = cohort.reports.find((r) => r.id === "compatibilityTest")!;
assert.equal(
  compat.buyers,
  2,
  "repeated report purchases and aliases count a buyer once",
);
assert.equal(compat.cvr, 50);
assert.equal(compat.checkoutBuyers, 3);
assert.equal(compat.checkoutCvr, (2 / 3) * 100);
assert.equal(compat.notPurchased, 2);
assert.equal(compat.dropOffRate, 50);
assert.equal(compat.refundedBuyers, 1);
assert.equal(compat.refundRate, 50);
assert.equal(compat.retainedCvr, 25);
const pastLife = cohort.reports.find((r) => r.id === "pastLifeReport")!;
assert.equal(
  pastLife.buyers,
  2,
  "combo and standalone report paths both count",
);
assert.equal(pastLife.cvr, 50);
assert.equal(pastLife.retainedBuyers, 1);
assert.equal(
  cohortData.upsells.cohorts.find((c) => c.id === "second-bundle")!.buyers,
  0,
  "report before the selected bundle is excluded",
);
for (const row of cohort.reports) {
  assert.equal(row.buyers + row.notPurchased, row.bundleBuyers);
  assert.equal(row.cvr! + row.dropOffRate!, 100);
  assert.ok(
    row.buyers <= row.checkoutBuyers && row.checkoutBuyers <= row.bundleBuyers,
  );
}
const noBuyers = build([]).upsells.cohorts[0];
assert.equal(noBuyers.cvr, null);
assert.equal(noBuyers.dropOffRate, null);
assert.ok(
  noBuyers.reports.every((r) => r.cvr === null && r.checkoutCvr === null),
);
console.log(
  "Upsell cohorts: buyer denominators, repeat purchases, report aliases, standalone/combo paths, per-bundle timing, refunds, unknown identities, device isolation and exact percentages passed.",
);
