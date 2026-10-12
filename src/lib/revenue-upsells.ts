/** Buyer-level bundle cohorts. Revenue stays on the order, never split across combo items. */
export type CohortPurchase = {
  buyer: string | null;
  createdAt: string;
  category: string;
  productId: string;
  productName: string;
  items: string[];
  paid: boolean;
  netPaise: number;
  refunded: boolean;
};
const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
export function buildUpsellCohorts(
  purchases: CohortPurchase[],
  reports: { id: string; name: string }[],
  bundles: { id: string; name: string }[],
) {
  const paidBundles = purchases.filter(
    (p) => p.category === "bundle" && p.paid,
  );
  const bundleNames = new Map(bundles.map((b) => [b.id, b.name]));
  for (const b of paidBundles) bundleNames.set(b.productId, b.productName);
  const definitions = [
    { id: "all", name: "All bundles" },
    ...Array.from(bundleNames, ([id, name]) => ({ id, name })),
  ];
  return definitions.map((definition) => {
    const base = paidBundles.filter(
      (p) => definition.id === "all" || p.productId === definition.id,
    );
    const cohort = new Map<string, number>();
    for (const p of base)
      if (p.buyer)
        cohort.set(
          p.buyer,
          Math.min(cohort.get(p.buyer) ?? Infinity, Date.parse(p.createdAt)),
        );
    const perReport = new Map(
      reports
        .filter((r) => r.id !== "unidentified")
        .map((r) => [
          r.id,
          {
            ...r,
            started: new Set<string>(),
            bought: new Set<string>(),
            retained: new Set<string>(),
            refunded: new Set<string>(),
          },
        ]),
    );
    const started = new Set<string>(),
      bought = new Set<string>(),
      retained = new Set<string>();
    let linkedNetPaise = 0,
      unknownReportOrders = 0;
    for (const p of purchases) {
      if (!p.buyer || p.category !== "upsell") continue;
      const bundledAt = cohort.get(p.buyer);
      if (bundledAt === undefined || Date.parse(p.createdAt) < bundledAt)
        continue;
      const items = p.items.filter((id) => perReport.has(id));
      if (!items.length) {
        unknownReportOrders++;
        continue;
      }
      started.add(p.buyer);
      if (p.paid) {
        bought.add(p.buyer);
        linkedNetPaise += p.netPaise;
        if (p.netPaise > 0) retained.add(p.buyer);
      }
      for (const item of items) {
        const row = perReport.get(item)!;
        row.started.add(p.buyer);
        if (!p.paid) continue;
        row.bought.add(p.buyer);
        if (p.netPaise > 0) row.retained.add(p.buyer);
        if (p.refunded) row.refunded.add(p.buyer);
      }
    }
    const stats = (s: Set<string>, b: Set<string>, r: Set<string>) => ({
      bundleBuyers: cohort.size,
      checkoutBuyers: s.size,
      checkoutStartRate: rate(s.size, cohort.size),
      buyers: b.size,
      cvr: rate(b.size, cohort.size),
      notPurchased: cohort.size - b.size,
      dropOffRate: rate(cohort.size - b.size, cohort.size),
      checkoutCvr: rate(b.size, s.size),
      checkoutDropOffRate: rate(s.size - b.size, s.size),
      retainedBuyers: r.size,
      retainedCvr: rate(r.size, cohort.size),
    });
    return {
      ...definition,
      ...stats(started, bought, retained),
      paidBundleOrders: base.length,
      unidentifiedBundleOrders: base.filter((p) => !p.buyer).length,
      identityCoverage: rate(base.filter((p) => !!p.buyer).length, base.length),
      linkedNetPaise,
      unknownReportOrders,
      reports: Array.from(perReport.values(), (r) => ({
        id: r.id,
        name: r.name,
        ...stats(r.started, r.bought, r.retained),
        refundedBuyers: r.refunded.size,
        refundRate: rate(r.refunded.size, r.bought.size),
      })).sort((a, b) => b.buyers - a.buyers || a.name.localeCompare(b.name)),
    };
  });
}
