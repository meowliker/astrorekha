import assert from "node:assert/strict";
import { buildMonitoringAlert } from "../src/lib/monitoring-alerts";
import type { MonitorCheck } from "../src/lib/system-monitoring";

const at = new Date("2026-10-13T07:00:00.000Z");
const check = (key: string, name: string, message: string): MonitorCheck => ({
  key, name, message, status: "down", checkedAt: at.toISOString(), latencyMs: 10,
});

const issue = buildMonitoringAlert([
  { check: check("supabase", "Supabase database", "Monitoring cannot save its run"), event: "issue" },
], at);
assert.match(issue.slackText, /^<!here> \*AstroRekha needs attention\*/);
assert.match(issue.slackText, /couldn't read or save information in Supabase/);
assert.doesNotMatch(issue.slackText, /Monitoring cannot save its run/);
assert.match(issue.emailHtml, /Orders and other live data may be affected/);
assert.doesNotMatch(issue.emailHtml, /<!here>/);

const recovered = buildMonitoringAlert([
  { check: check("supabase", "Supabase database", "Database read succeeded"), event: "recovery" },
], at);
assert.doesNotMatch(recovered.slackText, /<!here>/);
assert.match(recovered.slackText, /health check is passing again/);

const escaped = buildMonitoringAlert([
  { check: check("vercel", "<script>alert(1)</script>", "Application returned HTTP 503"), event: "issue" },
], at);
assert.doesNotMatch(escaped.emailHtml, /<script>/);
assert.match(escaped.emailHtml, /&lt;script&gt;/);

console.log("Monitoring alert wording, Slack mention, and email escaping passed.");
