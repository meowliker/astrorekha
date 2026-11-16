import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCreditEvidence, summarizeChatMetadata } from "../src/lib/invoice-credit-evidence";

async function main() {
  const after = "2026-09-13T07:51:42Z";
  const messages = [
    { role: "user", timestamp: "2026-09-12T10:00:00Z", content: "Before purchase" },
    { role: "assistant", timestamp: "2026-11-13T11:06:00Z", content: "Private response" },
    { role: "user", timestamp: "2026-11-13T11:05:00Z", content: "Private question" },
    { role: "user", timestamp: "invalid" },
    { role: "system", timestamp: "2026-11-13T11:07:00Z" },
  ];
  assert.deepEqual(summarizeChatMetadata(messages, after), {
    userMessages: 1, assistantMessages: 1,
    firstAt: "2026-11-13T11:05:00Z", lastAt: "2026-11-13T11:06:00Z",
  });
  assert.equal(JSON.stringify(summarizeChatMetadata(messages, after)).includes("Private"), false);
  const calls: unknown[][] = [];
  function fakeDb(fail = false) {
    return { from(table: string) {
      const result = table === "marketing_events"
        ? { data: [{ id: "visit-1", created_at: "2026-09-13T08:29:21Z" }], count: 4, error: fail ? new Error("unavailable") : null }
        : { data: { messages }, error: null };
      const builder = { then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); } } as Record<string, unknown>;
      for (const method of ["select", "eq", "gte", "order", "limit", "maybeSingle"]) {
        builder[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return builder; };
      }
      return builder;
    } } as unknown as SupabaseClient;
  }
  const payment = { id: "payment-1", user_id: "account-1", coins: 45, created_at: after, fulfilled_at: null };
  const evidence = await getCreditEvidence(fakeDb(), payment);
  assert.equal(evidence?.coins, 45);
  assert.equal(evidence?.fulfillmentRecordedAt, null, "Do not substitute payment date for missing fulfillment time");
  assert.equal(evidence?.chatVisitCount, 4);
  assert.equal(evidence?.firstChatVisit?.id, "visit-1");
  assert(calls.some((c) => JSON.stringify(c) === JSON.stringify(["marketing_events", "eq", "user_id", "account-1"])));
  assert(calls.some((c) => JSON.stringify(c) === JSON.stringify(["marketing_events", "gte", "created_at", after])));
  assert.equal(await getCreditEvidence(fakeDb(), { ...payment, source: "user_fallback" }), null);
  await assert.rejects(getCreditEvidence(fakeDb(true), payment), /Unable to verify/);
  console.log("PASS: purchase-scoped queries, chronology, missing timestamps, privacy and query failures");
}
main().catch((e) => { console.error(e); process.exit(1); });
