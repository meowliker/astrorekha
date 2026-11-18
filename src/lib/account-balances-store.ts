import type { SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { mergeBalance, type BalanceCurrent, type BalanceReading, type BalanceHistory } from './account-balances-types';

type State = { current: BalanceCurrent[]; snapshots: BalanceReading[]; history: BalanceHistory[]; runs: Record<string, { at: number; complete: boolean }>; historyNote: string | null };
const empty = (): State => ({ current: [], snapshots: [], history: [], runs: {}, historyNote: null });
// Explicit development-only storage: live credentials are used READ-ONLY during local review.
export const localBalancePreview = () => process.env.NODE_ENV === 'development' && process.env.ACCOUNT_BALANCES_LOCAL_PREVIEW === '1';
const file = () => path.join(process.cwd(), 'tmp', 'account-balances-preview.json');
let queue: Promise<unknown> = Promise.resolve();
async function local<T>(fn: (s: State) => T, write = false): Promise<T> {
  const task = queue.then(async () => {
    let s: State;
    try { s = JSON.parse(await readFile(file(), 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; s = empty(); }
    const result = fn(s);
    if (write) { await mkdir(path.dirname(file()), { recursive: true }); await writeFile(`${file()}.tmp`, JSON.stringify(s), { mode: 0o600 }); await rename(`${file()}.tmp`, file()); }
    return result;
  });
  queue = task.catch(() => undefined); return task;
}
export function balanceStore(db: SupabaseClient) {
  return {
    async read() {
      if (localBalancePreview()) return local(s => s);
      const [current, history, snapshots, runs] = await Promise.all([
        db.from('admin_balance_current').select('*'),
        db.from('admin_balance_history').select('payload').order('occurred_at', { ascending: false }).limit(500),
        db.from('admin_balance_snapshots').select('payload').order('captured_at', { ascending: false }).limit(300),
        db.from('admin_balance_runs').select('history_note').not('completed_at', 'is', null).order('started_at', { ascending: false }).limit(1),
      ]);
      if ([current, history, snapshots, runs].some(r => r.error)) throw new Error('Balance storage is not ready. Apply the account balances migration.');
      return { current: current.data as BalanceCurrent[], history: history.data!.map(r => r.payload as BalanceHistory), snapshots: snapshots.data!.map(r => r.payload as BalanceReading), historyNote: runs.data?.[0]?.history_note || null };
    },
    async claim(key: string, now: Date) {
      if (localBalancePreview()) return local(s => {
        if (s.runs[key]?.complete || Object.values(s.runs).some(r => !r.complete && now.getTime() - r.at < 120_000)) return false;
        s.runs[key] = { at: now.getTime(), complete: false }; return true;
      }, true);
      const r = await db.rpc('claim_admin_balance_refresh', { p_key: key });
      if (r.error) throw new Error('Could not reserve balance refresh'); return r.data === true;
    },
    async save(key: string, readings: BalanceReading[], history: BalanceHistory[], historyNote: string | null) {
      if (localBalancePreview()) return local(s => {
        for (const reading of readings) {
          const index = s.current.findIndex(c => c.account_id === reading.accountId);
          const next = mergeBalance(s.current[index], reading);
          if (index < 0) s.current.push(next); else s.current[index] = next;
          s.snapshots.push(reading);
        }
        const known = new Set(s.history.map(h => h.id));
        s.history.push(...history.filter(h => !known.has(h.id)));
        s.runs[key].complete = true; s.historyNote = historyNote;
      }, true);
      const r = await db.rpc('save_admin_balance_refresh', { p_key: key, p_readings: readings, p_history: history, p_history_note: historyNote });
      if (r.error) throw new Error('Balance refresh could not be saved');
    },
  };
}
