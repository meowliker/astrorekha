import type { SupabaseClient } from "@supabase/supabase-js";

export const META_AD_ACCOUNTS_SETTINGS_KEY = "meta_ad_accounts";

export function normalizeMetaAdAccountId(value: string | null | undefined): string {
  return String(value || "").replace(/^act_/i, "").trim();
}

export function getMetaAdAccountIdsFromEnv(): string[] {
  const combined = process.env.META_AD_ACCOUNT_IDS || process.env.META_AD_ACCOUNT_ID || "";
  if (!combined.trim()) return [];

  const parsed = combined
    .split(",")
    .map((part) => normalizeMetaAdAccountId(part))
    .filter(Boolean);

  return Array.from(new Set(parsed));
}

export interface MetaAccountCredential {
  accountId: string;
  accessToken: string;
  label?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  active?: boolean;
}

export interface MetaAdAccountSettingsRow {
  accountId: string;
  accessToken?: string;
  label?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  active?: boolean;
}

export interface MetaAdAccountsSettings {
  accounts: MetaAdAccountSettingsRow[];
}

export interface MetaAdAccountCredentialRange {
  startDate?: string;
  endDate?: string;
  startMillis?: number;
  endMillis?: number;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseJsonish(value: string): unknown {
  const trimmed = stripWrappingQuotes(value);
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    if (!trimmed.includes('\\"')) {
      throw error;
    }
    return JSON.parse(trimmed.replace(/\\"/g, '"')) as unknown;
  }
}

function parseTokenMapping(raw: string): Map<string, string> {
  const mapping = new Map<string, string>();
  const trimmed = raw.trim();
  if (!trimmed) return mapping;

  if (stripWrappingQuotes(trimmed).startsWith("{")) {
    try {
      const parsed = parseJsonish(trimmed) as Record<string, unknown>;
      Object.entries(parsed).forEach(([key, value]) => {
        const accountId = normalizeMetaAdAccountId(key);
        const token = stripWrappingQuotes(String(value || ""));
        if (accountId && token) {
          mapping.set(accountId, token);
        }
      });
      return mapping;
    } catch {
      // fall through to line-based parsing
    }
  }

  trimmed
    .split(/\n|,/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const delimiterIndex = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (delimiterIndex <= 0) return;
      const key = line.slice(0, delimiterIndex).trim();
      const value = line.slice(delimiterIndex + 1).trim();
      const accountId = normalizeMetaAdAccountId(key);
      const token = stripWrappingQuotes(value);
      if (accountId && token) {
        mapping.set(accountId, token);
      }
    });

  return mapping;
}

function normalizeIsoDate(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function normalizeTime(value: unknown): string | undefined {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "active", "current"].includes(text)) return true;
  if (["false", "0", "no", "inactive", "historical"].includes(text)) return false;
  return undefined;
}

function normalizeMetaAdAccountRow(row: unknown): MetaAdAccountSettingsRow | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const accountId = normalizeMetaAdAccountId(String(value.accountId || value.account_id || value.id || ""));
  if (!accountId) return null;

  const active = parseBoolean(value.active);
  const accessToken = stripWrappingQuotes(String(value.accessToken || value.access_token || ""));
  const startDate =
    normalizeIsoDate(value.startDate) ||
    normalizeIsoDate(value.start_date) ||
    normalizeIsoDate(value.startedAt) ||
    normalizeIsoDate(value.started_at);
  const startTime =
    normalizeTime(value.startTime) ||
    normalizeTime(value.start_time) ||
    normalizeTime(value.startedTime) ||
    normalizeTime(value.started_time);
  const endDate =
    active === true
      ? undefined
      : normalizeIsoDate(value.endDate) ||
        normalizeIsoDate(value.end_date) ||
        normalizeIsoDate(value.endedAt) ||
        normalizeIsoDate(value.ended_at);
  const endTime =
    active === true
      ? undefined
      : normalizeTime(value.endTime) ||
        normalizeTime(value.end_time) ||
        normalizeTime(value.endedTime) ||
        normalizeTime(value.ended_time);

  return {
    accountId,
    accessToken: accessToken || undefined,
    label: String(value.label || value.name || "").trim() || undefined,
    startDate,
    startTime,
    endDate,
    endTime,
    active,
  };
}

export function normalizeMetaAdAccountsSettings(value: unknown): MetaAdAccountsSettings {
  const rawAccounts =
    value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).accounts)
      ? ((value as Record<string, unknown>).accounts as unknown[])
      : Array.isArray(value)
      ? value
      : [];

  const accounts = rawAccounts
    .map(normalizeMetaAdAccountRow)
    .filter((row): row is MetaAdAccountSettingsRow => Boolean(row && row.accountId));

  return { accounts };
}

