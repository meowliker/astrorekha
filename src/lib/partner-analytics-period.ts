export type AnalyticsRange = { start: string; end: string };

export const earliestAnalyticsDate = "2020-01-01";
const maxDays = 366;
const dayMs = 86_400_000;

const atMidnight = (date: string) => new Date(`${date}T00:00:00Z`);
export const shiftAnalyticsDate = (date: string, days: number) =>
  new Date(atMidnight(date).getTime() + days * dayMs).toISOString().slice(0, 10);

export function analyticsDate(date: Date, timeZone: string) {
  return date.toLocaleDateString("sv-SE", { timeZone });
}

export function validAnalyticsRange(range: AnalyticsRange, today: string) {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(atMidnight(date).getTime()) && shiftAnalyticsDate(date, 0) === date;
  return validDate(range.start) && validDate(range.end) && range.start >= earliestAnalyticsDate
    && range.start <= range.end && range.end <= today
    && atMidnight(range.end).getTime() - atMidnight(range.start).getTime() < maxDays * dayMs;
}

export function previousAnalyticsRange({ start, end }: AnalyticsRange): AnalyticsRange {
  const length = (atMidnight(end).getTime() - atMidnight(start).getTime()) / dayMs + 1;
  return { start: shiftAnalyticsDate(start, -length), end: shiftAnalyticsDate(start, -1) };
}

export function recentAnalyticsRange(today: string, days: number): AnalyticsRange {
  return { start: shiftAnalyticsDate(today, -days), end: shiftAnalyticsDate(today, -1) };
}

export function analyticsPresets(today: string): { label: string; range: AnalyticsRange }[] {
  const yesterday = shiftAnalyticsDate(today, -1);
  const date = atMidnight(today);
  const week = shiftAnalyticsDate(today, -((date.getUTCDay() + 6) % 7));
  const month = `${today.slice(0, 7)}-01`;
  const year = date.getUTCFullYear();
  const monthOffset = (offset: number) =>
    new Date(Date.UTC(year, date.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
  const quarter = -(date.getUTCMonth() % 3);
  return [
    { label: "Today", range: { start: today, end: today } },
    { label: "Yesterday", range: { start: yesterday, end: yesterday } },
    ...[7, 14, 30, 60, 90, 180, 365].map(days => ({ label: `Last ${days} days`, range: recentAnalyticsRange(today, days) })),
    { label: "This week", range: { start: week, end: today } },
    { label: "Last week", range: { start: shiftAnalyticsDate(week, -7), end: shiftAnalyticsDate(week, -1) } },
    { label: "This month", range: { start: month, end: today } },
    { label: "Last month", range: { start: monthOffset(-1), end: shiftAnalyticsDate(month, -1) } },
    { label: "This quarter", range: { start: monthOffset(quarter), end: today } },
    { label: "Last quarter", range: { start: monthOffset(quarter - 3), end: shiftAnalyticsDate(monthOffset(quarter), -1) } },
    { label: "Year to date", range: { start: `${year}-01-01`, end: today } },
  ];
}
