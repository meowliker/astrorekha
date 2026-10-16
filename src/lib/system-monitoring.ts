import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/brevo";
import { META_AD_ACCOUNTS_SETTINGS_KEY, getMetaAccountCredentialsFromEnv, normalizeMetaAdAccountsSettings } from "@/lib/meta-ad-accounts";
import { selectMonitoredMetaAccounts } from "@/lib/monitoring-meta-accounts";
import { verifyPayUTransaction } from "@/lib/payu-api";
import { buildMonitoringAlert } from "@/lib/monitoring-alerts";
import { confirmProviderFailure, requiresConsecutiveFailures } from "@/lib/monitoring-failure-policy";

export type MonitorStatus = "ok" | "warning" | "down" | "unconfigured" | "warming";
export type MonitorCheck = {
  key: string;
  name: string;
  status: MonitorStatus;
  message: string;
  checkedAt: string;
  latencyMs: number;
  observedStatus?: "warning" | "down";
};
type Destination = { id?: string; kind: "email" | "slack" | "slack_chat"; label: string; address: string; enabled: boolean };
type Incident = { check_key: string; active: boolean; status: string; opened_at: string; last_seen_at: string; last_notified_at: string | null };

const PAID = ["paid", "success", "captured"];
const TIMEOUT_MS = 8_000;
const issue = (status: MonitorStatus) => status === "warning" || status === "down";

function result(key: string, name: string, status: MonitorStatus, message: string, started: number): MonitorCheck {
  return { key, name, status, message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
}

async function probe(key: string, name: string, fn: () => Promise<{ status: MonitorStatus; message: string }>): Promise<MonitorCheck> {
  const started = Date.now();
  try {
    const value = await fn();
    return result(key, name, value.status, value.message, started);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Request timed out" : "Health check failed";
    return result(key, name, "down", message, started);
  }
}

async function httpStatus(url: string, init: RequestInit = {}): Promise<number> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return response.status;
}

async function provider(key: string, name: string, configured: boolean, url: string, init: RequestInit, validate?: (response: Response) => Promise<string | null>): Promise<MonitorCheck> {
  if (!configured) return result(key, name, "unconfigured", "Credentials are not configured", Date.now());
  return probe(key, name, async () => {
    const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 429) return { status: "warning", message: "API is rate limiting requests" };
    if (!response.ok) return { status: "down", message: `API returned HTTP ${response.status}` };
    const problem = validate ? await validate(response) : null;
    return problem ? { status: "warning", message: problem } : { status: "ok", message: "Authenticated API responded" };
  });
}

async function brevoCheck(): Promise<MonitorCheck> {
  const started = Date.now();
  if (!process.env.BREVO_API_KEY) return result("brevo", "Brevo email", "unconfigured", "Credentials are not configured", started);
  const checkOnce = async () => {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=1", {
        headers: { "api-key": process.env.BREVO_API_KEY || "" }, cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 429) return { status: "warning" as const, message: "Transactional email API is rate limiting requests" };
      if (!response.ok) return { status: "down" as const, message: `Transactional email API returned HTTP ${response.status}` };
      const body = await response.json().catch(() => null) as { requests?: number } | null;
      return typeof body?.requests === "number"
        ? { status: "ok" as const, message: "Transactional email API responded" }
        : { status: "warning" as const, message: "Transactional email API returned an unexpected response" };
    } catch (error) {
      return { status: "down" as const, message: error instanceof Error && error.name === "TimeoutError" ? "Transactional email API timed out" : "Transactional email API request failed" };
    }
  };
  const first = await checkOnce();
  if (first.status === "ok") return result("brevo", "Brevo email", "ok", first.message, started);
  // Do not repeat a rate-limited request immediately; the next scheduled run will confirm it.
  if (first.message.includes("rate limiting")) return result("brevo", "Brevo email", first.status, first.message, started);
  const second = await checkOnce();
  return result("brevo", "Brevo email", second.status,
    second.status === "ok" ? "Transactional email API responded after retry" : `${second.message} on both attempts`, started);
}

