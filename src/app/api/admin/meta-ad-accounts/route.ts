import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  META_AD_ACCOUNTS_SETTINGS_KEY,
  getMetaAccountCredentialsFromEnv,
  loadMetaAdAccountsSettings,
  mergeMetaAdAccountsForSave,
  redactMetaAdAccountsSettings,
} from "@/lib/meta-ad-accounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return NextResponse.json(body, { ...init, headers });
}

function isGeneratedMetaAccountLabel(label: string | undefined, index: number): boolean {
  const normalized = String(label || "").trim();
  return !normalized || normalized === `Meta Account ${index + 1}` || /^Meta Account \d+$/i.test(normalized);
}

async function fetchMetaAdAccountMeta(
  accountId: string,
  accessToken: string | undefined
): Promise<{ name: string | null; currency: string | null; timezone: string | null }> {
  if (!accountId || !accessToken) {
    return { name: null, currency: null, timezone: null };
  }

  try {
    const response = await fetch(
      `${META_BASE_URL}/act_${accountId}?fields=name,currency,timezone_name&access_token=${encodeURIComponent(accessToken)}`,
      { cache: "no-store" }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      console.warn(`Failed to fetch Meta ad account name for act_${accountId}:`, payload?.error || response.status);
      return { name: null, currency: null, timezone: null };
    }
    const name = String(payload?.name || "").trim();
    const currency = String(payload?.currency || "").trim().toUpperCase();
    const timezone = String(payload?.timezone_name || "").trim();
    return {
      name: name || null,
      currency: currency || null,
      timezone: timezone || null,
    };
  } catch (error) {
    console.warn(`Failed to fetch Meta ad account name for act_${accountId}:`, error);
    return { name: null, currency: null, timezone: null };
  }
}

async function enrichMetaAccountLabels<T extends { accountId: string; accessToken?: string; label?: string }>(
  accounts: T[]
): Promise<Array<T & { accountName?: string; accountCurrency?: string; accountTimezone?: string }>> {
  return Promise.all(
    accounts.map(async (account, index) => {
      const accountMeta = await fetchMetaAdAccountMeta(account.accountId, account.accessToken);
      const accountName = accountMeta.name;
      return {
        ...account,
        label: accountName && isGeneratedMetaAccountLabel(account.label, index) ? accountName : account.label,
        accountName: accountName || account.label || undefined,
        accountCurrency: accountMeta.currency || undefined,
        accountTimezone: accountMeta.timezone || undefined,
      };
    })
  );
}

async function assertAdminSession(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return { supabase, error: jsonNoStore({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: sessionData } = await supabase
    .from("admin_sessions")
    .select("id, expires_at")
    .eq("id", token)
    .single();

  if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
    return { supabase, error: jsonNoStore({ error: "Session expired" }, { status: 401 }) };
  }

  return { supabase, error: null };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, error } = await assertAdminSession(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const includeAccessTokens = searchParams.get("includeAccessTokens") === "true";
    const config = await loadMetaAdAccountsSettings(supabase);
    const configWithAvailableTokens = mergeMetaAdAccountsForSave(config, config);
    const enrichedConfig = {
      accounts: await enrichMetaAccountLabels(configWithAvailableTokens.accounts),
    };
    const envAccounts = await enrichMetaAccountLabels(
      getMetaAccountCredentialsFromEnv().map((account, index) => ({
        accountId: account.accountId,
        accessToken: account.accessToken,
        label: `Meta Account ${index + 1}`,
        startDate: "",
        startTime: "00:00",
        endDate: "",
        endTime: "23:59",
        active: index === 0,
        hasAccessToken: Boolean(account.accessToken),
        accessTokenPreview: account.accessToken ? `...${account.accessToken.slice(-4)}` : undefined,
      }))
    );

    return jsonNoStore({
      success: true,
      config: includeAccessTokens ? enrichedConfig : redactMetaAdAccountsSettings(enrichedConfig),
      envAccounts: envAccounts.map((account) => ({
        ...account,
        ...(!includeAccessTokens ? { accessToken: undefined } : {}),
      })),
    });
  } catch (error: any) {
    console.error("meta-ad-accounts GET error:", error);
    return jsonNoStore(
      { success: false, error: error?.message || "Failed to load Meta ad accounts" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, error } = await assertAdminSession(request);
    if (error) return error;

    const body = await request.json();
    const existing = await loadMetaAdAccountsSettings(supabase);
    const config = mergeMetaAdAccountsForSave(body?.config ?? body, existing);
    const enrichedConfig = {
      accounts: await enrichMetaAccountLabels(config.accounts),
    };

    const { error: saveError } = await supabase.from("settings").upsert(
      {
        key: META_AD_ACCOUNTS_SETTINGS_KEY,
        value: enrichedConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (saveError) {
      console.error("meta-ad-accounts save error:", saveError);
      return jsonNoStore(
        { success: false, error: "Failed to save Meta ad accounts" },
        { status: 500 }
      );
    }

    return jsonNoStore({
      success: true,
      config: redactMetaAdAccountsSettings(enrichedConfig),
    });
  } catch (error: any) {
    console.error("meta-ad-accounts PUT error:", error);
    return jsonNoStore(
      { success: false, error: error?.message || "Failed to update Meta ad accounts" },
      { status: 500 }
    );
  }
}