export function redactMetaAdAccountsSettings(config: MetaAdAccountsSettings): {
  accounts: Array<Omit<MetaAdAccountSettingsRow, "accessToken"> & {
    hasAccessToken: boolean;
    accessTokenPreview?: string;
  }>;
} {
  const envTokens = new Map(
    getMetaAccountCredentialsFromEnv()
      .filter((account) => account.accountId && account.accessToken)
      .map((account) => [account.accountId, account.accessToken])
  );

  return {
    accounts: config.accounts.map(({ accessToken, ...account }) => {
      const resolvedToken = accessToken || envTokens.get(account.accountId);
      return {
        ...account,
        hasAccessToken: Boolean(resolvedToken),
        accessTokenPreview: resolvedToken ? `...${resolvedToken.slice(-4)}` : undefined,
      };
    }),
  };
}

export function mergeMetaAdAccountsForSave(
  incoming: unknown,
  existing: MetaAdAccountsSettings = { accounts: [] }
): MetaAdAccountsSettings {
  const existingTokens = new Map(
    existing.accounts
      .filter((account) => account.accountId && account.accessToken)
      .map((account) => [account.accountId, account.accessToken as string])
  );
  const envTokens = new Map(
    getMetaAccountCredentialsFromEnv()
      .filter((account) => account.accountId && account.accessToken)
      .map((account) => [account.accountId, account.accessToken])
  );

  const normalized = normalizeMetaAdAccountsSettings(incoming);
  const seen = new Set<string>();
  const accounts = normalized.accounts
    .map((account) => ({
      ...account,
      accessToken: account.accessToken || existingTokens.get(account.accountId) || envTokens.get(account.accountId),
      endDate: account.active ? undefined : account.endDate,
      endTime: account.active ? undefined : account.endTime,
    }))
    .filter((account) => {
      if (!account.accountId || seen.has(account.accountId)) return false;
      seen.add(account.accountId);
      return true;
    });

  return { accounts };
}

function parseTimeParts(time: string | undefined, fallback: string): { hour: number; minute: number } {
  const normalized = normalizeTime(time) || fallback;
  const [hour, minute] = normalized.split(":").map(Number);
  return { hour, minute };
}

