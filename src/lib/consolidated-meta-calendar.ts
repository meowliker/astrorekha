import { googleAccountDayWindow, googleClockHours } from './google-ads-reporting';
import { normalizeHourlySpendToDailyTotals, type CampaignSpendRow } from './tracking-meta-spend';

const HOUR = 3600000;
const shift = (date: string) => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
/** Used only by the consolidated report. Existing tracking windows stay unchanged. */
export function metaSpendForCalendarDays(input: {
  start: string; end: string; timezone: string; accountTimezone: string;
  accountWindow: {startMillis:number;endMillis:number};
  daily: CampaignSpendRow[]; hourly: CampaignSpendRow[]; now: number;
}): Record<string, {total:number;indian:number}> {
  const windows = [];
  for(let date=input.start;date<=input.end;date=shift(date)) windows.push({date,...googleAccountDayWindow(date,input.timezone)});
  const result = Object.fromEntries(windows.map(w=>[w.date,{total:0,indian:0}]));
  const applied = new Set<string>();
  const key = (row:CampaignSpendRow) => `${row.campaign_id}:${row.date_start}`;
  const value = (row:CampaignSpendRow) => {
    const amount=Number(row.spend || 0);
    if(!Number.isFinite(amount)||amount<0)throw new Error('Invalid Meta calendar spend.');
    return amount;
  };
  for(const row of input.daily) {
    if(!row.date_start)throw new Error('Missing Meta date.');
    const day=googleAccountDayWindow(row.date_start,input.accountTimezone);
    const window=windows.find(w=>day.start>=w.start&&day.end<=w.end&&day.start>=input.accountWindow.startMillis&&day.end<=input.accountWindow.endMillis);
    if(window) {result[window.date].total+=value(row);applied.add(key(row));}
    else if(value(row)>0&&windows.some(w=>day.start<w.end&&day.end>w.start)&&!input.hourly.some(h=>key(h)===key(row)))throw new Error('Missing Meta hourly spend for calendar conversion.');
  }
  const clocks = new Map<string, Map<number,number[]>>();
  for(const row of normalizeHourlySpendToDailyTotals(input.hourly,input.daily)) {
    if(applied.has(key(row)))continue;
    if(!row.date_start)throw new Error('Missing Meta hourly date.');
    let hours=clocks.get(row.date_start);
    if(!hours){hours=googleClockHours(row.date_start,input.accountTimezone);clocks.set(row.date_start,hours);}
    const hour=Number(row.hourly_stats_aggregated_by_advertiser_time_zone?.match(/^(\d{1,2}):/)?.[1]);
    const starts=hours.get(hour);
    if(!starts?.length)throw new Error('Invalid Meta clock hour.');
    // A repeated DST hour is aggregated by Meta. Keep its full value on its
    // calendar day; if split across a different day, only allocate the overlap.
    const duration=starts.reduce((sum,at)=>sum+Math.max(0,Math.min(at+HOUR,input.now)-at),0);
    if(!duration)continue;
    for(const window of windows) {
      const overlap=starts.reduce((sum,at)=>sum+Math.max(0,Math.min(at+HOUR,input.now,window.end,input.accountWindow.endMillis)-Math.max(at,window.start,input.accountWindow.startMillis)),0);
      result[window.date].total+=value(row)*overlap/duration;
    }
  }
  return result;
}
