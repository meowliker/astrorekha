/** Reporting begins at the ad launch; stored historical events are preserved. */
export const US_ANALYTICS_LAUNCH_DATE = "2026-10-28";
export const US_ANALYTICS_LAUNCH_AT = "2026-10-28T06:00:00.000Z"; // 11:30 AM IST
const DAY = 86_400_000;
export const analyticsToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export function defaultAnalyticsStart(today: string) {
  const rollingStart = new Date(Date.parse(`${today}T00:00:00Z`) - 92 * DAY).toISOString().slice(0, 10);
  return rollingStart > US_ANALYTICS_LAUNCH_DATE ? rollingStart : US_ANALYTICS_LAUNCH_DATE;
}
export function analyticsRange(startDate: string, endDate: string, today = analyticsToday()) {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (![startDate, endDate].every(validDate) || startDate < US_ANALYTICS_LAUNCH_DATE || endDate > today || endDate < startDate) throw new Error("Choose dates from October 28, 2026 through today.");
  const midnight = Date.parse(`${startDate}T00:00:00+05:30`);
  const end = Date.parse(`${endDate}T00:00:00+05:30`) + DAY;
  if (end - midnight > 93 * DAY) throw new Error("Choose a range of up to 93 days.");
  const start = Math.max(midnight, Date.parse(US_ANALYTICS_LAUNCH_AT));
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), partialDay: start !== midnight };
}