function istBoundaryMillis(date: string, time: string | undefined, boundary: "start" | "end"): number | null {
  const isoDate = normalizeIsoDate(date);
  if (!isoDate) return null;
  const { hour, minute } = parseTimeParts(time, boundary === "start" ? "00:00" : "23:59");
  const millis = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`).getTime();
  if (!Number.isFinite(millis)) return null;
  return boundary === "end" && hour === 23 && minute === 59 ? millis + 60 * 1000 : millis;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

function requestBusinessWindowMillis(startDate: string, endDate: string): { startMillis: number; endMillis: number } | null {
  const startIsoDate = normalizeIsoDate(startDate);
  const endIsoDate = normalizeIsoDate(endDate);
  if (!startIsoDate || !endIsoDate) return null;

  const startMillis = new Date(`${startIsoDate}T11:30:00+05:30`).getTime();
  const endMillis = new Date(`${shiftIsoDate(endIsoDate, 1)}T11:30:00+05:30`).getTime();
  if (!Number.isFinite(startMillis) || !Number.isFinite(endMillis)) return null;
  return { startMillis, endMillis };
}

function requestWindowMillis(range?: MetaAdAccountCredentialRange): { startMillis: number; endMillis: number } | null {
  if (Number.isFinite(range?.startMillis) && Number.isFinite(range?.endMillis)) {
    return {
      startMillis: range?.startMillis as number,
      endMillis: range?.endMillis as number,
    };
  }

  const requestedStart = range?.startDate || range?.endDate;
  const requestedEnd = range?.endDate || range?.startDate;
  if (!requestedStart || !requestedEnd) return null;
  return requestBusinessWindowMillis(requestedStart, requestedEnd);
}

function getIstDateParts(millis: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(millis));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function getAccountWindowMillis(
  account: Pick<MetaAccountCredential, "startDate" | "startTime" | "endDate" | "endTime">,
  range: MetaAdAccountCredentialRange
): { startMillis: number; endMillis: number } | null {
  const requestWindow = requestWindowMillis(range);
  if (!requestWindow) return null;

  const accountStartMillis = account.startDate
    ? istBoundaryMillis(account.startDate, account.startTime, "start")
    : requestWindow.startMillis;
  const accountEndMillis = account.endDate
    ? istBoundaryMillis(account.endDate, account.endTime, "end")
    : requestWindow.endMillis;
  if (accountStartMillis === null || accountEndMillis === null) return null;

  const startMillis = Math.max(requestWindow.startMillis, accountStartMillis);
  const endMillis = Math.min(requestWindow.endMillis, accountEndMillis);
  if (startMillis >= endMillis) return null;
  return { startMillis, endMillis };
}

function overlapsDateRange(
  account: Pick<MetaAccountCredential, "startDate" | "startTime" | "endDate" | "endTime">,
  range?: MetaAdAccountCredentialRange
): boolean {
  if (!range?.startDate && !range?.endDate && !Number.isFinite(range?.startMillis) && !Number.isFinite(range?.endMillis)) {
    return true;
  }
  return getAccountWindowMillis(account, range ?? {}) !== null;
}

export function getMetaAccountDateRangeForRequest(
  account: Pick<MetaAccountCredential, "startDate" | "startTime" | "endDate" | "endTime">,
  startDate: string,
  endDate: string
): { startDate: string; endDate: string } | null {
  const window = getMetaAccountWindowForRequest(account, startDate, endDate);
  if (!window) return null;
  return { startDate: window.startDate, endDate: window.endDate };
}

export function getMetaAccountWindowForRequest(
  account: Pick<MetaAccountCredential, "startDate" | "startTime" | "endDate" | "endTime">,
  startDate: string,
  endDate: string
): { startDate: string; endDate: string; startTime: string; endTime: string; startMillis: number; endMillis: number } | null {
  const window = getAccountWindowMillis(account, { startDate, endDate });
  if (!window) return null;
  const startParts = getIstDateParts(window.startMillis);
  const endParts = getIstDateParts(window.endMillis - 1);
  return {
    startDate: startParts.date,
    endDate: endParts.date,
    startTime: startParts.time,
    endTime: endParts.time,
    startMillis: window.startMillis,
    endMillis: window.endMillis,
  };
}

export function getMetaAccountCredentialsFromEnv(range?: {
  startDate?: string;
  endDate?: string;
  startMillis?: number;
  endMillis?: number;
}): MetaAccountCredential[] {
  const accountIdsFromEnv = getMetaAdAccountIdsFromEnv();
  const sharedToken = stripWrappingQuotes(process.env.META_ACCESS_TOKEN || "");
  const mappingRaw =
    process.env.META_ACCESS_TOKENS_BY_ACCOUNT ||
    process.env.META_ACCESS_TOKEN_BY_ACCOUNT ||
    "";
  const tokenMapping = parseTokenMapping(mappingRaw);

  const accountIds = accountIdsFromEnv.length > 0 ? accountIdsFromEnv : Array.from(tokenMapping.keys());
  if (accountIds.length === 0) return [];

  const creds: MetaAccountCredential[] = [];
  accountIds.forEach((accountId) => {
    const token = tokenMapping.get(accountId) || sharedToken;
    if (!token) return;
    if (!overlapsDateRange({}, range)) return;
    creds.push({ accountId, accessToken: token });
  });

  return creds;
}

export function getMetaAccountCredentialsFromSettings(
  config: MetaAdAccountsSettings,
  range?: MetaAdAccountCredentialRange
): MetaAccountCredential[] {
  return config.accounts
    .filter((account) => Boolean(account.accountId && account.accessToken))
    .filter((account) => overlapsDateRange(account, range))
    .map((account) => ({
      accountId: account.accountId,
      accessToken: account.accessToken as string,
      label: account.label,
      startDate: account.startDate,
      startTime: account.startTime,
      endDate: account.endDate,
      endTime: account.endTime,
      active: account.active,
    }));
}

export async function loadMetaAdAccountsSettings(supabase: SupabaseClient): Promise<MetaAdAccountsSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("key,value,updated_at")
    .eq("key", META_AD_ACCOUNTS_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error("Failed to load Meta ad account settings:", error);
    return { accounts: [] };
  }

  return normalizeMetaAdAccountsSettings(data?.value);
}

export async function getMetaAccountCredentialsForRange(
  supabase: SupabaseClient,
  range?: MetaAdAccountCredentialRange
): Promise<MetaAccountCredential[]> {
  const settings = await loadMetaAdAccountsSettings(supabase);
  return getMetaAccountCredentialsFromSettings(settings, range);
}
