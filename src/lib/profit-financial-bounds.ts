import type { GoogleDayBounds, SpendBounds } from './google-ads-reporting';
import { calculateProfitSheetGst, indianAdGstApplies } from './profit-sheet-gst';

export type ProfitFinancialBounds = Record<'adsCostINR' | 'adsCostUSD' | 'gst' | 'netRevenue', SpendBounds>;

/** Apply the existing GST formula and combine bounds conservatively, without assuming hour shares. */
export function profitFinancialBounds(google: GoogleDayBounds | null, revenue: number, gstRate: number,
  date: string, exchangeRate: number, metaSpend = 0, metaIndianSpend = 0, metaSpendUsd = metaSpend / exchangeRate): ProfitFinancialBounds | undefined {
  if (!google || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return undefined;
  const spend = { min: metaSpend + google.total.min, max: metaSpend + google.total.max };
  const gstAt = (indian: number) => indianAdGstApplies(date)
    ? calculateProfitSheetGst(revenue, gstRate, metaIndianSpend + indian).gst : revenue * gstRate;
  const gst = { min: gstAt(google.indian.max), max: gstAt(google.indian.min) };
  return { adsCostINR: spend, adsCostUSD: { min: metaSpendUsd + google.total.min / exchangeRate, max: metaSpendUsd + google.total.max / exchangeRate }, gst,
    netRevenue: { min: revenue - gst.max - spend.max, max: revenue - gst.min - spend.min } };
}

/** Totals are conservative: shared boundary hours may widen the range, never narrow it falsely. */
export function sumProfitFinancialBounds(rows: Array<{ financialBounds?: ProfitFinancialBounds;
  adsCostINR: number | null; adsCostUSD: number | null; gst: number | null; netRevenue: number | null }>): ProfitFinancialBounds | undefined {
  const result: ProfitFinancialBounds = { adsCostINR: {min:0,max:0}, adsCostUSD: {min:0,max:0}, gst: {min:0,max:0}, netRevenue: {min:0,max:0} };
  for (const row of rows) for (const key of Object.keys(result) as Array<keyof ProfitFinancialBounds>) {
    const bounds = row.financialBounds?.[key];
    if (!bounds && (row[key] === null || !Number.isFinite(row[key]))) return undefined;
    result[key].min += bounds ? bounds.min : row[key]!;
    result[key].max += bounds ? bounds.max : row[key]!;
  }
  return result;
}
