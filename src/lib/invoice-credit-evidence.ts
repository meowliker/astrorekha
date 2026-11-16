import type { SupabaseClient } from "@supabase/supabase-js";

export type CreditEvidence = {
  checkedAt: string;
  paymentRecordId: string;
  coins: number;
  fulfillmentRecordedAt: string | null;
  firstChatVisit: { id: string; at: string } | null;
  chatVisitCount: number;
  retainedChat: { userMessages: number; assistantMessages: number; firstAt: string | null; lastAt: string | null };
};

// Only metadata leaves the server. This snapshot is account activity, not a
// consumption ledger tying individual messages to a particular coin purchase.
export function summarizeChatMetadata(messages: unknown, after: string) {
  const cutoff = Date.parse(after);
  const retained = (Array.isArray(messages) ? messages : []).filter((m) =>
    m && typeof m === "object" && ["user", "assistant"].includes(m.role) &&
    typeof m.timestamp === "string" && Number.isFinite(Date.parse(m.timestamp)) &&
    Date.parse(m.timestamp) >= cutoff
  ).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return {
    userMessages: retained.filter((m) => m.role === "user").length,
    assistantMessages: retained.filter((m) => m.role === "assistant").length,
    firstAt: retained[0]?.timestamp || null,
    lastAt: retained.at(-1)?.timestamp || null,
  };
}

export async function getCreditEvidence(
  db: SupabaseClient,
  payment: { id: string; user_id: string | null; coins: number | null; fulfilled_at: string | null; created_at: string | null; source?: string }
): Promise<CreditEvidence | null> {
  // Synthetic account fallbacks are not transaction-level credit evidence.
  if (payment.source && payment.source !== "payments") return null;
  if (!payment.user_id || !payment.created_at || !Number.isFinite(Date.parse(payment.created_at))) return null;
  const [visits, chat] = await Promise.all([
    db.from("marketing_events").select("id,created_at", { count: "exact" })
      .eq("user_id", payment.user_id).eq("event_name", "page_view").eq("path", "/chat")
      .gte("created_at", payment.created_at).order("created_at", { ascending: true }).limit(1),
    db.from("chat_messages").select("messages").eq("id", payment.user_id).maybeSingle(),
  ]);
  if (visits.error || chat.error) throw new Error("Unable to verify chat access records. Please retry.");
  return {
    checkedAt: new Date().toISOString(), paymentRecordId: payment.id,
    coins: Number(payment.coins || 0), fulfillmentRecordedAt: payment.fulfilled_at || null,
    firstChatVisit: visits.data?.[0] ? { id: visits.data[0].id, at: visits.data[0].created_at } : null,
    chatVisitCount: visits.count || 0,
    retainedChat: summarizeChatMetadata(chat.data?.messages, payment.created_at),
  };
}
