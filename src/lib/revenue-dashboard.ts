import type { PricingConfig } from "./pricing";

export type PaymentRow = {
  refundPaise?: number;
  pendingRefundPaise?: number;
  capturedPaise?: number;
  id: string;
  payu_txn_id?: string | null;
  razorpay_order_id?: string | null;
  user_id?: string | null;
  customer_email?: string | null;
  type?: string | null;
  bundle_id?: string | null;
  feature?: string | null;
  amount: number;
  currency?: string | null;
  payment_status?: string | null;
  coins?: number | null;
  created_at: string;
  fulfilled_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  first_touch?: Record<string, unknown> | null;
  last_touch?: Record<string, unknown> | null;
};
export type OfferEvent = {
  id: string;
  event_name: string;
  product_type?: string | null;
  product_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  visitor_id?: string | null;
  created_at: string;
};
export type ProductCategory =
  "bundle" | "report" | "upsell" | "coins" | "chat_pass" | "other";
export type PaymentState =
  | "paid"
  | "refunded"
  | "refund_pending"
  | "failed"
  | "pending"
  | "unknown"
  | "adjustment";
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  bundle: "Bundles",
  report: "Reports",
  upsell: "Upsells",
  coins: "Coins",
  chat_pass: "Chat passes",
  other: "Other",
};
export const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? (numerator / denominator) * 100 : null;
export const istDate = (date: Date | string) =>
  new Date(new Date(date).getTime() + 330 * 60000).toISOString().slice(0, 10);
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function resolveRevenueRange(
  start: string,
  end: string,
  now = new Date(),
) {
  for (const date of [start, end]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Choose valid start and end dates.");
  }
  if (start > end) throw new Error("Start date must be on or before end date.");
  if (start < "2026-03-13" || end > istDate(now))
    throw new Error("Choose dates from 13 March 2026 through today.");
  return {
    start,
    end,
    from: new Date(`${start}T00:00:00+05:30`).toISOString(),
    to: new Date(
      Math.min(
        Date.parse(`${shiftDate(end, 1)}T00:00:00+05:30`),
        now.getTime(),
      ),
    ).toISOString(),
  };
}
export function paymentState(p: PaymentRow): PaymentState {
  if (Number(p.amount) < 0) return "adjustment";
  const status = (p.payment_status || "").trim().toLowerCase();
  if (["paid", "success", "captured", "settled"].includes(status))
    return "paid";
  if (
    [
      "refund_success",
      "refunded",
      "autorefund",
      "reversed",
      "chargeback",
    ].includes(status)
  )
    return "refunded";
  if (
    [
      "refund_pending",
      "refundinitiated",
      "refund_initiated",
      "refund_requested",
    ].includes(status)
  )
    return "refund_pending";
  if (
    [
      "failed",
      "failure",
      "bounced",
      "dropped",
      "usercancelled",
      "cancelled",
      "canceled",
    ].includes(status)
  )
    return "failed";
  if (["created", "pending", "initiated", "processing"].includes(status))
    return "pending";
  return "unknown";
}
function rank(p: PaymentRow) {
  return {
    refunded: 6,
    refund_pending: 5,
    paid: 4,
    failed: 3,
    pending: 2,
    unknown: 1,
    adjustment: 0,
  }[paymentState(p)];
}
/** Reconcile sale/refund lifecycle rows by gateway order; preserve actual refund amounts. */
export function deduplicatePayments(rows: PaymentRow[]) {
  const groups = new Map<string, PaymentRow[]>();
  for (const row of rows) {
    const key =
      Number(row.amount) < 0
        ? `adjustment:${row.id}`
        : row.payu_txn_id
          ? `payu:${row.payu_txn_id}`
          : row.razorpay_order_id
            ? `razorpay:${row.razorpay_order_id}`
            : `row:${row.id}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  let duplicates = 0,
    conflicts = 0,
    refundEvents = 0;
  const payments: PaymentRow[] = [];
  for (const group of groups.values()) {
    const sales = group.filter((p) => paymentState(p) === "paid");
    const refunds = group.filter((p) => paymentState(p) === "refunded");
    const pending = group.filter((p) => paymentState(p) === "refund_pending");
    if (
      new Set(sales.map((p) => `${p.currency || "INR"}:${p.amount}`)).size > 1
    ) {
      conflicts++;
      continue;
    }
    sales.sort(
      (a, b) =>
        Number(Boolean(b.fulfilled_at)) - Number(Boolean(a.fulfilled_at)) ||
        a.created_at.localeCompare(b.created_at),
    );
    group.sort(
      (a, b) => rank(b) - rank(a) || a.created_at.localeCompare(b.created_at),
    );
    const winner = { ...(sales[0] || group[0]) };
    const refunded = refunds.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingAmount = pending.reduce((sum, p) => sum + Number(p.amount), 0);
    const captured = sales.length
      ? Number(sales[0].amount)
      : refunds.length
        ? refunded
        : pending.length
          ? pendingAmount
          : 0;
    if (refunded > captured && captured > 0) {
      conflicts++;
      continue;
    }
    winner.refundPaise = refunded;
    winner.pendingRefundPaise = refunds.length ? 0 : pendingAmount;
    winner.capturedPaise = captured;
    if (captured > 0) {
      winner.amount = captured;
      winner.payment_status =
        refunded >= captured
          ? "refunded"
          : pendingAmount && !refunded
            ? "refund_pending"
            : "paid";
    }
    winner.created_at = (sales.length ? sales : group)
      .map((p) => p.created_at)
      .sort()[0];
    duplicates += Math.max(0, sales.length - 1);
    refundEvents += refunds.length + pending.length;
    payments.push(winner);
  }
  return { payments, duplicates, conflicts, refundEvents };
}

export type RevenueMetric = {
  attempts: number;
  paid: number;
  failed: number;
  pending: number;
  unknown: number;
  refunded: number;
  fullyRefunded: number;
  refundPending: number;
  collectedPaise: number;
  refundedPaise: number;
  refundPendingPaise: number;
  netPaise: number;
  buyers: number;
  checkoutCvr: number | null;
};
export type ProductMetric = RevenueMetric & {
  key: string;
  id: string;
  name: string;
  category: ProductCategory;
  items: string[];
  coins: number;
  missingCoinOrders: number;
  viewers: number | null;
  convertedViewers: number | null;
  offerCvr: number | null;
};
export type RevenueOrder = {
  id: string;
  gatewayId: string;
  createdAt: string;
  customer: string;
  productKey: string;
  product: string;
  category: ProductCategory;
  state: PaymentState;
  rawStatus: string;
  amountPaise: number;
  netPaise: number;
  coins: number | null;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
};
const emptyMetric = (): RevenueMetric => ({
  attempts: 0,
  paid: 0,
  failed: 0,
  pending: 0,
  unknown: 0,
  refunded: 0,
  fullyRefunded: 0,
  refundPending: 0,
  collectedPaise: 0,
  refundedPaise: 0,
  refundPendingPaise: 0,
  netPaise: 0,
  buyers: 0,
  checkoutCvr: null,
});
function addMetric(m: RevenueMetric, p: PaymentRow) {
  const state = paymentState(p),
    amount = Math.abs(Number(p.amount));
  if (state !== "adjustment") m.attempts++;
  // Positive refunded records describe the original full order, not another negative sale.
  if (["paid", "refunded", "refund_pending"].includes(state)) {
    m.paid++;
    m.collectedPaise += p.capturedPaise ?? amount;
  }
  const refund =
    state === "adjustment"
      ? amount
      : (p.refundPaise ?? (state === "refunded" ? amount : 0));
  if (refund > 0) {
    m.refunded++;
    m.refundedPaise += refund;
  }
  if (state === "refunded") m.fullyRefunded++;
  if (state === "refund_pending") {
    m.refundPending++;
    m.refundPendingPaise += p.pendingRefundPaise ?? amount;
  }
  if (state === "failed") m.failed++;
  if (state === "pending") m.pending++;
  if (state === "unknown") m.unknown++;
  m.netPaise = m.collectedPaise - m.refundedPaise;
  m.checkoutCvr = ratio(m.paid, m.attempts);
}
function personKeys(p: {
  user_id?: string | null;
  customer_email?: string | null;
  email?: string | null;
  visitor_id?: string | null;
}) {
  return [
    p.user_id ? `user:${p.user_id}` : "",
    p.customer_email || p.email
      ? `email:${(p.customer_email || p.email)!.trim().toLowerCase()}`
      : "",
    p.visitor_id ? `visitor:${p.visitor_id}` : "",
  ].filter(Boolean);
}
function identityResolver(rows: Array<PaymentRow | OfferEvent>) {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    let next = parents.get(key);
    if (!next) {
      parents.set(key, key);
      return key;
    }
    while (next !== parents.get(next)) next = parents.get(next)!;
    parents.set(key, next);
    return next;
  };
  for (const row of rows) {
    const keys = personKeys(row);
    for (const key of keys.slice(1)) parents.set(root(key), root(keys[0]));
  }
  return (row: PaymentRow | OfferEvent) => {
    const key = personKeys(row)[0];
    return key ? root(key) : null;
  };
}
function category(type: string | null | undefined): ProductCategory {
  if (type === "bundle_payment") return "bundle";
  return type && type in CATEGORY_LABELS ? (type as ProductCategory) : "other";
}
function touch(p: PaymentRow, mode: "first" | "last") {
  const saved = mode === "first" ? p.first_touch : p.last_touch;
  // A partial touch must not borrow fields from another attribution model.
  const source =
    saved && Object.values(saved).some(Boolean)
      ? saved
      : mode === "last"
        ? p
        : {};
  const field = (key: string) =>
    typeof (source as Record<string, unknown>)[key] === "string"
      ? String((source as Record<string, unknown>)[key]).trim()
      : "";
  return {
    source: field("utm_source") || "Unattributed",
    medium: field("utm_medium"),
    campaign: field("utm_campaign"),
    content: field("utm_content"),
    term: field("utm_term"),
  };
}

export function buildRevenueDashboard(input: {
  payments: PaymentRow[];
  events: OfferEvent[] | null;
  pricing: PricingConfig;
  range: ReturnType<typeof resolveRevenueRange>;
  attribution: "first" | "last";
  warnings?: string[];
}) {
  const { range, pricing } = input;
  const deduped = deduplicatePayments(input.payments);
  const inRange = (p: { created_at: string }) =>
    Date.parse(p.created_at) >= Date.parse(range.from) &&
    Date.parse(p.created_at) < Date.parse(range.to);
  const scoped = deduped.payments.filter(inRange);
  const excluded = scoped.filter(
    (p) => !Number.isSafeInteger(Number(p.amount)) || p.currency !== "INR",
  );
  const payments = scoped.filter((p) => !excluded.includes(p));
  const events = input.events?.filter(inRange) ?? null;
  const person = identityResolver([...payments, ...(events || [])]);
  const aliases = new Map<string, { id: string; name: string }>();
  for (const p of [...pricing.reports, ...pricing.upsells]) {
    const previous = aliases.get(p.feature);
    const info = previous || { id: p.feature, name: p.name };
    aliases.set(p.id, info);
    aliases.set(p.feature, info);
  }
  aliases.set("report-palm", { id: "palmReading", name: "Palm Reading" });
  aliases.set("palmReading", { id: "palmReading", name: "Palm Reading" });
  for (const id of [
    "vastu-shastra-guide",
    "report-vastu-shastra-guide",
    "vastuShastraGuide",
  ])
    aliases.set(id, { id: "vastuShastraGuide", name: "Vastu Shastra Guide" });
  const product = (
    type: string | null | undefined,
    rawId: string | null | undefined,
    feature?: string | null,
    coins?: number | null,
  ) => {
    const cat = category(type);
    const raw =
      rawId ||
      feature ||
      (cat === "coins" && coins ? `recorded-${coins}-coins` : "unidentified");
    const items =
      cat === "upsell" || cat === "report"
        ? Array.from(
            new Set(
              raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => aliases.get(s)?.id || s),
            ),
          ).sort()
        : [];
    const id = items.length ? items.join(",") : raw;
    const name = items.length
      ? items.map((id) => aliases.get(id)?.name || id).join(" + ")
      : cat === "bundle"
        ? pricing.bundles.find((p) => p.id === id)?.name || id
        : cat === "coins"
          ? id.startsWith("recorded-")
            ? `${coins} coins (legacy)`
            : id
          : cat === "chat_pass"
            ? "Unlimited Elysia · 20 minutes"
            : id;
    return {
      key: `${cat}:${id}`,
      id,
      name: id === "unidentified" ? "Unidentified product" : name,
      category: cat,
      items,
    };
  };
  const products = new Map<string, ProductMetric>();
  const getProduct = (info: ReturnType<typeof product>) => {
    let row = products.get(info.key);
    if (!row) {
      row = {
        ...emptyMetric(),
        ...info,
        coins: 0,
        missingCoinOrders: 0,
        viewers: events ? 0 : null,
        convertedViewers: events ? 0 : null,
        offerCvr: null,
      };
      products.set(info.key, row);
    }
    return row;
  };
  for (const b of pricing.bundles) getProduct(product("bundle", b.id));
  for (const r of pricing.reports) getProduct(product("report", r.id));
  for (const u of pricing.upsells) getProduct(product("upsell", u.id));
  for (const c of pricing.coinPackages) getProduct(product("coins", c.id));
  getProduct(product("chat_pass", "elysia-unlimited-20m"));
  const totals = emptyMetric();
  const categories = Object.entries(CATEGORY_LABELS).map(([key, name]) => ({
    ...emptyMetric(),
    key,
    name,
  }));
  const daily = new Map<string, RevenueMetric & { date: string }>();
  for (let date = range.start; date <= range.end; date = shiftDate(date, 1))
    daily.set(date, { date, ...emptyMetric() });
  const campaignMap = new Map<
    string,
    RevenueMetric & {
      key: string;
      source: string;
      medium: string;
      campaign: string;
      content: string;
      term: string;
    }
  >();
  const buyerSets = new Map<string, Set<string>>();
  const addBuyer = (key: string, p: PaymentRow) => {
    const id = person(p);
    if (!id) return;
    if (!buyerSets.has(key)) buyerSets.set(key, new Set());
    buyerSets.get(key)!.add(id);
  };
  const bundleBuyers = new Map<string, string>();
  const upsellBuyers = new Set<string>();
  let linkedUpsellPaise = 0,
    unidentifiedBuyers = 0,
    attributedPaid = 0;
  const orders: RevenueOrder[] = [];
  for (const p of payments) {
    const info = product(p.type, p.bundle_id, p.feature, p.coins),
      metric = getProduct(info),
      state = paymentState(p);
    const attribution = touch(p, input.attribution);
    const campaignKey = JSON.stringify(Object.values(attribution));
    if (!campaignMap.has(campaignKey))
      campaignMap.set(campaignKey, {
        ...emptyMetric(),
        key: campaignKey,
        ...attribution,
      });
    const campaign = campaignMap.get(campaignKey)!;
    const cat = categories.find((c) => c.key === info.category)!;
    for (const m of [
      totals,
      metric,
      campaign,
      cat,
      daily.get(istDate(p.created_at))!,
    ])
      addMetric(m, p);
    if (["paid", "refunded", "refund_pending"].includes(state)) {
      for (const key of [
        "total",
        info.key,
        `campaign:${campaignKey}`,
        `category:${cat.key}`,
      ])
        addBuyer(key, p);
      if (!person(p)) unidentifiedBuyers++;
      if (
        attribution.source !== "Unattributed" ||
        attribution.campaign ||
        attribution.content ||
        attribution.medium ||
        attribution.term
      )
        attributedPaid++;
    }
    if (state === "paid" || state === "refund_pending") {
      const buyer = person(p);
      if (info.category === "bundle" && buyer)
        bundleBuyers.set(
          buyer,
          [bundleBuyers.get(buyer) || p.created_at, p.created_at].sort()[0],
        );
      if (info.category === "coins") {
        if (p.coins && Number.isSafeInteger(p.coins) && p.coins > 0)
          metric.coins += p.coins;
        else metric.missingCoinOrders++;
      }
    }
    const net = ["paid", "refund_pending"].includes(state)
      ? Number(p.amount) - (p.refundPaise || 0)
      : state === "adjustment"
        ? Number(p.amount)
        : 0;
    orders.push({
      id: p.id,
      gatewayId: p.payu_txn_id || p.razorpay_order_id || p.id,
      createdAt: p.created_at,
      customer: p.customer_email || p.user_id || "Unidentified customer",
      productKey: info.key,
      product: info.name,
      category: info.category,
      state,
      rawStatus: p.payment_status || "unknown",
      amountPaise: Number(p.amount),
      netPaise: net,
      coins: p.coins ?? null,
      ...attribution,
    });
  }
  for (const p of payments) {
    const buyer = person(p),
      bundleDate = buyer ? bundleBuyers.get(buyer) : null;
    if (
      category(p.type) === "upsell" &&
      ["paid", "refund_pending"].includes(paymentState(p)) &&
      buyer &&
      bundleDate &&
      Date.parse(p.created_at) >= Date.parse(bundleDate)
    ) {
      upsellBuyers.add(buyer);
      linkedUpsellPaise += Number(p.amount) - (p.refundPaise || 0);
    }
  }
  const views = new Map<string, Map<string, string>>();
  for (const e of events || []) {
    if (!e.product_id || !e.product_type) continue;
    const info = product(e.product_type, e.product_id),
      id = person(e);
    if (!id) continue;
    getProduct(info);
    if (!views.has(info.key)) views.set(info.key, new Map());
    const previous = views.get(info.key)!.get(id);
    views
      .get(info.key)!
      .set(
        id,
        previous && Date.parse(previous) < Date.parse(e.created_at)
          ? previous
          : e.created_at,
      );
  }
  for (const row of products.values()) {
    row.buyers = buyerSets.get(row.key)?.size || 0;
    const audience = views.get(row.key);
    if (!audience?.size) {
      row.viewers = null;
      row.convertedViewers = null;
      continue;
    }
    row.viewers = audience.size;
    const converted = new Set<string>();
    for (const p of payments) {
      if (!["paid", "refunded", "refund_pending"].includes(paymentState(p)))
        continue;
      const id = person(p),
        viewedAt = id ? audience.get(id) : null;
      const sold = product(p.type, p.bundle_id, p.feature, p.coins);
      const matches =
        sold.key === row.key ||
        (sold.category === "upsell" &&
          row.category === "upsell" &&
          row.items.length === 1 &&
          sold.items.includes(row.items[0]));
      if (
        id &&
        viewedAt &&
        Date.parse(p.created_at) >= Date.parse(viewedAt) &&
        matches
      )
        converted.add(id);
    }
    row.convertedViewers = converted.size;
    row.offerCvr = ratio(converted.size, audience.size);
  }
  totals.buyers = buyerSets.get("total")?.size || 0;
  for (const c of categories)
    c.buyers = buyerSets.get(`category:${c.key}`)?.size || 0;
  for (const c of campaignMap.values())
    c.buyers = buyerSets.get(`campaign:${c.key}`)?.size || 0;
  // Preserve historical/custom report IDs even when removed from the current catalog.
  for (const row of products.values()) {
    for (const id of row.items) {
      if (!aliases.has(id))
        aliases.set(id, {
          id,
          name: id === "unidentified" ? "Unidentified report" : id,
        });
    }
  }
  // Report counts do not allocate bundle/combo prices: historical item prices were never stored.
  const reports = Array.from(
    new Map(Array.from(aliases.values()).map((v) => [v.id, v])).values(),
  ).map((report) => {
    let standaloneOrders = 0,
      upsellOrders = 0,
      standalonePaise = 0,
      singleUpsellPaise = 0,
      sharedOrders = 0;
    for (const row of products.values()) {
      if (!row.items.includes(report.id)) continue;
      const retained = row.paid - row.fullyRefunded;
      if (row.category === "report") {
        standaloneOrders += retained;
        standalonePaise += row.netPaise;
      }
      if (row.category === "upsell") {
        upsellOrders += retained;
        if (row.items.length === 1) singleUpsellPaise += row.netPaise;
        else sharedOrders += retained;
      }
    }
    return {
      ...report,
      standaloneOrders,
      upsellOrders,
      standalonePaise,
      singleUpsellPaise,
      sharedOrders,
    };
  });
  const warnings = [...(input.warnings || [])];
  const unidentifiedProducts = Array.from(products.values())
    .filter((p) => p.id === "unidentified")
    .reduce((sum, p) => sum + p.attempts, 0);
  if (unidentifiedProducts)
    warnings.push(
      `${unidentifiedProducts} checkouts lack a product identifier and remain in an unidentified product row.`,
    );
  if (deduped.conflicts)
    warnings.push(
      `${deduped.conflicts} conflicting gateway orders excluded: stored sale/refund amounts cannot be reconciled.`,
    );
  if (excluded.length)
    warnings.push(
      `${excluded.length} rows excluded for invalid amounts or non-INR / missing currency; no exchange rate is assumed.`,
    );
  if (totals.unknown)
    warnings.push(
      `${totals.unknown} orders have unrecognized statuses; no revenue assigned.`,
    );
  if (totals.refunded)
    warnings.push(
      "Refund amounts come from recorded refund rows, joined to their original order where available. This report groups by checkout date, not refund settlement date.",
    );
  if (unidentifiedBuyers)
    warnings.push(
      `${unidentifiedBuyers} paid orders have no customer identity; excluded from unique buyer counts.`,
    );
  return {
    range,
    attribution: input.attribution,
    totals,
    categories,
    products: Array.from(products.values()).sort(
      (a, b) => b.netPaise - a.netPaise || a.name.localeCompare(b.name),
    ),
    reports,
    campaigns: Array.from(campaignMap.values()).sort(
      (a, b) => b.netPaise - a.netPaise,
    ),
    daily: Array.from(daily.values()),
    orders: orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    upsells: {
      bundleBuyers: bundleBuyers.size,
      attachedBuyers: upsellBuyers.size,
      attachRate: ratio(upsellBuyers.size, bundleBuyers.size),
      linkedUpsellPaise,
    },
    quality: {
      rawRows: input.payments.length,
      duplicates: deduped.duplicates,
      refundEvents: deduped.refundEvents,
      conflicts: deduped.conflicts,
      excluded: excluded.length,
      attributedPaid,
      attributionCoverage: ratio(attributedPaid, totals.paid),
      eventsAvailable: events !== null,
      offerEvents: events?.length ?? null,
      warnings,
    },
  };
}
export type RevenueDashboard = ReturnType<typeof buildRevenueDashboard> & {
  generatedAt: string;
  snapshot: string;
  orderPage: { total: number; offset: number; limit: number };
};
