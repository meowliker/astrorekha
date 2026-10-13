import assert from "node:assert/strict";
import {
  buildRevenueDashboard,
  resolveRevenueRange,
  type PaymentRow,
} from "../src/lib/revenue-dashboard";
import { DEFAULT_PRICING } from "../src/lib/pricing";
import type { UsageSource } from "../src/lib/revenue-usage";
const range = resolveRevenueRange(
  "2026-10-10",
  "2026-10-11",
  new Date("2026-10-12T12:00:00Z"),
);
const p = (
  id: string,
  user: string,
  type = "bundle",
  date = "2026-10-10T08:00:00Z",
): PaymentRow => ({
  id,
  payu_txn_id: id,
  user_id: user,
  customer_email: `${user}@example.test`,
  type,
  bundle_id: type === "coins" ? "coins-50" : "palm-birth",
  amount: 10000,
  currency: "INR",
  payment_status: "paid",
  coins: type === "coins" ? 45 : null,
  created_at: date,
});
const payments = [
  p("A1", "A"),
  p("A2", "A", "coins"),
  p("A3", "A", "coins", "2026-10-01T08:00:00Z"),
  p("B1", "B"),
  p("B0", "B", "bundle", "2026-09-01T08:00:00Z"),
  p("C1", "C", "coins"),
  p("D1", "D", "bundle", "2026-09-01T08:00:00Z"),
];
const usage: UsageSource = {
  capturedAt: "2026-10-12T12:00:00Z",
  users: [
    {
      id: "A",
      email: "A@example.test",
      coins: 2,
      updated_at: "2026-10-11",
      unlocked_features: { birthChart: true },
    },
    {
      id: "old-A",
      email: "a@example.test",
      coins: 100,
      updated_at: "2026-10-01",
      unlocked_features: { birthChart: true },
    },
    {
      id: "B",
      email: "B@example.test",
      coins: 10,
      unlocked_features: { birthChart: false },
    },
  ],
  chats: [
    {
      id: "A",
      questions: [
        { key: "q1", at: "2026-10-10T09:00:00Z" },
        { key: "q2", at: "2026-09-02T08:00:00Z" },
        { key: "q3", at: null },
      ],
    },
    { id: "old-A", questions: [{ key: "q1", at: "2026-10-10T09:00:00Z" }] },
    { id: "C", questions: [{ key: "q4", at: "2026-10-10T09:00:00Z" }] },
    { id: "D", questions: [{ key: "q5", at: "2026-10-10T09:00:00Z" }] },
  ],
};
const report = buildRevenueDashboard({
  payments,
  events: [],
  pricing: DEFAULT_PRICING,
  range,
  attribution: "last",
  usage,
});
const u = report.usage!;
assert.equal(u.paidCustomers, 3);
assert.equal(u.withQuestions, 2);
assert.equal(u.historyQuestions, 4);
assert.equal(u.periodQuestions, 2);
assert.equal(u.undatedQuestions, 1);
assert.equal(u.balanceKnown, 2);
assert.equal(
  u.remainingCoins,
  12,
  "latest account balance used once across email aliases",
);
assert.equal(u.withBalanceNoChat, 1);
assert.equal(u.inactiveSevenDays, 1);
assert.equal(u.lowBalanceChatUsers, 1);
assert.equal(u.coinBuyers, 2);
assert.equal(u.repeatCoinBuyers, 1);
assert.equal(u.repeatCoinBuyerRate, 50);
assert.equal(
  u.bands.reduce((sum, b) => sum + b.customers, 0),
  u.paidCustomers,
);
assert.equal(
  u.bands.reduce((sum, b) => sum + b.coinPurchases, 0),
  3,
);
assert.equal(u.bands[0].customers, 1);
assert.equal(u.bands[1].customers, 2);
assert.equal(u.holders.find((r) => r.id === "birthChart")!.holders, 1);
assert.equal(u.holders.find((r) => r.id === "birthChart")!.accessRate, 50);
assert.equal(
  buildRevenueDashboard({
    payments,
    events: [],
    pricing: DEFAULT_PRICING,
    range,
    attribution: "last",
  }).usage,
  null,
  "missing usage never becomes false zero balances",
);
const missingBalance = buildRevenueDashboard({
  payments,
  events: [],
  pricing: DEFAULT_PRICING,
  range,
  attribution: "last",
  usage: { ...usage, users: [] },
}).usage!;
assert.equal(missingBalance.balanceKnown, 0);
assert.equal(
  missingBalance.lowBalanceChatUsers,
  0,
  "unknown balances are not treated as zero",
);
assert.ok(report.reportAnalytics.some((r) => r.id === "palmReading"));
assert.ok(report.reportAnalytics.every((r) => r.direct.category === "report"));
console.log(
  "Revenue usage: paid cohorts, historical/period questions, alias deduplication, wallet coverage, 7-day inactivity, low balance, repeat coin purchases, usage bands and report access passed.",
);

const statusAliases = buildRevenueDashboard({
  payments: [{ ...p("status-alias", "A"), payment_status: " CAPTURED " }],
  events: [],
  pricing: DEFAULT_PRICING,
  range,
  attribution: "last",
  usage,
});
assert.equal(
  statusAliases.usage!.paidCustomers,
  1,
  "usage shares normalized financial payment statuses",
);
