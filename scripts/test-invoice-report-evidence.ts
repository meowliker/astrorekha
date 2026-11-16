import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReportEvidence, reportCompletion } from "../src/lib/invoice-report-evidence";

async function main() {
  assert.equal(reportCompletion(null, "report_data", "pastLifeReport"), false);
  assert.equal(reportCompletion({ status: "complete" }, "report_data", "pastLifeReport"), false);
  assert.equal(reportCompletion({ status: "failed", created_at: "2026-08-01", report_data: {} }, "report_data", "pastLifeReport"), false);
  assert.equal(reportCompletion({ palm_image_url: "image", created_at: "2026-08-01" }, "reading", "palmReading"), false);
  assert.equal(reportCompletion({ status: "complete", report_data: { text: "Saved report" } }, "report_data", "pastLifeReport"), true);
  const calls: unknown[][] = [];
  function fake(row: Record<string, unknown> | null, fail = false) {
    return { from(table: string) {
      const result = table === "marketing_events" ? { data: [], count: 0, error: null }
        : { data: row, error: fail ? new Error("query failed") : null };
      const builder = { then(resolve: (v: unknown) => unknown) { return Promise.resolve(result).then(resolve); } } as Record<string, unknown>;
      for (const method of ["select", "eq", "gte", "order", "limit", "maybeSingle"]) builder[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return builder; };
      return builder;
    } } as unknown as SupabaseClient;
  }
  const date = "2026-09-16T10:00:00Z";
  const absent = await getReportEvidence(fake(null), "account", ["Past Life Report"], date, { pastLifeReport: true });
  assert.equal(absent[0].complete, false, "Access entitlement alone must not claim generation");
  assert.equal(absent[0].accessEnabled, true);
  assert.equal(absent[0].generatedAt, null);
  const existing = { id: "report", status: "complete", created_at: "2026-09-14T10:00:00Z", report_data: { text: "Private content" } };
  const noGeneration = await getReportEvidence(fake(existing), "account", ["Past Life Report"], date, {});
  assert.equal(noGeneration[0].generatedAt, null, "Do not use row creation or purchase date as generation date");
  assert.equal(JSON.stringify(noGeneration).includes("Private content"), false);
  const dated = await getReportEvidence(fake({ ...existing, generated_at: existing.created_at }), "account", ["Past Life Report"], date, {});
  assert.equal(dated[0].generatedBeforePurchase, true);
  assert(calls.some(c => JSON.stringify(c) === JSON.stringify(["marketing_events", "gte", "created_at", date])));
  await assert.rejects(getReportEvidence(fake(null, true), "account", ["Past Life Report"], date, {}), /Unable to verify/);
  console.log("PASS: saved content, access vs generation, actual timestamps, metadata privacy and failed-query handling");
}
main().catch(e => { console.error(e); process.exit(1); });
