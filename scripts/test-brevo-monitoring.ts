import assert from "node:assert/strict";
import { confirmBrevoFailure } from "../src/lib/monitoring-brevo-policy";
import type { MonitorCheck } from "../src/lib/system-monitoring";

const now = Date.parse("2026-10-16T12:00:00.000Z");
const failed: MonitorCheck = {
  key: "brevo", name: "Brevo email", status: "down", message: "Transactional email API timed out on both attempts",
  checkedAt: new Date(now).toISOString(), latencyMs: 24000,
};
const first = confirmBrevoFailure(failed, null, "cron", now);
assert.equal(first.status, "warming", "one failed run must not page anyone");
assert.equal(first.observedStatus, "down");

const prior = { started_at: new Date(now - 30 * 60_000).toISOString(), checks: [first] };
const second = confirmBrevoFailure(failed, prior, "cron", now);
assert.equal(second.status, "down", "two consecutive scheduled failures must open an incident");
assert.equal(second.observedStatus, "down");

assert.equal(confirmBrevoFailure(failed, prior, "manual", now).status, "warming", "manual runs cannot confirm an outage");
assert.equal(confirmBrevoFailure(failed, { ...prior, started_at: new Date(now - 90 * 60_000).toISOString() }, "cron", now).status,
  "warming", "an old failure cannot confirm a new outage");

const healthy: MonitorCheck = { ...failed, status: "ok", message: "API responded after retry" };
assert.equal(confirmBrevoFailure(healthy, prior, "cron", now).status, "ok", "a successful retry must clear the pending failure");
assert.equal(confirmBrevoFailure(failed, { ...prior, checks: [healthy] }, "cron", now).status,
  "warming", "a healthy prior run must reset the streak");

console.log("Brevo monitoring failure confirmation tests passed");
