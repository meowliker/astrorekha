export const DAY_MS = 86400000;
export const US_SOULMATE_PROFIT_START = "2026-10-15";
export const shiftProfitDate = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
// Same reporting boundary as the main business-day profit sheet: 11:30 IST = 06:00 UTC.
export const profitDay = (at: string | number) => new Date((typeof at === "number" ? at : Date.parse(at)) - 6 * 3600000).toISOString().slice(0, 10);
export function validProfitDate(value: string) {
  const time = Date.parse(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export type SoulmateProfitRow = { date: string; orders: number; received: number; salesGst: number; refund: number | null; revenue: number | null; adsUsd: number | null; adsInr: number | null; adGst: number | null; balance: number | null; profit: number | null; roas: number | null; exchangeRate?: number | null; balanceCapturedAt?: string | null; syncedAt?: string; stale?: boolean; accounts?: SoulmateAccountSpend[] };
export type SoulmateAccountSpend = { date: string; accountId: string; label: string; currency: string; nativeSpend: number; adsUsd: number; adsInr: number; adGst: number; balance: number | null; balanceCapturedAt: string | null };
export function latestSoulmateProfitRange(now = Date.now()) {
  const end = profitDay(now);
  return { start: [US_SOULMATE_PROFIT_START, shiftProfitDate(end, -1)].sort().pop()!, end };
}
export function soulmateProfitRows(start: string, end: string, orders: { amount: number; gst_amount: number; paid_at: string }[]): SoulmateProfitRow[] {
  const rows = new Map<string, SoulmateProfitRow>();
  for (let date = start; date <= end; date = shiftProfitDate(date, 1)) rows.set(date, { date, orders: 0, received: 0, salesGst: 0, refund: null, revenue: null, adsUsd: null, adsInr: null, adGst: null, balance: null, profit: null, roas: null });
  for (const order of orders) {
    const row = rows.get(profitDay(order.paid_at));
    if (!row) continue;
    row.orders++; row.received += order.amount; row.salesGst += order.gst_amount;
  }
  return [...rows.values()];
}
