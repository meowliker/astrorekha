export const BALANCE_FUNNELS = ['AstroRekha', 'Soulmate', 'US AstroRekha', 'US Soulmate'] as const;
export type BalanceFunnel = typeof BALANCE_FUNNELS[number];
export type BalanceReading = {
  accountId: string; accountName: string; funnels: BalanceFunnel[];
  at: string; source: 'manual' | 'midnight' | 'morning' | 'evening';
  status: 'ok' | 'error'; currency?: 'INR' | 'USD';
  remaining?: number | null; outstanding?: number; spendCap?: number; spent?: number;
  error?: string;
};
export type BalanceCurrent = { account_id: string; last_attempt: BalanceReading; last_verified: BalanceReading | null };
export type BalanceHistory = {
  id: string; accountId: string; accountName: string; at: string;
  kind: 'limit_change'; currency: 'INR' | 'USD'; amount: number;
  before?: number; after?: number; reference: string;
};
export type BalanceAccount = { accountId: string; accountName: string; funnels: BalanceFunnel[] };
export type BalancesView = {
  accounts: BalanceAccount[]; current: BalanceCurrent[]; history: BalanceHistory[];
  snapshots: BalanceReading[]; localPreview: boolean; historyNote: string | null;
};

export function balanceSchedule(now: Date) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const source = minutes < 5 ? 'midnight' : minutes >= 690 && minutes < 695 ? 'morning' : minutes >= 1080 && minutes < 1085 ? 'evening' : null;
  return source ? { source, key: `${ist.toISOString().slice(0, 10)}:${source}` } as const : null;
}

export function mergeBalance(current: BalanceCurrent | undefined, reading: BalanceReading): BalanceCurrent {
  if (current && current.last_attempt.at > reading.at) return current;
  return { account_id: reading.accountId, last_attempt: reading,
    last_verified: reading.status === 'ok' ? reading : current?.last_verified || null };
}
