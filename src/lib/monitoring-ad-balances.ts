import type { SupabaseClient } from "@supabase/supabase-js";
import { META_AD_ACCOUNTS_SETTINGS_KEY, normalizeMetaAdAccountsSettings, getMetaAccountCredentialsFromSettings } from "./meta-ad-accounts";
import type { MonitorCheck } from "./system-monitoring";

export const LOW_AD_BALANCE_INR = 5000;
export const BALANCE_SLACK_MEMBER_ID = "U08C5ENV66Q";
const TOKEN_SOURCE_ACCOUNT = "1123080110423751";
const VEDIC_ACCOUNTS = ["2022187855078303", "2366717340763776"] as const;
export type AdBalance = {
  accountId: string; accountName: string; group: "AstroRekha" | "VedicRekha";
  currency?: string; remaining?: number; remainingINR?: number;
  state: "available" | "inactive" | "unavailable";
  detail: string;
};

// Meta's `balance` is an amount owed, not proof of funds available. Only the
// explicitly configured spending limit minus its spend counter is used here.
export function remainingSpendingLimit(raw: { spend_cap?: unknown; amount_spent?: unknown }): number | null {
  const minor = (value: unknown) => typeof value === "string" && /^\d+$/.test(value)
    ? Number(value) : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : NaN;
  const cap = minor(raw.spend_cap), spent = minor(raw.amount_spent);
  if (!Number.isSafeInteger(cap) || cap <= 0 || !Number.isSafeInteger(spent)) return null;
  return Math.max(0, cap - spent) / 100;
}

export function selectBalanceAccounts(settings: ReturnType<typeof normalizeMetaAdAccountsSettings>, now: number, workspaces: ReturnType<typeof normalizeMetaAdAccountsSettings>[] = []) {
  const current = new Set(getMetaAccountCredentialsFromSettings(settings, { startMillis: now, endMillis: now + 1 }).map(a => a.accountId));
  const token = settings.accounts.find(a => a.accountId === TOKEN_SOURCE_ACCOUNT)?.accessToken;
  // An account can be retired in one workspace and still active in another.
  // Prefer an active credential and show each account once in the summary.
  const byId = new Map<string, { accountId: string; accountName: string; group: "AstroRekha"; accessToken?: string; inactive: boolean }>();
  for (const source of [settings, ...workspaces]) {
    const eligible = source === settings ? current : new Set(getMetaAccountCredentialsFromSettings(source, { startMillis: now, endMillis: now + 1 }).map(a => a.accountId));
    for (const a of source.accounts) {
      if (VEDIC_ACCOUNTS.some(id => id === a.accountId)) continue;
      const candidate = {
        accountId: a.accountId, accountName: a.label || a.accountId, group: "AstroRekha" as const,
        accessToken: a.accessToken, inactive: a.active === false || (Boolean(a.accessToken) && !eligible.has(a.accountId)),
      };
      const prior = byId.get(a.accountId);
      if (!prior || (prior.inactive && !candidate.inactive) || (!prior.accessToken && !candidate.inactive && candidate.accessToken)) byId.set(a.accountId, candidate);
    }
  }
  const accounts = [...byId.values()];
  return [...accounts, ...VEDIC_ACCOUNTS.map(accountId => ({
    accountId, accountName: accountId === "2022187855078303" ? "VE | ADS 5" : "Vedicrekha 1 <> Shiprocke_BFRS", group: "VedicRekha" as const, accessToken: token, inactive: false,
  }))];
}

export function balanceCheck(balance: AdBalance, now: number): MonitorCheck {
  const low = balance.state === "available" && balance.remainingINR !== undefined && balance.remainingINR < LOW_AD_BALANCE_INR;
  return {
    key: `meta_balance:${balance.accountId}`, name: `${balance.group} · ${balance.accountName}`,
    status: balance.state === "inactive" ? "unconfigured" : balance.state !== "available" ? "warming" : low ? "warning" : "ok",
    message: balance.state !== "available" ? balance.detail : `${low ? "Low balance: " : ""}${formatBalance(balance)} remaining before the account spending limit${low ? ". Please review the account spending limit." : "."}`,
    checkedAt: new Date(now).toISOString(), latencyMs: 0, adBalance: balance,
  };
}

