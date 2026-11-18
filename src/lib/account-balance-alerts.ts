import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { BalanceHistory } from './account-balances-types';
import { monitoringAlertRecipients, type MonitoringDestination } from './monitoring-delivery';

export const BALANCE_ADDITION_MENTIONS = ['U08KKPKQKHD', 'U08C5ENV66Q'] as const;
const excluded = new Set(['2022187855078303', '2366717340763776']);
export function eligibleBalanceAddition(event: BalanceHistory) {
  return !excluded.has(event.accountId) && event.kind === 'limit_change' && (event.before || 0) > 0 && event.amount > 0 && (event.after || 0) > (event.before || 0);
}
const escapeSlack = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n*`]/g, ' ');
export function balanceAdditionMessage(event: BalanceHistory) {
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: event.currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(event.amount);
  const at = new Date(event.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return `${BALANCE_ADDITION_MENTIONS.map(id => `<@${id}>`).join(' ')}\n*Ad account balance added*\n*${escapeSlack(event.accountName)}* (${escapeSlack(event.accountId)}) — *${amount} added to the spending limit*.\n${at} IST\n<https://astrorekha.com/admin/account-balances|View account balances>`;
}
function validWebhook(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['hooks.slack.com', 'hooks.slack-gov.com'].includes(u.hostname) && u.pathname.startsWith('/services/') && !u.username && !u.password; } catch { return false; }
}
export async function deliverBalanceAdditionAlerts(db: SupabaseClient) {
  // Development and tests never send real messages, even with production credentials.
  if (process.env.NODE_ENV !== 'production') return { skipped: 'Local preview', sent: 0 };
  const environment: MonitoringDestination[] = (process.env.MONITOR_SLACK_WEBHOOK_URLS || '').split(',').map(v => v.trim()).filter(validWebhook)
    .map((address, i) => ({ address, label: `Environment Slack ${i + 1}`, kind: 'slack', enabled: true }));
  const recipients = (await monitoringAlertRecipients(db, environment, false)).filter(d => d.kind === 'slack' ? validWebhook(d.address) : d.kind === 'slack_chat' && /^[CDGU][A-Z0-9]{8,20}$/.test(d.address));
  if (!recipients.length) return { skipped: 'Slack alerts paused or no destination', sent: 0 };
  const pending = await db.from('admin_balance_history').select('id,payload').eq('notify', true).order('occurred_at').limit(5);
  if (pending.error) throw new Error('Could not read balance addition alerts');
  let sent = 0;
  for (const row of pending.data || []) {
    const event = row.payload as BalanceHistory;
    if (!eligibleBalanceAddition(event)) { await db.from('admin_balance_history').update({ notify: false }).eq('id', row.id); continue; }
    const results = await Promise.all(recipients.map(async destination => {
      const id = createHash('sha256').update(`${row.id}:${destination.kind}:${destination.address}`).digest('hex');
      const claim = await db.from('admin_balance_alert_deliveries').insert({ id, event_id: row.id, status: 'sending' });
      if (claim.error) {
        if (claim.error.code !== '23505') return false;
        const prior = await db.from('admin_balance_alert_deliveries').select('status,updated_at').eq('id', id).maybeSingle();
        if (prior.data?.status === 'sent' || prior.data?.status === 'unknown') return true;
        if (prior.data?.status === 'sending' && Date.parse(prior.data.updated_at) < Date.now() - 120_000) {
          await db.from('admin_balance_alert_deliveries').update({ status: 'unknown', error: 'Previous delivery was interrupted; inspect Slack before retrying' }).eq('id', id).eq('status', 'sending');
          return true;
        }
        // Only an explicit rejection is retried. A timeout may already have delivered.
        const retry = await db.from('admin_balance_alert_deliveries').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'failed').lt('updated_at', new Date(Date.now() - 5 * 60_000).toISOString()).select('id').maybeSingle();
        if (retry.error || !retry.data) return false;
      }
      let status: 'sent' | 'failed' | 'unknown' = 'unknown';
      let error: string | null = null;
      try {
        if (destination.kind === 'slack_chat' && !process.env.SLACK_BOT_TOKEN) { status = 'failed'; error = 'Slack bot token is not configured'; }
        else {
          const bot = destination.kind === 'slack_chat';
          const response = await fetch(bot ? 'https://slack.com/api/chat.postMessage' : destination.address, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(bot ? { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } : {}) },
            body: JSON.stringify({ text: balanceAdditionMessage(event), ...(bot ? { channel: destination.address } : {}) }), signal: AbortSignal.timeout(7000),
          });
          const body = bot ? await response.json().catch(() => null) as { ok?: boolean; error?: string } | null : null;
          status = response.ok && (!bot || body?.ok === true) ? 'sent' : response.status >= 500 || (bot && response.ok && !body) ? 'unknown' : 'failed';
          error = status === 'sent' ? null : 'Slack did not confirm delivery';
        }
      } catch { error = 'Delivery result unknown; not automatically resent to avoid duplicate alerts'; }
      const saved = await db.from('admin_balance_alert_deliveries').update({ status, error, updated_at: new Date().toISOString() }).eq('id', id);
      if (saved.error) return false;
      if (status === 'sent') sent++;
      // Unknown attempts remain recorded for inspection but are never automatically resent.
      return status === 'sent' || status === 'unknown';
    }));
    if (results.every(Boolean)) await db.from('admin_balance_history').update({ notify: false }).eq('id', row.id);
  }
  return { sent };
}
