import type { PaymentRow } from "./revenue-dashboard";
export type UsageUser = {
  id: string;
  email?: string | null;
  coins?: number | null;
  unlocked_features?: Record<string, unknown> | null;
  updated_at?: string | null;
};
export type UsageChat = {
  id: string;
  questions: { key: string; at: string | null }[];
};
export type UsageSource = {
  users: UsageUser[];
  chats: UsageChat[];
  capturedAt: string;
};
const rate = (n: number, d: number) => (d ? (n / d) * 100 : null);
// Input is already reconciled. Question text is never part of this model or saved cache.
export function buildRevenueUsage(
  payments: PaymentRow[],
  source: UsageSource | null,
  range: { from: string; to: string },
  reports: { id: string; name: string }[],
) {
  if (!source) return null;
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const parent = parents.get(key);
    if (!parent) {
      parents.set(key, key);
      return key;
    }
    if (parent === key) return key;
    const r = root(parent);
    parents.set(key, r);
    return r;
  };
  const keys = (id?: string | null, email?: string | null) =>
    [
      id?.trim() ? `id:${id.trim()}` : "",
      email?.trim() ? `email:${email.trim().toLowerCase()}` : "",
    ].filter(Boolean);
  const join = (ids: string[]) => {
    if (ids.length)
      for (const id of ids.slice(1)) parents.set(root(id), root(ids[0]));
  };
  for (const p of payments) join(keys(p.user_id, p.customer_email));
  for (const u of source.users) join(keys(u.id, u.email));
  const person = (id?: string | null, email?: string | null) => {
    const k = keys(id, email)[0];
    return k ? root(k) : null;
  };
  const paid = payments.filter(
    (p) =>
      [
        "paid",
        "success",
        "captured",
        "settled",
        "refunded",
        "refund_pending",
      ].includes(p.payment_status || "") && Number(p.amount) > 0,
  );
  const cohort = new Set(
    paid
      .filter(
        (p) =>
          Date.parse(p.created_at) >= Date.parse(range.from) &&
          Date.parse(p.created_at) < Date.parse(range.to),
      )
      .map((p) => person(p.user_id, p.customer_email))
      .filter((p): p is string => !!p),
  );
  const accounts = new Map<string, UsageUser>();
  let accountAliases = 0;
  for (const u of [...source.users].sort(
    (a, b) =>
      (Date.parse(b.updated_at || "") || 0) -
        (Date.parse(a.updated_at || "") || 0) || a.id.localeCompare(b.id),
  )) {
    const key = person(u.id, u.email);
    if (!key || !cohort.has(key)) continue;
    if (accounts.has(key)) {
      accountAliases++;
      continue;
    }
    accounts.set(key, u);
  }
  const questions = new Map<string, Map<string, string | null>>();
  for (const chat of source.chats) {
    const key = person(chat.id);
    if (!key || !cohort.has(key)) continue;
    if (!questions.has(key)) questions.set(key, new Map());
    for (const q of chat.questions)
      if (!q.at || Date.parse(q.at) <= Date.parse(source.capturedAt))
        questions.get(key)!.set(q.key, q.at);
  }
  const firstPaid = new Map<string, number>(),
    coinOrders = new Map<string, number>();
  for (const p of paid) {
    const key = person(p.user_id, p.customer_email);
    if (!key || !cohort.has(key)) continue;
    firstPaid.set(
      key,
      Math.min(firstPaid.get(key) ?? Infinity, Date.parse(p.created_at)),
    );
    if (p.type === "coins") coinOrders.set(key, (coinOrders.get(key) || 0) + 1);
  }
  const bands = [
    { label: "No recorded questions", max: 0 },
    { label: "1–5 questions", max: 5 },
    { label: "6–10 questions", max: 10 },
    { label: "11–20 questions", max: 20 },
    { label: "21–50 questions", max: 50 },
    { label: "51+ questions", max: Infinity },
  ].map((b) => ({
    ...b,
    customers: 0,
    coinBuyers: 0,
    coinPurchases: 0,
    share: null as number | null,
    coinBuyerCvr: null as number | null,
  }));
  let withQuestions = 0,
    periodQuestions = 0,
    historyQuestions = 0,
    undatedQuestions = 0,
    balanceKnown = 0,
    remainingCoins = 0,
    withBalanceNoChat = 0,
    inactiveSevenDays = 0,
    lowBalanceChatUsers = 0,
    coinBuyers = 0,
    repeatCoinBuyers = 0;
  for (const key of cohort) {
    const qs = questions.get(key) || new Map<string, string | null>(),
      count = qs.size;
    historyQuestions += count;
    if (count) withQuestions++;
    for (const at of qs.values()) {
      if (!at) undatedQuestions++;
      else if (
        Date.parse(at) >= Date.parse(range.from) &&
        Date.parse(at) < Date.parse(range.to)
      )
        periodQuestions++;
    }
    const balance = accounts.get(key)?.coins;
    if (
      typeof balance === "number" &&
      Number.isSafeInteger(balance) &&
      balance >= 0
    ) {
      balanceKnown++;
      remainingCoins += balance;
      if (balance > 0 && !count) {
        withBalanceNoChat++;
        if (
          Date.parse(source.capturedAt) - (firstPaid.get(key) ?? Infinity) >=
          7 * 86400000
        )
          inactiveSevenDays++;
      }
      if (count && balance < 3) lowBalanceChatUsers++;
    }
    const coins = coinOrders.get(key) || 0;
    if (coins) coinBuyers++;
    if (coins > 1) repeatCoinBuyers++;
    const band = bands.find((b) => count <= b.max)!;
    band.customers++;
    if (coins) band.coinBuyers++;
    band.coinPurchases += coins;
  }
  for (const band of bands) {
    band.share = rate(band.customers, cohort.size);
    band.coinBuyerCvr = rate(band.coinBuyers, band.customers);
  }
  const featureAccounts = [...accounts.values()].filter(
    (u) => u.unlocked_features && typeof u.unlocked_features === "object",
  );
  return {
    capturedAt: source.capturedAt,
    paidCustomers: cohort.size,
    withQuestions,
    chatActivationRate: rate(withQuestions, cohort.size),
    periodQuestions,
    historyQuestions,
    undatedQuestions,
    balanceKnown,
    balanceCoverage: rate(balanceKnown, cohort.size),
    remainingCoins,
    withBalanceNoChat,
    inactiveSevenDays,
    lowBalanceChatUsers,
    coinBuyers,
    coinBuyerCvr: rate(coinBuyers, cohort.size),
    repeatCoinBuyers,
    repeatCoinBuyerRate: rate(repeatCoinBuyers, coinBuyers),
    accountAliases,
    bands: bands.map((b) => ({
      label: b.label,
      customers: b.customers,
      coinBuyers: b.coinBuyers,
      coinPurchases: b.coinPurchases,
      share: b.share,
      coinBuyerCvr: b.coinBuyerCvr,
    })),
    holders: reports
      .map((r) => ({
        ...r,
        knownCustomers: featureAccounts.length,
        holders: featureAccounts.filter((u) =>
          [true, 1, "true", "1", "yes"].includes(
            u.unlocked_features![r.id] as boolean | number | string,
          ),
        ).length,
      }))
      .map((r) => ({ ...r, accessRate: rate(r.holders, r.knownCustomers) })),
  };
}
