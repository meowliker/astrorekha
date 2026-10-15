export type SoulmateAnalyticsEvent = { event_name: string; session_id: string | null; utm_source?: string | null; utm_campaign?: string | null; created_at: string };
export type SoulmateAnalyticsOrder = { id: string; amount: number; attribution: { sessionId?: string | null } | null };
const rate = (numerator: number, denominator: number) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
/** All funnel rates use the same cohort: sessions with a tracked soulmate landing. */
export function summarizeSoulmateAnalytics(events: SoulmateAnalyticsEvent[], orders: SoulmateAnalyticsOrder[]) {
  const landings = new Map<string, SoulmateAnalyticsEvent>();
  const stages = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.session_id) continue;
    if (event.event_name === "soulmate_landing_view" && !landings.has(event.session_id)) landings.set(event.session_id, event);
    const set = stages.get(event.event_name) || new Set<string>();
    set.add(event.session_id);
    stages.set(event.event_name, set);
  }
  const cohort = (name: string) => new Set([...(stages.get(name) || [])].filter((id) => landings.has(id)));
  const chats = cohort("soulmate_chat_start"), completed = cohort("soulmate_chat_complete"), checkouts = cohort("soulmate_checkout_view"), redirects = cohort("soulmate_payu_redirect");
  const buyers = new Set(orders.map((order) => order.attribution?.sessionId).filter((id): id is string => Boolean(id && landings.has(id))));
  const paidCheckouts = [...buyers].filter((id) => checkouts.has(id)).length;
  const campaigns = new Map<string, { source: string; campaign: string; sessions: number; checkoutSessions: number; purchasingSessions: number }>();
  for (const [id, event] of landings) {
    const source = event.utm_source || "direct / unknown", campaign = event.utm_campaign || "(untagged)";
    const key = JSON.stringify([source, campaign]);
    const row = campaigns.get(key) || { source, campaign, sessions: 0, checkoutSessions: 0, purchasingSessions: 0 };
    row.sessions++; if (checkouts.has(id)) row.checkoutSessions++; if (buyers.has(id)) row.purchasingSessions++;
    campaigns.set(key, row);
  }
  return {
    sessions: landings.size, checkoutRate: rate(checkouts.size, landings.size), conversionRate: rate(buyers.size, landings.size),
    checkoutToPurchaseRate: rate(paidCheckouts, checkouts.size), checkoutAbandonment: rate(checkouts.size - paidCheckouts, checkouts.size),
    chatCompletionRate: rate([...completed].filter((id) => chats.has(id)).length, chats.size),
    paidOrders: orders.length, grossRevenue: orders.reduce((sum, order) => sum + order.amount, 0) / 100,
    attributedPurchasingSessions: buyers.size,
    funnel: [
      { label: "Landing viewed", sessions: landings.size }, { label: "Chat started", sessions: chats.size },
      { label: "Answers completed", sessions: completed.size }, { label: "Checkout opened", sessions: checkouts.size },
      { label: "Sent to PayU", sessions: redirects.size }, { label: "Verified purchase", sessions: buyers.size },
    ],
    campaigns: [...campaigns.values()].sort((a, b) => b.sessions - a.sessions),
  };
}
