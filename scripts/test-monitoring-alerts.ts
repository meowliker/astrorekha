import assert from "node:assert/strict";
import { buildMonitoringAlert } from "../src/lib/monitoring-alerts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monitoringAlertRecipients, setMonitoringAlertsPaused, type MonitoringDestination } from "../src/lib/monitoring-delivery";
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

const meta = buildMonitoringAlert([
  { check: check("meta:123", "Ad account", "No new Meta Insights spend was reported for 30 minutes"), event: "issue" },
], at);
assert.match(meta.slackText, /Meta can report spend late/);
assert.doesNotMatch(meta.slackText, /ads are running/);

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

async function verifyAlertPause() {
  const slack: MonitoringDestination = {
    kind: "slack", label: "Environment Slack", address: "https://hooks.slack.com/services/example", enabled: true,
  };
  const email: MonitoringDestination = {
    kind: "email", label: "Environment email", address: "alerts@example.invalid", enabled: true,
  };
  const savedSlack = { ...slack, label: "Saved Slack" };
  let saved = [savedSlack];
  let setting: { value: { paused: boolean } } | null = null;
  let settingsUnavailable = false;
  const db = {
    from(table: string) {
      if (table === "monitoring_destinations") return { select: () => ({ abortSignal: async () => ({ data: saved }) }) };
      assert.equal(table, "settings");
      return {
        select: () => ({
          eq: (_column: string, key: string) => {
            assert.equal(key, "monitoring_alert_delivery");
            return { abortSignal: () => ({ maybeSingle: async () => ({
              data: setting, error: settingsUnavailable ? { message: "unavailable" } : null,
            }) }) };
          },
        }),
        upsert: async ({ key, value }: { key: string; value: { paused: boolean } }) => {
          assert.equal(key, "monitoring_alert_delivery");
          setting = { value };
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  const recipients = (fallbackOnly = false) => monitoringAlertRecipients(db, [slack, email], fallbackOnly);

  assert.deepEqual(await recipients(), [savedSlack, email]);
  saved = [{ ...savedSlack, enabled: false }];
  assert.deepEqual(await recipients(), [email]);
  assert.deepEqual(await recipients(true), [email]);

  await setMonitoringAlertsPaused(db, true);
  assert.deepEqual(await recipients(), []);
  assert.deepEqual(await recipients(true), []);

  await setMonitoringAlertsPaused(db, false);
  assert.deepEqual(await recipients(), [email]);

  settingsUnavailable = true;
  assert.deepEqual(await recipients(true), []);
  console.log("Monitoring pause, resume, fallback delivery, and disabled Slack destinations passed.");
}

verifyAlertPause().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
