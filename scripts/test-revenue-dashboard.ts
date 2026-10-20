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

// Bundle cohort CVR uses people, excludes standalone reports and includes add-on combos, and keeps refunds separate.
const noStandaloneCatalog = (dashboard: ReturnType<typeof build>) =>
  dashboard.upsells.cohorts[0].reports.map((r) => r.id);
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
    type: "upsell",
    bundle_id: "compatibilityTest",
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
assert.equal(cohort.buyers, 2);
assert.equal(cohort.cvr, 50);
assert.equal(cohort.dropOffRate, 50);
assert.equal(cohort.retainedBuyers, 1);
assert.equal(cohort.retainedCvr, 25);
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
  1,
  "only the add-on combo counts; a standalone report after a bundle does not",
);
assert.equal(pastLife.cvr, 25);
assert.equal(pastLife.retainedBuyers, 0);
assert.equal(
  pastLife.checkoutBuyers,
  1,
  "standalone report checkouts do not enter the upsell funnel",
);
assert.equal(
  cohort.linkedNetPaise,
  20000,
  "standalone report revenue is excluded from matched add-ons",
);
assert.ok(
  !noStandaloneCatalog(build([])).includes("birthChart"),
  "report-store-only rows are not seeded into add-on table",
);
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
  "Upsell cohorts: buyer denominators, repeat purchases, report aliases, standalone report exclusion, add-on combos, per-bundle timing, refunds, unknown identities, device isolation and exact percentages passed.",
);

assert.deepEqual(
  [...noStandaloneCatalog(build([]))].sort(),
  [
    "compatibilityTest",
    "prediction2026",
    "pastLifeReport",
    "numerologyReport",
    "spiritAnimalReport",
    "witchArchetypeReport",
  ].sort(),
  "empty cohort shows the post-bundle add-on catalog, not every standalone report",
);


// Witch uses the same report, add-on, refund and access aggregation as its peers.
const witchPayments: PaymentRow[] = [
  payment("witch-bundle", { user_id: "witch-buyer", amount: 100000 }),
  payment("witch-direct", { user_id: "direct-buyer", type: "report", bundle_id: "report-witch-archetype", amount: 58200 }),
  payment("witch-addon", { user_id: "witch-buyer", type: "upsell", bundle_id: "witch-archetype", amount: 49900, created_at: "2026-10-10T09:00:00Z" }),
  payment("witch-combo", { user_id: "witch-buyer", type: "upsell", bundle_id: "witch-archetype,compatibility", amount: 99800, created_at: "2026-10-10T10:00:00Z" }),
  payment("witch-failed", { type: "report", bundle_id: "report-witch-archetype", amount: 58200, payment_status: "failed" }),
  payment("witch-pending", { type: "report", bundle_id: null, feature: "witchArchetypeReport", amount: 58200, payment_status: "created" }),
  payment("witch-returned", { type: "report", bundle_id: "report-witch-archetype", amount: 58200 }),
  payment("witch-refund", { payu_txn_id: "witch-returned", type: "report", bundle_id: "report-witch-archetype", amount: 58200, payment_status: "refund_success" }),
];
const witchData = buildRevenueDashboard({
  payments: witchPayments, events: [], pricing: DEFAULT_PRICING, range, attribution: "last",
  usage: { capturedAt: "2026-10-12T10:00:00Z", chats: [], users: [
    { id: "witch-buyer", unlocked_features: { witchArchetypeReport: true } },
    { id: "direct-buyer", unlocked_features: { witchArchetypeReport: true } },
    { id: "witch-returned", unlocked_features: { witchArchetypeReport: false } },
  ] },
});
const witchRow = witchData.reportAnalytics.find(r => r.id === "witchArchetypeReport")!;
assert.equal(witchRow.name, "Witch Archetype Report");
assert.equal(witchData.reportAnalytics.filter(r => r.id === "witchArchetypeReport").length, 1);
assert.equal(witchRow.standaloneOrders, 1, "fully refunded purchase is excluded from retained orders");
assert.equal(witchRow.standalonePaise, 58200);
assert.equal(witchRow.upsellOrders, 2);
assert.equal(witchRow.singleUpsellPaise, 49900);
assert.equal(witchRow.sharedOrders, 1, "combo price is not incorrectly assigned to one report");
assert.equal(witchRow.individualAddOnOrders, 1);
assert.equal(witchRow.addOnBuyers, 1, "same add-on buyer counted once");
assert.equal(witchRow.holders?.holders, 2);
assert.equal(witchRow.direct.failed, 1);
assert.equal(witchRow.direct.pending, 1);
const emptyWitch = build([]).reportAnalytics.find(r => r.id === "witchArchetypeReport")!;
assert.equal(emptyWitch.standaloneOrders, 0);
assert.equal(emptyWitch.standalonePaise, 0);
assert.equal(emptyWitch.upsellOrders, 0);
console.log("Witch report uses standard revenue rows for direct purchases, add-ons, combos, refunds, pending/failed payments and current access.");
