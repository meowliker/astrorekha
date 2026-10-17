import type { MetaAdAccountSettingsRow } from "./meta-ad-accounts";
import { getMetaAccountWindowForRequest } from "./meta-ad-accounts";
import { DAY_MS, profitDay, shiftProfitDate, type SoulmateAccountSpend } from "./us-soulmate-profit";

const BASE = "https://graph.facebook.com/v21.0";
const HOUR = 3600000;
type Insight = { date_start: string; spend: string; hourly_stats_aggregated_by_advertiser_time_zone?: string };

async function metaRead(account: MetaAdAccountSettingsRow, path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/act_${account.accountId}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error();
    return data;
  } catch { throw new Error(`Meta data is unavailable for ${account.label || account.accountId}. Check its access token and ads_read permission. Saved figures have been kept.`); }
}
async function insights(account: MetaAdAccountSettingsRow, params: Record<string, string>): Promise<Insight[]> {
  const rows: Insight[] = [];
  let after = "";
  for (let page = 0; page < 100; page++) {
    const data = await metaRead(account, "/insights", { ...params, limit: "500", ...(after ? { after } : {}) });
    if (!Array.isArray(data.data)) throw new Error("Meta returned incomplete spend data.");
    rows.push(...data.data);
    if (!data.paging?.next) return rows;
    const cursor = data.paging?.cursors?.after;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  throw new Error("Meta spend could not be fully paginated. Choose a smaller range.");
}

/** Resolve advertiser-local hours with its named timezone, including historical DST. */
export function accountHourMillis(date: string, hour: number, timezone: string): number {
  const target = Date.parse(`${date}T00:00:00Z`) + hour * HOUR;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (name: string) => parts.find((p) => p.type === name)!.value;
    const represented = Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:00Z`);
    const delta = target - represented;
    if (!delta) return candidate;
    candidate += delta;
  }
  throw new Error("Meta returned an hour that cannot be mapped to its timezone.");
}
export function allocateSoulmateHour(bucketStart: number, spend: number, window: { startMillis: number; endMillis: number }, now: number) {
  const observedEnd = Math.min(bucketStart + HOUR, now);
  const start = Math.max(bucketStart, window.startMillis), end = Math.min(observedEnd, window.endMillis);
  const result = new Map<string, number>();
  if (start >= end || observedEnd <= bucketStart) return result;
  for (let at = start; at < end;) {
    const day = profitDay(at);
    const boundary = Date.parse(`${shiftProfitDate(day, 1)}T06:00:00Z`);
    const until = Math.min(end, boundary);
    result.set(day, (result.get(day) || 0) + spend * (until - at) / (observedEnd - bucketStart));
    at = until;
  }
  return result;
}
export async function fetchSoulmateMetaSpend(accounts: MetaAdAccountSettingsRow[], start: string, end: string, rate: number, now = Date.now()): Promise<SoulmateAccountSpend[]> {
  const result: SoulmateAccountSpend[] = [];
  // Bounded sequential accounts prevent a burst against Meta's account rate limits.
  for (const account of accounts) {
    const window = getMetaAccountWindowForRequest(account, start, end);
    if (!window) continue;
    if (!account.accessToken) throw new Error(`Missing Meta access for ${account.label || account.accountId}.`);
    const params = { fields: "date_start,spend", time_increment: "1", time_range: JSON.stringify({ since: shiftProfitDate(start, -1), until: shiftProfitDate(end, 1) }) };
    const [info, daily, hourly] = await Promise.all([
      metaRead(account, "", { fields: "name,currency,timezone_name,balance,amount_spent,spend_cap" }),
      insights(account, params),
      insights(account, { ...params, breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" }),
    ]);
    const currency = String(info.currency || "");
    if (currency !== "USD" || !info.timezone_name) throw new Error(`Unsupported currency or missing timezone for ${account.label || account.accountId}.`);
    const spend = new Map<string, number>();
    const applied = new Set<string>();
    const add = (day: string, amount: number) => { if (day >= start && day <= end) spend.set(day, (spend.get(day) || 0) + amount); };
    const amountOf = (row: Insight) => {
      const amount = Number(row.spend);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Meta returned an invalid spend amount.");
      return amount;
    };
    for (const row of daily) {
      const at = accountHourMillis(row.date_start, 0, info.timezone_name);
      const day = profitDay(at);
      if (at === Date.parse(`${day}T06:00:00Z`) && window.startMillis <= at && window.endMillis >= at + DAY_MS) {
        add(day, amountOf(row)); applied.add(row.date_start);
      }
    }
    for (const row of daily) {
      if (!applied.has(row.date_start) && amountOf(row) > 0 && !hourly.some((h) => h.date_start === row.date_start)) throw new Error(`Hourly spend is missing for ${account.label || account.accountId}. Saved figures have been kept.`);
    }
    for (const row of hourly) {
      if (applied.has(row.date_start)) continue;
      const hour = Number(row.hourly_stats_aggregated_by_advertiser_time_zone?.match(/^(\d{2}):/)?.[1]);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Meta returned an invalid hourly bucket.");
      const bucket = accountHourMillis(row.date_start, hour, info.timezone_name);
      for (const [day, amount] of allocateSoulmateHour(bucket, amountOf(row), window, now)) add(day, amount);
    }
    const rawBalance = account.balanceMode === "remaining_spend_limit"
      ? (info.spend_cap === undefined || info.amount_spent === undefined ? NaN : Math.max(0, Number(info.spend_cap) - Number(info.amount_spent)))
      : info.balance === undefined ? NaN : -Math.abs(Number(info.balance));
    const balance = Number.isFinite(rawBalance) ? Math.round(currency === "USD" ? rawBalance : rawBalance / rate) : null;
    for (let date = start; date <= end; date = shiftProfitDate(date, 1)) {
      if (!getMetaAccountWindowForRequest(account, date, date)) continue;
      const nativeSpend = spend.get(date) || 0;
      const current = date === profitDay(now) && now >= window.startMillis && now < window.endMillis;
      result.push({ date, accountId: account.accountId, label: account.label || info.name || account.accountId, currency,
        nativeSpend, adsUsd: Math.round((currency === "USD" ? nativeSpend : nativeSpend / rate) * 100),
        adsInr: Math.round((currency === "USD" ? nativeSpend : nativeSpend * rate) * 100),
        adGst: 0,
        balance: current ? balance : null, balanceCapturedAt: current && balance !== null ? new Date(now).toISOString() : null });
    }
  }
  return result;
}
