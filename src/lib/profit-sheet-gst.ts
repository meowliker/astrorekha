export const INDIAN_AD_GST_RATE = 0.18;
export const INDIAN_AD_GST_START_DATE = "2026-10-01";

export function indianAdGstApplies(date: string): boolean {
  return date >= INDIAN_AD_GST_START_DATE;
}

export function roundInr(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateProfitSheetGst(revenue: number, revenueGstRate: number, indianAdSpendInr: number) {
  const revenueGst = roundInr(revenue * revenueGstRate);
  const adGstCredit = roundInr(indianAdSpendInr * INDIAN_AD_GST_RATE);
  return { revenueGst, adGstCredit, gst: roundInr(revenueGst - adGstCredit) };
}
