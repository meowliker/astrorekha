import assert from "node:assert/strict";
import { confirmProviderFailure } from "../src/lib/monitoring-failure-policy";
import type { MonitorCheck } from "../src/lib/system-monitoring";

const now = Date.parse("2026-10-16T12:00:00.000Z");
const failed: MonitorCheck = {
  key: "brevo", name: "Brevo email", status: "down", message: "Transactional email API timed out on both attempts",
  checkedAt: new Date(now).toISOString(), latencyMs: 24000,
};
const first = confirmProviderFailure(failed, null, "cron", now);
assert.equal(first.status, "warming", "one failed run must not page anyone");
assert.equal(first.observedStatus, "down");

const prior = { started_at: new Date(now - 30 * 60_000).toISOString(), checks: [first] };
const second = confirmProviderFailure(failed, prior, "cron", now);
assert.equal(second.status, "down", "two consecutive scheduled failures must open an incident");
assert.equal(second.observedStatus, "down");

assert.equal(confirmProviderFailure(failed, prior, "manual", now).status, "warming", "manual runs cannot confirm an outage");
assert.equal(confirmProviderFailure(failed, { ...prior, started_at: new Date(now - 90 * 60_000).toISOString() }, "cron", now).status,
  "warming", "an old failure cannot confirm a new outage");

const healthy: MonitorCheck = { ...failed, status: "ok", message: "API responded after retry" };
assert.equal(confirmProviderFailure(healthy, prior, "cron", now).status, "ok", "a successful retry must clear the pending failure");
assert.equal(confirmProviderFailure(failed, { ...prior, checks: [healthy] }, "cron", now).status,
  "warming", "a healthy prior run must reset the streak");

const aisensyFailure: MonitorCheck = {
  ...failed, key: "aisensy", name: "AiSensy WhatsApp", message: "Request timed out on both attempts", latencyMs: 16000,
};
const aisensyFirst = confirmProviderFailure(aisensyFailure, null, "cron", now);
assert.equal(aisensyFirst.status, "warming", "one AiSensy timeout must not send an alert");
assert.equal(confirmProviderFailure(aisensyFailure, {
  started_at: new Date(now - 30 * 60_000).toISOString(), checks: [aisensyFirst],
}, "cron", now).status, "down", "two consecutive AiSensy failures must open an incident");
assert.equal(confirmProviderFailure(aisensyFailure, prior, "cron", now).status,
  "warming", "another provider's failure must not confirm AiSensy is down");
assert.equal(confirmProviderFailure({ ...aisensyFailure, status: "ok" }, {
  started_at: new Date(now - 30 * 60_000).toISOString(), checks: [aisensyFirst],
}, "cron", now).status, "ok", "a healthy AiSensy check must reset its streak");

console.log("Provider monitoring failure confirmation tests passed");
const paytmFailure: MonitorCheck = { ...failed, key: "paytm", name: "Paytm backup" };
const paytmFirst = confirmProviderFailure(paytmFailure, null, "cron", now);
assert.equal(paytmFirst.status, "warming");
assert.equal(confirmProviderFailure(paytmFailure, { started_at: new Date(now - 30 * 60_000).toISOString(), checks: [paytmFirst] }, "cron", now).status, "down");
