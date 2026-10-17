import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetaAdAccountIdsFromEnv, type MetaAdAccountSettingsRow } from "./meta-ad-accounts";
export async function assertUSAdAccountIsolation(db: SupabaseClient, accounts: MetaAdAccountSettingsRow[]) {
  if (!accounts.length) return;
  const [main, india] = await Promise.all([
    db.from("settings").select("value").eq("key", "meta_ad_accounts").maybeSingle(),
    db.from("soulmate_admin_settings").select("accounts").eq("id", true).single(),
  ]);
  if (main.error || india.error) throw new Error("Unable to verify US ad-account isolation.");
  const blocked = new Set(getMetaAdAccountIdsFromEnv());
  for (const account of [...(main.data?.value?.accounts || []), ...(india.data?.accounts || [])]) blocked.add(String(account.accountId || "").replace(/^act_/i, ""));
  if (accounts.some((account) => blocked.has(account.accountId))) throw new Error("Use dedicated US ad accounts that are not connected to the normal or India Soulmate workspace.");
}