export async function collectAdBalanceChecks(db: SupabaseClient, now = Date.now()): Promise<MonitorCheck[]> {
  const started = Date.now();
  const { data, error } = await db.from("settings").select("value").eq("key", META_AD_ACCOUNTS_SETTINGS_KEY)
    .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error || !data) throw new Error("Unable to read ad balance account settings");
  const workspaceResults = await Promise.all(["soulmate_admin_settings", "us_soulmate_admin_settings", "us_main_admin_settings"].map(table =>
    db.from(table).select("accounts").eq("id", true).abortSignal(AbortSignal.timeout(5000)).maybeSingle()));
  if (workspaceResults.some(r => r.error)) throw new Error("Unable to read workspace ad balance accounts");
  const workspaces = workspaceResults.map(r => normalizeMetaAdAccountsSettings({ accounts: r.data?.accounts || [] }));
  const accounts = selectBalanceAccounts(normalizeMetaAdAccountsSettings(data.value), now, workspaces);
  const balances = await Promise.all(accounts.map(async (account): Promise<AdBalance> => {
    const base: AdBalance = { accountId: account.accountId, accountName: account.accountName, group: account.group, state: "unavailable", detail: "Balance could not be checked. Check Meta access." };
    if (account.inactive) return { ...base, state: "inactive", detail: "Inactive in the app — balance monitoring paused." };
    if (!account.accessToken) return { ...base, detail: "Meta access token is missing." };
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/act_${account.accountId}?fields=id,name,currency,spend_cap,amount_spent`, {
        headers: { Authorization: `Bearer ${account.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      const raw = await response.json();
      if (!response.ok || raw.error || raw.id !== `act_${account.accountId}`) return base;
      base.accountName = typeof raw.name === "string" ? raw.name.trim() : base.accountName;
      base.currency = raw.currency;
      const remaining = remainingSpendingLimit(raw);
      if (remaining === null) return { ...base, detail: "Remaining balance unavailable: no valid account spending limit was returned." };
      if (raw.currency !== "INR" && raw.currency !== "USD") return { ...base, detail: "Balance currency is not supported for the INR alert threshold." };
      return { ...base, state: "available", remaining, remainingINR: raw.currency === "INR" ? remaining : undefined, detail: "Remaining account spending limit" };
    } catch { return base; }
  }));
  if (balances.some(b => b.state === "available" && b.currency === "USD")) {
    // Never guess an exchange rate for an alert threshold.
    let rate: number | null = null;
    try {
      const r = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const raw = await r.json();
      if (r.ok && Number.isFinite(raw.rates?.INR) && raw.rates.INR > 0) rate = raw.rates.INR;
    } catch { /* Mark unavailable below without raising a false low-balance alert. */ }
    for (const b of balances.filter(b => b.state === "available" && b.currency === "USD")) {
      if (rate !== null) b.remainingINR = b.remaining! * rate;
      else { b.state = "unavailable"; b.detail = "USD balance read, but INR conversion is unavailable. Low-balance check deferred."; }
    }
  }
  return balances.map(b => ({ ...balanceCheck(b, now), latencyMs: Date.now() - started }));
}

export function formatBalance(balance: AdBalance) {
  const money = (value: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  if (balance.remaining === undefined || !balance.currency) return "Unavailable";
  const native = money(balance.remaining, balance.currency);
  return balance.currency === "INR" || balance.remainingINR === undefined ? native : `${native} (≈ ${money(balance.remainingINR, "INR")})`;
}
const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n*`]/g, " ");
const htmlEscape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function balanceAlertSections(checks: MonitorCheck[]) {
  const groups = ["AstroRekha", "VedicRekha"] as const;
  const line = (c: MonitorCheck) => `${c.adBalance!.accountName} (${c.adBalance!.accountId}): ${c.message}`;
  return {
    slack: groups.map(group => {
      const rows = checks.filter(c => c.adBalance?.group === group);
      return rows.length ? `*${group}*\n${rows.map(c => `• ${slackEscape(line(c))}`).join("\n")}` : "";
    }).filter(Boolean).join("\n\n"),
    html: groups.map(group => {
      const rows = checks.filter(c => c.adBalance?.group === group);
      return rows.length ? `<h3>${group}</h3><ul>${rows.map(c => `<li>${htmlEscape(line(c))}</li>`).join("")}</ul>` : "";
    }).join(""),
  };
}

export function buildDailyBalanceAlert(checks: MonitorCheck[], now: Date) {
  const activeChecks = checks.filter(check => check.adBalance && check.adBalance.state !== "inactive");
  const sections = balanceAlertSections(activeChecks);
  const time = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const note = "Amounts show spending limit remaining, not a prepaid wallet balance.";
  return {
    subject: "Daily ad account balances",
    slackText: `<@${BALANCE_SLACK_MEMBER_ID}> *Daily ad account balances*\n\n${sections.slack || "No active ad accounts configured."}\n\n${note}\nChecked ${time} IST`,
    emailHtml: `<h2>Daily ad account balances</h2>${sections.html || "<p>No active ad accounts configured.</p>"}<p>${note}</p><p>Checked ${time} IST</p>`,
  };
}

export function dailyBalanceSlot(now: Date) {
  const date = new Date(now.getTime() + 330 * 60_000);
  // Permit scheduler drift within the hour; never send a manual morning digest.
  if (date.getUTCHours() !== 18) return null;
  return `ad-balances:${date.toISOString().slice(0, 10)}`;
}
