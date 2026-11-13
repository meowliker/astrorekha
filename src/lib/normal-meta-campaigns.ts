import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeMetaAdAccountsSettings, getMetaAccountCredentialsFromSettings, type MetaAccountCredential, type MetaAdAccountCredentialRange } from './meta-ad-accounts';
import { listSoulmateCampaigns } from './soulmate-campaigns';

export type NormalMetaCredential = MetaAccountCredential & { campaignIds: string[] };
const otherWorkspaces = ['soulmate_admin_settings', 'us_main_admin_settings', 'us_soulmate_admin_settings'];
/** Campaign assignments are exclusive, including historical/inactive assignments. */
export function normalCampaignIds(accountId: string, campaigns: {id: string}[], assignments: {accountId: string; campaignIds?: string[]}[][]) {
  const reserved = new Set(assignments.flat().filter(a => a.accountId === accountId).flatMap(a => a.campaignIds || []));
  return [...new Set(campaigns.map(c => c.id))].filter(id => !reserved.has(id));
}
export function normalCampaignFilter(credential: NormalMetaCredential) {
  if (!credential.campaignIds.length) throw new Error('No campaigns belong to this workspace.');
  return JSON.stringify([{field: 'campaign.id', operator: 'IN', value: credential.campaignIds}]);
}
/** Resolve once for all normal-funnel readers; never fall back to whole-account spend. */
export async function scopeNormalMetaCredentials(db: SupabaseClient, credentials: MetaAccountCredential[]): Promise<NormalMetaCredential[]> {
  if (!credentials.length) return [];
  const assignments = await Promise.all(otherWorkspaces.map(async table => {
    const {data, error} = await db.from(table).select('accounts').eq('id', true).single();
    if (error || !data || !Array.isArray(data.accounts)) throw new Error('Unable to verify funnel campaign assignments. Please retry.');
    for (const account of data.accounts) if (!Array.isArray(account.campaignIds) || !account.campaignIds.every((id: unknown) => typeof id === 'string' && /^\d+$/.test(id))) throw new Error('Invalid funnel campaign assignments.');
    return data.accounts as {accountId: string; campaignIds: string[]}[];
  }));
  const scoped = await Promise.all(credentials.map(async credential => ({...credential,
    campaignIds: normalCampaignIds(credential.accountId, await listSoulmateCampaigns(credential), assignments),
  })));
  return scoped.filter(c => c.campaignIds.length > 0);
}
export async function normalMetaCredentials(db: SupabaseClient, range?: MetaAdAccountCredentialRange) {
  const {data, error} = await db.from('settings').select('value').eq('key', 'meta_ad_accounts').maybeSingle();
  if (error || !data) throw new Error('Unable to verify normal funnel ad accounts. Please retry.');
  const settings = normalizeMetaAdAccountsSettings(data.value);
  const credentials = getMetaAccountCredentialsFromSettings(settings, range);
  return scopeNormalMetaCredentials(db, credentials);
}

export async function assertNormalMetaObject(credential: NormalMetaCredential, level: 'campaign' | 'adset', id: string) {
  if (level === 'campaign' && !credential.campaignIds.includes(id)) throw new Error('Campaign unavailable in this workspace.');
  const url = new URL(`https://graph.facebook.com/v21.0/${id}`);
  url.searchParams.set('fields', level === 'campaign' ? 'id,account_id' : 'id,account_id,campaign_id');
  const response = await fetch(url, {headers: {Authorization: `Bearer ${credential.accessToken}`}, cache: 'no-store', signal: AbortSignal.timeout(20000)});
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error || data?.id !== id || String(data?.account_id) !== credential.accountId || !credential.campaignIds.includes(level === 'campaign' ? id : data?.campaign_id)) throw new Error('Campaign unavailable in this workspace.');
}