async function brevoSendCheck(db: SupabaseClient, now: number): Promise<MonitorCheck> {
  return probe("brevo_send", "Brevo email sends", async () => {
    const { data, error } = await db.from("monitoring_incidents").select("active,message,last_seen_at").eq("check_key", "brevo_send").maybeSingle();
    if (error) return { status: "down", message: "Unable to read transactional email send failures" };
    return data?.active && now - Date.parse(data.last_seen_at) < 60 * 60_000
      ? { status: "warning", message: data.message }
      : { status: "ok", message: "No recent transactional email send failures" };
  });
}

async function salesCheck(db: SupabaseClient, now: number): Promise<MonitorCheck> {
  return probe("sales", "Paid sales", async () => {
    const since = new Date(now - 60 * 60_000).toISOString();
    const [{ count: current, error: currentError }, { count: legacy, error: legacyError }] = await Promise.all([
      db.from("payments").select("id", { count: "exact", head: true }).in("payment_status", PAID).gte("fulfilled_at", since),
      db.from("payments").select("id", { count: "exact", head: true }).in("payment_status", PAID).is("fulfilled_at", null).gte("created_at", since),
    ]);
    if (currentError || legacyError) return { status: "down", message: "Unable to read paid orders" };
    const count = (current || 0) + (legacy || 0);
    return count > 0
      ? { status: "ok", message: `${count} paid ${count === 1 ? "sale" : "sales"} in the last hour` }
      : { status: "warning", message: "No paid sales in the last 60 minutes" };
  });
}

