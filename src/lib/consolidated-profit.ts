/** Monetary values in this view are major units; payment rows remain untouched. */
export type Country = 'india' | 'us';
export const countryMode = (country: Country) => country === 'india' ? 'calendar_ist' as const : 'business_1130_ist' as const;
export const countryTimezone = (country: Country) => country === 'india' ? 'Asia/Kolkata' : 'America/New_York';
export const countryDate = (date: Date, country: Country) => new Intl.DateTimeFormat('en-CA', {timeZone:countryTimezone(country),year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const countryWindow = (country: Country) => country === 'india' ? '12:00 AM–11:59 PM IST' : '12:00 AM–11:59 PM New York time';
export const metrics = ['received', 'refund', 'revenue', 'adsUsd', 'adsInr', 'gst', 'balance', 'profit', 'margin', 'roas', 'bundles', 'orders'] as const;
export type Metric = typeof metrics[number];
export type Values = Record<Metric, number | null>;
export type Contribution = { key: string; label: string; values: Values; note?: string; fetchedAt?: string; retainedAt?: string; approximate?: boolean; scopeKey?: string; retainAllowed?: boolean; salesTax?: number; adTax?: number | null };
export type Balance = { id: string; name: string; value: number | null; capturedAt: string; note?: string };
export type ConsolidatedRow = { date: string; values: Values; contributions: Contribution[]; balances: Balance[] };
export type ConsolidatedReport = { country: Country; currency: 'INR' | 'USD'; dayMode: ReturnType<typeof countryMode> | 'calendar_new_york'; window: string; rows: ConsolidatedRow[]; total: ConsolidatedRow; fetchedAt: string; exchangeRate: number; unassignedOrders: number; complete: boolean };
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function sumKnown(values: (number | null)[]): number | null {
  return values.some(value => value === null || !Number.isFinite(value)) ? null : roundMoney((values as number[]).reduce((a, b) => a + b, 0));
}
export function financialValues(input: Partial<Values>, currency: 'INR' | 'USD'): Values {
  const values = Object.fromEntries(metrics.map(key => [key, input[key] ?? null])) as Values;
  values.revenue = values.received === null || values.refund === null ? null : roundMoney(values.received - values.refund);
  const spend = currency === 'USD' ? values.adsUsd : values.adsInr;
  values.profit = values.revenue === null || spend === null || values.gst === null ? null : roundMoney(values.revenue - spend - values.gst);
  values.margin = values.profit === null || !values.revenue ? null : values.profit / values.revenue * 100;
  values.roas = values.revenue === null || spend === null || spend <= 0 ? null : values.revenue / spend;
  return values;
}
export function combineRow(date: string, contributions: Contribution[], balances: Balance[], currency: 'INR' | 'USD'): ConsolidatedRow {
  if (new Set(contributions.map(part => part.key)).size !== contributions.length) throw new Error('Duplicate profit source.');
  // A balance is a stock, not a sale. Shared accounts count once, never once per funnel.
  const unique = new Map<string, Balance>();
  for (const balance of balances) {
    const previous = unique.get(balance.id);
    if (!previous || balance.capturedAt > previous.capturedAt) unique.set(balance.id, balance);
    else if (balance.capturedAt === previous.capturedAt && balance.value !== previous.value) unique.set(balance.id, { ...balance, value: null, note: 'Conflicting snapshots.' });
  }
  const values = financialValues(Object.fromEntries(metrics.map(key => [key, sumKnown(contributions.map(part => part.values[key]))])), currency);
  values.balance = unique.size ? sumKnown([...unique.values()].map(account => account.value)) : null;
  return { date, values, contributions, balances: [...unique.values()] };
}
export function totalRows(rows: ConsolidatedRow[], currency: 'INR' | 'USD'): ConsolidatedRow {
  const keys = [...new Set(rows.flatMap(row => row.contributions.map(part => part.key)))];
  const contributions = keys.map(key => {
    const parts = rows.flatMap(row => row.contributions.filter(part => part.key === key));
    return { ...parts[0], approximate: parts.some(p => p.approximate), retainedAt: parts.find(p => p.retainedAt)?.retainedAt,
      values: financialValues(Object.fromEntries(metrics.map(metric => [metric, sumKnown(parts.map(part => part.values[metric]))])), currency) };
  });
  // Show the final selected day's snapshot; daily balances must never be added together.
  return combineRow('Total', contributions, rows.at(-1)?.balances || [], currency);
}

/** Retain only a previously verified cost, never replace new sales with an older row. */
export function retainConsolidatedSpend(fresh: ConsolidatedReport, previous: ConsolidatedReport | null): ConsolidatedReport {
  if (!previous || previous.country !== fresh.country || previous.dayMode !== fresh.dayMode || previous.exchangeRate !== fresh.exchangeRate) return fresh;
  const rows = fresh.rows.map(row => combineRow(row.date, row.contributions.map(part => {
    if (part.values.adsUsd !== null && part.values.adsInr !== null) return part;
    const old = previous.rows.find(r => r.date === row.date)?.contributions.find(p => p.key === part.key);
    if (!part.retainAllowed || !part.scopeKey || part.scopeKey !== old?.scopeKey || !old || old.values.adsUsd === null || old.values.adsInr === null || old.adTax == null) return part;
    const retainedAt = old.retainedAt || old.fetchedAt || previous.fetchedAt;
    return {...part, retainedAt, adTax:old.adTax, approximate:old.approximate,
      values:financialValues({...part.values, adsUsd:old.values.adsUsd, adsInr:old.values.adsInr,
        gst:part.values.refund===null || part.salesTax==null ? null : roundMoney(part.salesTax+old.adTax)}, fresh.currency)};
  }), row.balances, fresh.currency));
  return {...fresh,rows,total:totalRows(rows,fresh.currency),complete:rows.every(row=>row.values.profit!==null)};
}
