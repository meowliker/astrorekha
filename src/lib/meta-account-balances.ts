import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMetaAccountCredentialsFromSettings,
  getMetaAccountWindowForRequest,
  loadMetaAdAccountsSettings,
} from "@/lib/meta-ad-accounts";
import type { AccountBalanceBreakdown, AccountBalanceSummary } from "@/lib/profit-sheet-types";

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
export type BalanceDayMode = "business_1130_ist" | "calendar_ist";
const BUSINESS_DAY_MODE: BalanceDayMode = "business_1130_ist";

export function accountBalanceTable(mode: BalanceDayMode) {
  return mode === "calendar_ist" ? "profit_sheet_calendar" : "profit_sheet";
}

function parseMetaMinorUnits(rawValue: unknown, field: string, accountName: string): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Meta returned an invalid ${field} for ${accountName}.`);
  }
  return value;
}

function getIstDateParts(date: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function getAccountBalanceCaptureDate(now: Date = new Date()): string {
  return getIstDateParts(now).date;
}

export function getAccountBalanceCaptureMode(now: Date = new Date()): BalanceDayMode | null {
  const { hour, minute } = getIstDateParts(now);
  if (hour === 0 && minute <= 4) return "calendar_ist";
  if (hour === 11 && minute >= 30 && minute <= 34) return BUSINESS_DAY_MODE;
  return null;
}

export function isAccountBalanceCaptureWindow(now: Date = new Date()): boolean {
  return getAccountBalanceCaptureMode(now) !== null;
}

export async function resolveAccountBalanceExchangeRate(
  supabase: SupabaseClient,
  date: string,
  dayMode: BalanceDayMode = BUSINESS_DAY_MODE
): Promise<number> {
  try {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null);
    const liveRate = Number(payload?.rates?.INR);
    if (response.ok && Number.isFinite(liveRate) && liveRate > 0) return liveRate;
  } catch (error) {
    console.warn("Live USD to INR rate unavailable for account balance snapshot:", error);
  }

  const { data } = await supabase
    .from(accountBalanceTable(dayMode))
    .select("exchange_rate")
    .lte("date", date)
    .gt("exchange_rate", 0)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const savedRate = Number(data?.exchange_rate);
  return Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 96;
}

export async function fetchMetaAccountBalanceSnapshot(
  supabase: SupabaseClient,
  date: string,
  exchangeRate: number,
  now: Date = new Date(),
  dayMode: BalanceDayMode = BUSINESS_DAY_MODE
): Promise<AccountBalanceSummary> {
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("A valid USD to INR rate is required to calculate account balances.");
  }

  const settings = await loadMetaAdAccountsSettings(supabase);
  const nowMillis = now.getTime();
  const range = { startMillis: nowMillis, endMillis: nowMillis + 60_000 };
  const currentAccounts = settings.accounts.filter((account) =>
    getMetaAccountWindowForRequest(account, date, date, dayMode)
  );
  const missingToken = currentAccounts.find((account) => !account.accessToken);
  if (missingToken) {
    throw new Error(`Meta access is missing for ${missingToken.label || missingToken.accountId}. Update it in Ad Accounts.`);
  }

  const credentials = getMetaAccountCredentialsFromSettings(settings, range);
  const accounts = await Promise.all(credentials.map(async (credential): Promise<AccountBalanceBreakdown> => {
    const accountUrl = new URL(`${META_BASE_URL}/act_${credential.accountId}`);
    accountUrl.searchParams.set("fields", "id,name,currency,balance,amount_spent,spend_cap");
    accountUrl.searchParams.set("access_token", credential.accessToken);
    const response = await fetch(accountUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const accountData = await response.json().catch(() => null);
    const accountName = credential.label || String(accountData?.name || credential.accountId);

    if (!response.ok || accountData?.error) {
      throw new Error(`Unable to fetch the scheduled balance for ${accountName}. Check its Meta access and try again.`);
    }

    const currency = String(accountData?.currency || "").toUpperCase();
    if (currency !== "USD" && currency !== "INR") {
      throw new Error(`Currency conversion for ${currency || "this account"} is unavailable for ${accountName}.`);
    }

    const balanceMode = credential.balanceMode || "outstanding";
    const balanceMinorUnits = balanceMode === "remaining_spend_limit"
      ? Math.max(
          0,
          parseMetaMinorUnits(accountData?.spend_cap, "spending limit", accountName) -
            parseMetaMinorUnits(accountData?.amount_spent, "amount spent", accountName)
        )
      : parseMetaMinorUnits(accountData?.balance, "outstanding balance", accountName);
    // Remaining prepaid funds are an asset; outstanding postpaid charges are a liability.
    // Store the sign here so every daily snapshot and its total use the same accounting rule.
    const balance = (balanceMode === "outstanding" ? -Math.abs(balanceMinorUnits) : Math.abs(balanceMinorUnits)) / 100;
    const usd = currency === "USD" ? balance : balance / exchangeRate;
    const inr = currency === "INR" ? balance : balance * exchangeRate;

    return {
      accountId: credential.accountId,
      accountName,
      currency,
      balanceMode,
      balance,
      usd,
      inr,
    };
  }));

  const totals = accounts.reduce(
    (sum, account) => ({ usd: sum.usd + account.usd, inr: sum.inr + account.inr }),
    { usd: 0, inr: 0 }
  );

  return {
    date,
    dayMode,
    accounts: accounts.sort((a, b) => b.usd - a.usd),
    totalUSD: totals.usd,
    totalINR: totals.inr,
    exchangeRate,
    fetchedAt: now.toISOString(),
  };
}

export async function captureMetaAccountBalanceSnapshot(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ status: "captured" | "already_captured"; date: string; dayMode: BalanceDayMode; snapshot?: AccountBalanceSummary }> {
  const dayMode = getAccountBalanceCaptureMode(now);
  if (!dayMode) throw new Error("Account balances can only be captured at midnight or 11:30 AM IST (within five minutes).");
  const date = getAccountBalanceCaptureDate(now);
  const { data: existing, error: existingError } = await supabase
    .from(accountBalanceTable(dayMode))
    .select("date,account_balance_captured_at")
    .eq("date", date)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message || "Unable to check the saved account balance snapshot.");
  if (existing?.account_balance_captured_at) return { status: "already_captured", date, dayMode };

  const exchangeRate = await resolveAccountBalanceExchangeRate(supabase, date, dayMode);
  const snapshot = await fetchMetaAccountBalanceSnapshot(supabase, date, exchangeRate, now, dayMode);
  const payload = {
    account_balance_usd: snapshot.totalUSD,
    account_balance_inr: snapshot.totalINR,
    account_balance_exchange_rate: snapshot.exchangeRate,
    account_balance_breakdown: snapshot.accounts,
    account_balance_captured_at: snapshot.fetchedAt,
    updated_at: snapshot.fetchedAt,
  };

  if (existing) {
    const { data: saved, error } = await supabase
      .from(accountBalanceTable(dayMode))
      .update(payload)
      .eq("date", date)
      .is("account_balance_captured_at", null)
      .select("date");
    if (error) throw new Error(error.message || "Unable to save the account balance snapshot.");
    if (!saved?.length) return { status: "already_captured", date, dayMode };
  } else {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
      .format(new Date(`${date}T12:00:00Z`));
    const { error } = await supabase.from(accountBalanceTable(dayMode)).insert({
      date,
      day: weekday,
      exchange_rate: exchangeRate,
      source: "meta_balance_snapshot",
      synced_at: snapshot.fetchedAt,
      ...payload,
    });
    if (error?.code === "23505") {
      const { data: saved, error: saveError } = await supabase
        .from(accountBalanceTable(dayMode))
        .update(payload)
        .eq("date", date)
        .is("account_balance_captured_at", null)
        .select("date");
      if (saveError) throw new Error(saveError.message || "Unable to save the account balance snapshot.");
      if (!saved?.length) return { status: "already_captured", date, dayMode };
    } else if (error) {
      throw new Error(error.message || "Unable to create the account balance snapshot row.");
    }
  }

  return { status: "captured", date, dayMode, snapshot };
}
