import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { normalizeMetaAdAccountsSettings, getMetaAccountWindowForRequest, type MetaAdAccountsSettings } from './meta-ad-accounts';
import { balanceSchedule, type BalanceAccount, type BalanceFunnel, type BalanceReading, type BalanceHistory, type BalancesView } from './account-balances-types';
import { balanceStore, localBalancePreview } from './account-balances-store';
import { eligibleBalanceAddition } from './account-balance-alerts';

type Account = BalanceAccount & { accessToken?: string };
export const EXCLUDED_BALANCE_ACCOUNTS = new Set(['2022187855078303', '2366717340763776']);
export function selectActiveBalanceAccounts(sources: { funnel: BalanceFunnel; settings: MetaAdAccountsSettings }[], now: Date): Account[] {
  const date = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const accounts = new Map<string, Account>();
  for (const { funnel, settings } of sources) for (const a of settings.accounts) {
    if (EXCLUDED_BALANCE_ACCOUNTS.has(a.accountId)) continue;
    const window = getMetaAccountWindowForRequest(a, date, date, 'calendar_ist');
    if (a.active === false || !window || now.getTime() < window.startMillis || now.getTime() >= window.endMillis) continue;
    const old = accounts.get(a.accountId);
    accounts.set(a.accountId, { accountId: a.accountId, accountName: a.label || old?.accountName || a.accountId,
      accessToken: old?.accessToken || a.accessToken, funnels: [...new Set([...(old?.funnels || []), funnel])] });
  }
  return [...accounts.values()];
}
async function loadAccounts(db: SupabaseClient, now = new Date()) {
  const results = await Promise.all([
    db.from('settings').select('value').eq('key', 'meta_ad_accounts').maybeSingle(),
    ...['soulmate_admin_settings', 'us_main_admin_settings', 'us_soulmate_admin_settings'].map(table => db.from(table).select('accounts').eq('id', true).maybeSingle()),
  ]);
  if (results.some(r => r.error)) throw new Error('Could not load active ad accounts');
  return selectActiveBalanceAccounts(results.map((r, i) => ({ funnel: ['AstroRekha', 'Soulmate', 'US AstroRekha', 'US Soulmate'][i] as BalanceFunnel,
    settings: normalizeMetaAdAccountsSettings(r.data && 'value' in r.data ? r.data.value : r.data) })), now);
}
const publicAccount = ({ accountId, accountName, funnels }: Account): BalanceAccount => ({ accountId, accountName, funnels });
const minor = (n: unknown): number | null => ((typeof n === 'string' && /^\d+$/.test(n)) || (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) && Number.isSafeInteger(Number(n)) ? Number(n) / 100 : null;

export function parseBalance(raw: Record<string, unknown>, account: BalanceAccount, source: BalanceReading['source'], at: string): BalanceReading {
  const base = { ...account, source, at };
  if (raw.id !== `act_${account.accountId}` || (raw.currency !== 'USD' && raw.currency !== 'INR')) return { ...base, status: 'error', error: 'Could not verify the account or its currency.' };
  const spent = minor(raw.amount_spent), cap = minor(raw.spend_cap), outstanding = minor(raw.balance);
  if (spent === null || cap === null || outstanding === null) return { ...base, status: 'error', error: 'Meta returned an incomplete balance.' };
  return { ...base, status: 'ok', currency: raw.currency, remaining: cap > 0 ? Math.max(0, Math.round((cap - spent) * 100) / 100) : null,
    outstanding, spendCap: cap, spent };
}
async function meta(account: Account, edge: string, params: Record<string, string>, signal?: AbortSignal) {
  if (!account.accessToken) throw new Error('No Meta access token');
  const url = new URL(`https://graph.facebook.com/v21.0/act_${account.accountId}${edge}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` }, cache: 'no-store', signal: signal || AbortSignal.timeout(10_000) });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error('Meta data unavailable');
  return data;
}
export function parseLimitActivity(raw: Record<string, unknown>, account: BalanceAccount): BalanceHistory | null {
  if (raw.object_id !== account.accountId || raw.event_type !== 'ad_account_update_spend_limit' || typeof raw.event_time !== 'string' || !Number.isFinite(Date.parse(raw.event_time))) return null;
  try {
    const extra = typeof raw.extra_data === 'string' ? JSON.parse(raw.extra_data) : raw.extra_data;
    if (!extra || extra.type !== 'payment_amount' || !['USD', 'INR'].includes(extra.currency)) return null;
    const before = minor(extra.old_value), after = minor(extra.new_value);
    if (before === null || after === null || before === after) return null;
    const at = new Date(raw.event_time).toISOString();
    return { id: createHash('sha256').update(`meta:${account.accountId}:${at}:${before}:${after}:${extra.currency}`).digest('hex'),
      accountId: account.accountId, accountName: account.accountName, at, kind: 'limit_change', currency: extra.currency,
      amount: Math.round((after - before) * 100) / 100, before, after, reference: 'Meta spending-limit activity' };
  } catch { return null; }
}
async function historyFor(account: Account, now: Date, days = 90) {
  const history: BalanceHistory[] = [];
  const signal = AbortSignal.timeout(25_000);
  let after = '';
  // Bounded history import. We explicitly disclose the window and any incomplete scan.
  for (let page = 0; page < 8; page++) {
    const data = await meta(account, '/activities', { category: 'BUDGET', fields: 'event_time,event_type,object_id,extra_data',
      since: String(Math.floor(now.getTime() / 1000) - days * 86400), until: String(Math.floor(now.getTime() / 1000)), limit: '100', ...(after ? { after } : {}) }, signal);
    for (const raw of data.data || []) { const entry = parseLimitActivity(raw, account); if (entry) history.push(entry); }
    after = data.paging?.cursors?.after || '';
    if (!data.paging?.next || !after) return { history, complete: true };
  }
  return { history, complete: false };
}
// Alert-only polling: never writes current balances, sheet snapshots or refresh times.
// An overlapping activity window catches delayed Meta events and additions masked by
// concurrent spending. Event IDs and delivery claims deduplicate all collection paths.
export async function checkBalanceAdditions(db: SupabaseClient, now = new Date()) {
  if (localBalancePreview()) return { checked: 0, failed: 0, skipped: 'Local preview' };
  const cutoff = await db.from('admin_balance_alert_state').select('activated_at').eq('id', true).maybeSingle();
  const activatedAt = Date.parse(cutoff.data?.activated_at || '');
  if (cutoff.error || !Number.isFinite(activatedAt)) throw new Error('Balance alert activation is unavailable');
  const accounts = await loadAccounts(db, now);
  const results = await Promise.allSettled(accounts.map(async account => {
    const raw = await meta(account, '', { fields: 'id,name,currency,balance,spend_cap,amount_spent' });
    const reading = parseBalance(raw, publicAccount(account), 'manual', now.toISOString());
    if (reading.status !== 'ok') throw new Error('Balance could not be verified');
    const { history, complete } = await historyFor({ ...account, accountName: typeof raw.name === 'string' ? raw.name : account.accountName }, now, 2);
    const additions = history.filter(event => eligibleBalanceAddition(event) && event.currency === reading.currency
      && Date.parse(event.at) >= activatedAt && Date.parse(event.at) <= now.getTime());
    if (additions.length) {
      const saved = await db.from('admin_balance_history').upsert(additions.map(event => ({
        id: event.id, account_id: event.accountId, occurred_at: event.at, payload: event, notify: true,
      })), { onConflict: 'id', ignoreDuplicates: true });
      if (saved.error) throw new Error('Balance additions could not be saved');
    }
    if (!complete) throw new Error('Balance activity scan was incomplete');
  }));
  return { checked: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length };
}
export async function getBalancesView(db: SupabaseClient): Promise<BalancesView> {
  const [accounts, saved] = await Promise.all([loadAccounts(db), balanceStore(db).read()]);
  const active = new Set(accounts.map(a => a.accountId));
  return { accounts: accounts.map(publicAccount), current: saved.current.filter(c => active.has(c.account_id)),
    history: saved.history.filter(h => !EXCLUDED_BALANCE_ACCOUNTS.has(h.accountId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 500),
    snapshots: saved.snapshots.filter(h => !EXCLUDED_BALANCE_ACCOUNTS.has(h.accountId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300),
    localPreview: localBalancePreview(), historyNote: saved.historyNote };
}
export async function refreshBalances(db: SupabaseClient, scheduled = false, now = new Date()) {
  const slot = scheduled ? balanceSchedule(now) : null;
  if (scheduled && !slot) throw new Error('Outside the scheduled balance update window');
  const source = slot?.source || 'manual';
  const key = slot?.key || `manual:${now.toISOString().slice(0, 16)}`;
  const store = balanceStore(db);
  const accounts = await loadAccounts(db, now);
  if (!await store.claim(key, now)) return { refreshed: false, reason: 'A refresh is already running or was completed in this minute.' };
  const readings: BalanceReading[] = await Promise.all(accounts.map(async a => {
    try { const raw = await meta(a, '', { fields: 'id,name,currency,balance,spend_cap,amount_spent' });
      return parseBalance(raw, { ...publicAccount(a), accountName: typeof raw.name === 'string' ? raw.name : a.accountName }, source, new Date().toISOString());
    } catch { return { ...publicAccount(a), source, at: new Date().toISOString(), status: 'error', error: 'Meta could not be reached. Last verified reading retained.' }; }
  }));
  const histories = await Promise.all(accounts.map(a => historyFor(a, now).catch(() => ({ history: [] as BalanceHistory[], complete: false }))));
  await store.save(key, readings, histories.flatMap(h => h.history), histories.some(h => !h.complete) ? 'Some Meta activity history could not be fully fetched. Saved entries are retained.' : null);
  return { refreshed: true, successful: readings.filter(r => r.status === 'ok').length, total: readings.length };
}
