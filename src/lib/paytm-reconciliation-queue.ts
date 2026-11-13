import { getSupabaseAdmin } from "./supabase-admin";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
type Lane = "fulfillment" | "recent" | "aging" | "recovery";
export type PaytmReconciliationCandidate = { id: string; lane: Lane };

/** Separate quotas keep historical failures from delaying a customer's new payment. */
export async function selectPaytmReconciliationCandidates(
  db: ReturnType<typeof getSupabaseAdmin>,
  mode: string,
  now = new Date(),
): Promise<PaytmReconciliationCandidate[]> {
  const at = (ago: number) => new Date(now.getTime() - ago).toISOString();
  const specs = [
    { lane: "fulfillment", table: "payments", limit: 4, interval: MINUTE },
    { lane: "recent", table: "payments", limit: 24, interval: MINUTE },
    { lane: "recent", table: "soulmate_orders", limit: 12, interval: MINUTE },
    { lane: "aging", table: "payments", limit: 6, interval: 15 * MINUTE },
    { lane: "aging", table: "soulmate_orders", limit: 3, interval: 15 * MINUTE },
    { lane: "recovery", table: "payments", limit: 4, interval: 6 * HOUR },
    { lane: "recovery", table: "soulmate_orders", limit: 2, interval: 6 * HOUR },
  ] as const;
  const results = await Promise.all(specs.map(async spec => {
    const checked = spec.table === "payments" ? "gateway_checked_at" : "last_verified_at";
    const filters = [
      `or(gateway_check_until.is.null,gateway_check_until.lte.${at(0)})`,
      `or(${checked}.is.null,${checked}.lte.${at(spec.interval)})`,
    ];
    let query = db.from(spec.table).select("id")
      .eq("gateway", "paytm").eq("payment_mode", mode)
      .gte("created_at", at(14 * 24 * HOUR));
    if (spec.lane === "fulfillment") {
      query = query.eq("payment_status", "paid").is("fulfilled_at", null);
    } else if (spec.lane === "recovery") {
      // Still recover late successes, including orders previously reported as failed.
      filters.push(`or(payment_status.eq.failed,and(payment_status.in.(created,pending),created_at.lt.${at(24 * HOUR)}))`);
    } else {
      query = query.in("payment_status", ["created", "pending"]);
      if (spec.lane === "recent") query = query.gte("created_at", at(2 * HOUR));
      else query = query.lt("created_at", at(2 * HOUR)).gte("created_at", at(24 * HOUR));
    }
    // One logical filter ANDs the lease, due time and (for recovery) status rules.
    const result = await query.or(`and(${filters.join(",")})`)
      .order(checked, { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(spec.limit);
    if (result.error) throw result.error;
    return { lane: spec.lane, rows: result.data || [] };
  }));

  const lanes: Record<Lane, PaytmReconciliationCandidate[]> = { fulfillment: [], recent: [], aging: [], recovery: [] };
  // Interleave regular and Soulmate orders within each lane as well.
  for (let i = 0; i < Math.max(...results.map(result => result.rows.length)); i++) {
    for (const result of results) {
      const row = result.rows[i];
      if (row) lanes[result.lane].push({ id: row.id, lane: result.lane });
    }
  }
  const candidates = [...lanes.fulfillment];
  // Give new payments most capacity, but let recovery progress even during a backlog.
  while (lanes.recent.length || lanes.aging.length || lanes.recovery.length) {
    candidates.push(...lanes.recent.splice(0, 4), ...lanes.aging.splice(0, 1), ...lanes.recovery.splice(0, 1));
  }
  return candidates;
}