async function metaChecks(db: SupabaseClient, now: number): Promise<MonitorCheck[]> {
  const started = Date.now();
  let credentials;
  let inactive: Map<string, string>;
  try {
    const { data, error } = await db.from("settings").select("value").eq("key", META_AD_ACCOUNTS_SETTINGS_KEY).maybeSingle();
    if (error) throw error;
    const range = { startMillis: now - 60 * 60_000, endMillis: now };
    ({ credentials, inactive } = selectMonitoredMetaAccounts(
      normalizeMetaAdAccountsSettings(data?.value), getMetaAccountCredentialsFromEnv(range), range,
    ));
  } catch {
    return [result("meta", "Meta Ads", "down", "Unable to read configured ad accounts", started)];
  }
  const inactiveKeys = Array.from(inactive.keys(), (accountId) => `meta:${accountId}`);
  const { data: retiredIncidents, error: incidentError } = inactiveKeys.length
    ? await db.from("monitoring_incidents").select("check_key").eq("active", true).in("check_key", inactiveKeys)
    : { data: [], error: null };
  if (incidentError) return [result("meta", "Meta Ads", "down", "Unable to read retired ad account issues", started)];
  const retiredChecks = (retiredIncidents || []).map(({ check_key }) => {
    const accountId = check_key.slice("meta:".length);
    return result(check_key, inactive.get(accountId) || `Ad account ${accountId}`, "unconfigured", "Ad account is inactive in monitoring settings", started);
  });
  const unique = Array.from(new Map(credentials.map((item) => [item.accountId, item])).values());
  if (!unique.length) return [result("meta", "Meta Ads", "unconfigured", "No active ad account is configured", started), ...retiredChecks];
  const currentChecks = await Promise.all(unique.map((credential) => probe(`meta:${credential.accountId}`, credential.label || `Ad account ${credential.accountId}`, async () => {
    const params = new URLSearchParams({ fields: "id,name,currency,account_status,timezone_offset_hours_utc" });
    // The token stays in the server-only Authorization header and never reaches logs or alerts.
    const response = await fetch(`https://graph.facebook.com/v21.0/act_${credential.accountId}?${params}`, {
      headers: { Authorization: `Bearer ${credential.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 429) return { status: "warning", message: "Meta API is rate limiting requests" };
    if (!response.ok) return { status: "down", message: `Meta API returned HTTP ${response.status}` };
    const account = await response.json() as { name?: string; account_status?: number; timezone_offset_hours_utc?: number };
    if (account.account_status !== 1) return { status: "warning", message: `Ad account status ${account.account_status ?? "unknown"}` };
    const offset = Number(account.timezone_offset_hours_utc);
    if (!Number.isFinite(offset)) return { status: "warning", message: "Meta did not return the ad account timezone" };
    const accountDate = new Date(now + offset * 60 * 60_000).toISOString().slice(0, 10);
    const insightsParams = new URLSearchParams({
      fields: "spend,date_start", level: "account", time_increment: "1",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify({ since: accountDate, until: accountDate }), limit: "100",
    });
    const insightsResponse = await fetch(`https://graph.facebook.com/v21.0/act_${credential.accountId}/insights?${insightsParams}`, {
      headers: { Authorization: `Bearer ${credential.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (insightsResponse.status === 429) return { status: "warning", message: "Meta Insights is rate limiting requests" };
    if (!insightsResponse.ok) return { status: "down", message: `Meta Insights returned HTTP ${insightsResponse.status}` };
    const insights = await insightsResponse.json() as {
      data?: Array<{ spend?: string | number }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (insights.error || insights.paging?.next || !Array.isArray(insights.data)) {
      return { status: "warning", message: "Meta returned incomplete hourly spend data" };
    }
    const amounts = insights.data.map((row) => Number(row.spend));
    if (amounts.some((value) => !Number.isFinite(value))) {
      return { status: "warning", message: "Meta returned invalid hourly spend data" };
    }
    // Use the same hourly Insights spend source as Tracking. The account's
    // amount_spent billing counter can remain unchanged while ads are spending.
    const amount = amounts.reduce((sum, value) => sum + value, 0);
    const { data: previous, error: readError } = await db.from("monitoring_meta_snapshots")
      .select("amount_spent,captured_at").eq("account_id", credential.accountId).maybeSingle();
    if (readError) return { status: "down", message: "Unable to read previous spend snapshot" };
    const elapsedMinutes = previous ? (now - Date.parse(previous.captured_at)) / 60_000 : 0;
    if (previous && elapsedMinutes < 29) {
      return { status: "warming", message: "Waiting for a comparable 30 minute spend snapshot" };
    }
    const { error: writeError } = await db.from("monitoring_meta_snapshots").upsert({
      account_id: credential.accountId, account_name: account.name || credential.label || credential.accountId,
      amount_spent: amount, captured_at: new Date(now).toISOString(),
    }, { onConflict: "account_id" });
    if (writeError) return { status: "down", message: "Unable to save spend snapshot" };
    if (!previous) return { status: "warming", message: "First spend snapshot saved; comparison starts next run" };
    if (amount < Number(previous.amount_spent)) {
      return { status: "warming", message: "Meta Insights spend baseline changed; new comparison window started" };
    }
    return amount > Number(previous.amount_spent)
      ? { status: "ok", message: "Meta Insights reported spend increased since the prior check" }
      : { status: "warning", message: `No new Meta Insights spend was reported for ${Math.floor(elapsedMinutes)} minutes` };
  })));
  return [...currentChecks, ...retiredChecks];
}

async function payuCheck(db: SupabaseClient, now: number): Promise<MonitorCheck> {
  if (!process.env.PAYU_MERCHANT_KEY || !process.env.PAYU_MERCHANT_SALT) {
    return result("payu", "PayU", "unconfigured", "Merchant credentials are not configured", Date.now());
  }
  return probe("payu", "PayU", async () => {
    const { data, error } = await db.from("payments").select("payu_txn_id")
      .in("payment_status", PAID).not("payu_txn_id", "is", null)
      .gte("created_at", new Date(now - 7 * 24 * 60 * 60_000).toISOString())
      .order("created_at", { ascending: false }).limit(1);
    if (error) return { status: "down", message: "Unable to find a transaction for verification" };
    if (!data?.[0]?.payu_txn_id) return { status: "warming", message: "No paid transaction available for a read-only PayU check" };
    const verified = await verifyPayUTransaction(data[0].payu_txn_id);
    return verified
      ? { status: "ok", message: "Read-only payment verification succeeded" }
      : { status: "warning", message: "PayU responded but did not confirm the sampled payment" };
  });
}

async function reconciliationCheck(db: SupabaseClient, now: number): Promise<MonitorCheck> {
  if (!process.env.PAYU_MERCHANT_KEY || !process.env.PAYU_MERCHANT_SALT) {
    return result("payment_reconciliation", "Payment reconciliation", "unconfigured", "PayU credentials are not configured", Date.now());
  }
  return probe("payment_reconciliation", "Payment reconciliation", async () => {
    const { data, error } = await db.from("payments").select("payu_txn_id")
      .in("payment_status", ["created", "pending"]).not("payu_txn_id", "is", null)
      .gte("created_at", new Date(now - 24 * 60 * 60_000).toISOString())
      .lte("created_at", new Date(now - 5 * 60_000).toISOString())
      .order("created_at", { ascending: false }).limit(5);
    if (error) return { status: "down", message: "Unable to inspect unresolved payments" };
    if (!data?.length) return { status: "ok", message: "No unresolved PayU payments to sample" };
    const samples = await Promise.all(data.map((row) => verifyPayUTransaction(row.payu_txn_id)));
    const stuck = samples.filter((item) => ["success", "paid", "captured"]
      .includes(String(item?.status || item?.unmappedstatus || "").toLowerCase())).length;
    return stuck > 0
      ? { status: "warning", message: `${stuck} of ${data.length} sampled PayU payments succeeded but remain created/pending` }
      : { status: "ok", message: `No confirmed paid orders stuck among ${data.length} sampled unresolved payments` };
  });
}

async function reachability(key: string, name: string, configured: boolean, url: string): Promise<MonitorCheck> {
  if (!configured) return result(key, name, "unconfigured", "Not configured", Date.now());
  return probe(key, name, async () => {
    const status = await httpStatus(url, { method: "GET" });
    return status >= 500
      ? { status: "down", message: `Service returned HTTP ${status}` }
      : status === 429 ? { status: "warning", message: "Service is rate limiting requests" }
      : { status: "ok", message: "Service reachable; authenticated operations are not tested" };
  });
}

async function aisensyCheck(): Promise<MonitorCheck> {
  const enabled = String(process.env.AISENSY_ENABLED).toLowerCase() === "true";
  const url = process.env.AISENSY_API_URL || "https://backend.aisensy.com/";
  const first = await reachability("aisensy", "AiSensy WhatsApp", enabled, url);
  if (!issue(first.status) || first.message.includes("rate limiting")) return first;
  const second = await reachability("aisensy", "AiSensy WhatsApp", enabled, url);
  return {
    ...second, latencyMs: first.latencyMs + second.latencyMs,
    message: second.status === "ok" ? "Service reachable after retry" : `${second.message} on both attempts`,
  };
}

export async function collectMonitoringChecks(db: SupabaseClient, now = Date.now()): Promise<MonitorCheck[]> {
  const appUrl = process.env.MONITOR_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "https://astrorekha.com";
  const checks = await Promise.all([
    probe("vercel", "Website / Vercel", async () => {
      const status = await httpStatus(`${appUrl.replace(/\/$/, "")}/api/health`);
      return status === 200 ? { status: "ok" as const, message: "Public application health endpoint responded" }
        : { status: "down" as const, message: `Application returned HTTP ${status}` };
    }),
    probe("supabase", "Supabase database", async () => {
      const { error } = await db.from("payments").select("id").limit(1);
      return error ? { status: "down" as const, message: "Database read failed" }
        : { status: "ok" as const, message: "Database read succeeded" };
    }),
    probe("supabase_auth", "Supabase Auth", async () => {
      const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
      return error ? { status: "down" as const, message: "Auth admin API failed" }
        : { status: "ok" as const, message: "Auth admin API responded" };
    }),
    probe("supabase_storage", "Supabase Storage", async () => {
      const { error } = await db.storage.listBuckets();
      return error ? { status: "down" as const, message: "Storage API failed" }
        : { status: "ok" as const, message: "Storage API responded" };
    }),
    salesCheck(db, now),
    payuCheck(db, now),
    reconciliationCheck(db, now),
    provider("claude", "Claude / Anthropic", !!process.env.ANTHROPIC_API_KEY,
      "https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" } }),
    provider("kie", "Kie.ai", !!process.env.KIE_API_KEY,
      `${(process.env.KIE_API_BASE_URL || "https://api.kie.ai").replace(/\/$/, "")}/api/v1/chat/credit`,
      { headers: { Authorization: `Bearer ${process.env.KIE_API_KEY || ""}` } },
      async (response) => {
        const body = await response.json().catch(() => null) as { code?: number; data?: number } | null;
        return body?.code !== 200 || typeof body.data !== "number" ? "Credit API returned an unexpected response"
          : body.data <= 0 ? "Kie credits are exhausted" : null;
      }),
    provider("prokerala", "Prokerala", !!process.env.PROKERALA_CLIENT_ID && !!process.env.PROKERALA_CLIENT_SECRET,
      "https://api.prokerala.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.PROKERALA_CLIENT_ID || "", client_secret: process.env.PROKERALA_CLIENT_SECRET || "" }) }),
    brevoCheck(),
    brevoSendCheck(db, now),
    process.env.SLACK_BOT_TOKEN
      ? provider("slack", "Slack bot", true, "https://slack.com/api/auth.test", {
          method: "POST", headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
        }, async (response) => {
          const body = await response.json().catch(() => null) as { ok?: boolean } | null;
          return body?.ok ? null : "Slack rejected the bot token";
        })
      : Promise.resolve(result("slack", "Slack bot", "unconfigured", "Bot token not set; incoming webhooks can still deliver", Date.now())),
    provider("openai", "OpenAI", !!process.env.OPENAI_API_KEY,
      "https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}` } }),
    reachability("free_astrology", "Free Astrology API", true, "https://json.freeastrologyapi.com/"),
    reachability("astrology_api", "AstrologyAPI", !!process.env.ASTROLOGY_API, "https://json.astrologyapi.com/"),
    aisensyCheck(),
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
      ? probe("google_sheets", "Google Sheets", async () => {
          const { google } = await import("googleapis");
          const auth = new google.auth.GoogleAuth({ credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
          const sheets = google.sheets({ version: "v4", auth });
          const ids = Array.from(new Set([
            process.env.GOOGLE_SHEET_ABANDONED_LEADS,
            process.env.GOOGLE_SHEET_ACTIVE_SUBSCRIBERS,
          ].filter((value): value is string => !!value)));
          if (!ids.length) return { status: "unconfigured", message: "Google credentials configured but no sheet ID is set" };
          await Promise.all(ids.map((id) => sheets.spreadsheets.get({ spreadsheetId: id, fields: "spreadsheetId" }, { timeout: TIMEOUT_MS })));
          return { status: "ok", message: `Service account read ${ids.length} configured ${ids.length === 1 ? "sheet" : "sheets"}` };
        })
      : Promise.resolve(result("google_sheets", "Google Sheets", "unconfigured", "Service account credentials are not configured", Date.now())),
    result("ga4", "GA4 purchase events", process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID ? "warming" : "unconfigured",
      process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID
        ? "Configured; a read-only check cannot confirm event delivery" : "Measurement Protocol credentials are not configured", Date.now()),
    result("divine", "Divine API", process.env.DIVINE_API_KEY ? "warming" : "unconfigured",
      process.env.DIVINE_API_KEY ? "Configured; no safe read-only API probe is available" : "API key is not configured", Date.now()),
    result("razorpay", "Razorpay", process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ? "warming" : "unconfigured",
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ? "Public key configured; checkout flow is not probed" : "Public key is not configured", Date.now()),
    process.env.ASTRO_ENGINE_URL
      ? probe("astro_engine", "Astro engine", async () => {
          const status = await httpStatus(`${process.env.ASTRO_ENGINE_URL!.replace(/\/$/, "")}/health`);
          return status === 200 ? { status: "ok", message: "Astro engine health endpoint responded" }
            : { status: "down", message: `Astro engine returned HTTP ${status}` };
        })
      : Promise.resolve(result("astro_engine", "Astro engine", "unconfigured", "ASTRO_ENGINE_URL is not configured", Date.now())),
  ]);
  return [...checks, ...await metaChecks(db, now)];
}

function destinationsFromEnv(): Destination[] {
  const emails = (process.env.MONITOR_ALERT_EMAILS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const webhooks = (process.env.MONITOR_SLACK_WEBHOOK_URLS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return [
    ...emails.map((address) => ({ kind: "email" as const, address, label: address, enabled: true })),
    ...webhooks.filter(validSlackWebhook).map((address, index) => ({ kind: "slack" as const, address, label: `Environment Slack ${index + 1}`, enabled: true })),
  ];
}

export function validSlackWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname)
      && url.pathname.startsWith("/services/") && !url.username && !url.password;
  } catch { return false; }
}

export function validSlackChatId(value: string): boolean {
  return /^[CDGU][A-Z0-9]{8,20}$/.test(value);
}

async function sendAlert(db: SupabaseClient | null, runId: string | null, changed: Array<{ check: MonitorCheck; event: "issue" | "recovery" }>): Promise<number> {
  if (!changed.length) return 0;
  const { data } = db ? await db.from("monitoring_destinations").select("id,kind,label,address,enabled").eq("enabled", true) : { data: [] };
  const destinations = Array.from(new Map([...(data || []) as Destination[], ...destinationsFromEnv()]
    .map((item) => [`${item.kind}:${item.address}`, item])).values());
  if (!destinations.length) return 0;
  const { subject, slackText, emailHtml } = buildMonitoringAlert(changed);
  const deliveries = await Promise.all(destinations.map(async (destination) => {
    let delivered = false;
    let error: string | null = null;
    try {
      if (destination.kind === "email") delivered = await sendEmail({ email: destination.address }, subject, emailHtml);
      else if (destination.kind === "slack_chat") {
        if (!process.env.SLACK_BOT_TOKEN) throw new Error("Slack bot token is not configured");
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
          body: JSON.stringify({ channel: destination.address, text: slackText, link_names: true }), signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
        delivered = response.ok && body?.ok === true;
        if (!delivered) error = body?.error || `Slack returned HTTP ${response.status}`;
      } else {
        const response = await fetch(destination.address, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: slackText }), signal: AbortSignal.timeout(TIMEOUT_MS) });
        delivered = response.ok;
        if (!delivered) error = `Slack returned HTTP ${response.status}`;
      }
      if (!delivered && !error) error = "Email provider did not accept the message";
    } catch (caught) { error = caught instanceof Error && caught.message === "Slack bot token is not configured"
      ? caught.message : "Delivery request failed"; }
    return { delivered, error, destination };
  }));
  if (db) await db.from("monitoring_notifications").insert(deliveries.flatMap(({ delivered, error, destination }) =>
    changed.map(({ check, event }) => ({
      run_id: runId, check_key: check.key, event,
      destination_kind: destination.kind, destination_label: destination.label, delivered, error,
    }))));
  return deliveries.filter((item) => item.delivered).length;
}

export async function runMonitoring(db: SupabaseClient, trigger: "cron" | "manual") {
  const now = Date.now();
  const slot = trigger === "cron" ? `cron:${Math.floor(now / (30 * 60_000))}` : `manual:${randomUUID()}`;
  const { data: run, error: startError } = await db.from("monitoring_runs")
    .insert({ slot, trigger }).select("id").single();
  if (startError || !run) {
    if (startError?.code === "23505") return { skipped: true, reason: "This half-hour slot already ran" };
    await sendAlert(null, null, [{ check: result("supabase", "Supabase database", "down", "Monitoring cannot save its run", now), event: "issue" }]);
    throw new Error("Unable to start monitoring run in Supabase");
  }
  try {
    const rawChecks = await collectMonitoringChecks(db, now);
    const { data: priorRun, error: priorError } = await db.from("monitoring_runs")
      .select("started_at,checks").eq("trigger", "cron").neq("id", run.id)
      .not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (priorError) throw new Error("Unable to read previous monitoring run");
    const checks = rawChecks.map((check) => confirmProviderFailure(check, priorRun, trigger, now));
    const { data: existing, error: incidentError } = await db.from("monitoring_incidents")
      .select("check_key,active,status,opened_at,last_seen_at,last_notified_at");
    if (incidentError) throw new Error("Unable to read monitoring incidents");
    const byKey = new Map(((existing || []) as Incident[]).map((item) => [item.check_key, item]));
    const changed: Array<{ check: MonitorCheck; event: "issue" | "recovery" }> = [];
    for (const check of checks) {
      const previous = byKey.get(check.key);
      if (issue(check.status)) {
        const isNew = !previous?.active;
        if (isNew || !previous?.last_notified_at || (previous.status !== check.status && !requiresConsecutiveFailures(check.key))) changed.push({ check, event: "issue" });
        const { error } = await db.from("monitoring_incidents").upsert({
          check_key: check.key, active: true, status: check.status, message: check.message,
          opened_at: isNew ? new Date(now).toISOString() : previous.opened_at,
          last_seen_at: check.key === "brevo_send" && previous ? previous.last_seen_at : new Date(now).toISOString(), resolved_at: null,
          last_notified_at: isNew ? null : previous.last_notified_at,
        }, { onConflict: "check_key" });
        if (error) throw new Error("Unable to save monitoring incident");
      } else if (previous?.active && check.status === "ok") {
        changed.push({ check, event: "recovery" });
        const { error } = await db.from("monitoring_incidents").update({
          active: false, status: "ok", message: check.message, last_seen_at: new Date(now).toISOString(),
          resolved_at: new Date(now).toISOString(),
        }).eq("check_key", check.key);
        if (error) throw new Error("Unable to resolve monitoring incident");
      } else if (previous?.active && check.status === "unconfigured") {
        const { error } = await db.from("monitoring_incidents").update({
          active: false, status: "unconfigured", message: check.message,
          last_seen_at: new Date(now).toISOString(), resolved_at: new Date(now).toISOString(),
        }).eq("check_key", check.key);
        if (error) throw new Error("Unable to close unconfigured monitoring incident");
      }
    }
    const { error: finishError } = await db.from("monitoring_runs").update({
      finished_at: new Date().toISOString(), status: checks.some((check) => issue(check.status)) ? "issues" : "healthy",
      checks, alert_count: changed.length,
    }).eq("id", run.id);
    if (finishError) throw new Error("Unable to save monitoring results");
    const delivered = await sendAlert(db, run.id, changed);
    if (delivered > 0) await Promise.all(changed.map(({ check }) => db.from("monitoring_incidents")
      .update({ last_notified_at: new Date().toISOString() }).eq("check_key", check.key)));
    return { runId: run.id, checks, alerts: changed.length, delivered };
  } catch (error) {
    await db.from("monitoring_runs").update({ finished_at: new Date().toISOString(), status: "failed" }).eq("id", run.id);
    await sendAlert(null, null, [{
      check: result("monitoring_storage", "Monitoring storage", "down", "A monitoring run could not save its results", now),
      event: "issue",
    }]);
    throw error;
  }
}
