type Report = Record<string, unknown>;
type Row = Report & {date: string; retainedAt?: string};
type SpendRow = {date: string; costMicros: number | null; unavailableReason?: string; retainedAt?: string};
type Account = {id: string; timezone: string; currency: string; rows: SpendRow[]};

/** Retain a coherent financial snapshot, never fresh receipts combined with old cost. */
export function retainVerifiedGoogleProfit(fresh: Report, previous: Report | null): Report {
  const account = fresh.account as Account;
  const before = previous?.account as Account | undefined;
  const compatible = previous?.revision === fresh.revision && previous?.dayMode === 'google_account' && previous.funnel === fresh.funnel &&
    before?.id === account.id && before.timezone === account.timezone && before.currency === account.currency &&
    previous.exchangeRate === fresh.exchangeRate;
  const oldRows = new Map(((compatible ? previous?.rows : []) as Row[] || []).map(row => [row.date, row]));
  const oldSpend = new Map((compatible ? before!.rows : []).map(row => [row.date, row]));
  const unsafeDates = new Set(fresh.unassignedDates as string[] || []);
  const retained = new Map<string, string>((fresh.rows as Row[]).filter(row => row.retainedAt).map(row => [row.date, row.retainedAt!]));
  const isMain = fresh.funnel === 'astrorekha';
  const rows = (fresh.rows as Row[]).map(row => {
    if (row.retainedAt) return row;
    const spend = account.rows.find(day => day.date === row.date);
    const old = oldRows.get(row.date), cost = oldSpend.get(row.date);
    const timestamp = old?.retainedAt || previous?.sourceFetchedAt;
    const profit = old?.[isMain ? 'netRevenue' : 'profit'];
    if (spend?.unavailableReason !== 'updating' || unsafeDates.has(row.date) || fresh.unknownRefundTime ||
        !old || !cost || !Number.isSafeInteger(cost.costMicros) || Number(cost.costMicros) < 0 ||
        typeof profit !== 'number' || !Number.isFinite(profit) || typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return row;
    retained.set(row.date, timestamp);
    return {...old, retainedAt: timestamp};
  });
  const spendStillMissing = account.rows.some(day => day.costMicros === null && !retained.has(day.date));
  const warnings = (fresh.warnings as string[] || []).filter(warning => spendStillMissing || warning !== (account as Account & {error?: string}).error);
  return {...fresh, warnings, syncWarning: warnings.join(' ') || null, rows, retainedDates: [...retained.keys()], account: {...account, rows: account.rows.map(day =>
    retained.has(day.date) ? {...day, costMicros: day.costMicros ?? oldSpend.get(day.date)!.costMicros, retainedAt: retained.get(day.date)} : day)}};
}
