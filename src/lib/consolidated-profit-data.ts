import { createHash } from 'node:crypto';
import type { BalanceReading } from './account-balances-types';
import { getMetaAccountWindowForRequest, type MetaAccountCredential } from './meta-ad-accounts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAdSourceFinance, type SourceFinanceDay } from './admin-source-finance';
import { type AcquisitionFunnel, type Attribution } from './admin-acquisition';
import { googleAccountDayWindow, readConsolidatedGoogleContext, googleOrderAccount, googleSpendForDay, type GoogleAccountReport } from './google-ads-reporting';
import { normalMetaCredentials } from './normal-meta-campaigns';
import { soulmateTrackingCredentials as indiaSoulCredentials } from './soulmate-tracking-data';
import { soulmateTrackingCredentials as usMainCredentials } from './us-main-tracking-data';
import { soulmateTrackingCredentials as usSoulCredentials } from './us-soulmate-tracking-data';
import { fetchMetaTrackingAccount as indiaMeta } from './soulmate-tracking-meta';
import { fetchMetaTrackingAccount as usMeta } from './us-main-tracking-meta';
import { trackingDayStartUtc, nextTrackingDayStartUtc } from './tracking-dashboard';
import { calculateProfitSheetGst } from './profit-sheet-gst';
import { usGoogleFinanceDay } from './google-profit-sheet';
import { countryMode, countryTimezone, countryWindow, financialValues, combineRow, totalRows, roundMoney, type AccountSpend, type Country, type Contribution, type Balance, type ConsolidatedReport } from './consolidated-profit';

const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
const labels: Record<AcquisitionFunnel, string> = { astrorekha: 'AstroRekha', soulmate: 'Soulmate', 'us-main': 'US AstroRekha', 'us-soulmate': 'US Soulmate' };
const emptyDay = (date: string): SourceFinanceDay => ({date, received:0, refund:0, orders:0, refunds:0, bundleReceived:0, bundleRefund:0, bundleOrders:0, salesTax:0, gateways:{}});
const credentialsFor = { astrorekha: normalMetaCredentials, soulmate: indiaSoulCredentials, 'us-main': usMainCredentials, 'us-soulmate': usSoulCredentials };
const googleDay = (report: GoogleAccountReport, date: string) => googleSpendForDay({accounts:[report], complete:!report.account.error, warnings:report.warnings, fetchedAt:''}, date);

export async function loadConsolidatedProfit(db: SupabaseClient, country: Country, start: string, end: string): Promise<ConsolidatedReport> {
  const mode = countryMode(country), currency = country === 'india' ? 'INR' as const : 'USD' as const;
  const funnels: AcquisitionFunnel[] = country === 'india' ? ['astrorekha', 'soulmate'] : ['us-main', 'us-soulmate'];
  const dates: string[] = []; for (let date = start; date <= end; date = shift(date, 1)) dates.push(date);
  // Use the saved normal-sheet exchange rate. No rate fallback is invented.
  const savedRate = await db.from('profit_sheet_calendar').select('exchange_rate').lte('date', end).gt('exchange_rate',0).order('date',{ascending:false}).limit(1).maybeSingle();
  if (savedRate.error || !Number.isFinite(Number(savedRate.data?.exchange_rate)) || Number(savedRate.data?.exchange_rate) <= 0) throw new Error('A saved USD to INR reporting rate is required.');
  const rate = Number(savedRate.data!.exchange_rate);
  const timezone=countryTimezone(country);
  const range = {startMillis:googleAccountDayWindow(start,timezone).start,endMillis:googleAccountDayWindow(end,timezone).end};
  const parts = new Map(dates.map(date => [date, [] as Contribution[]]));
  const accountCredentials = new Map<string, MetaAccountCredential[]>();
  const assignedCampaigns = new Set<string>();
  const balanceSources = new Map<string, {key:string; credential:MetaAccountCredential}[]>();
  const google = await readConsolidatedGoogleContext(country,start,end,mode,rate);
  let unassignedOrders = 0;
  for (const funnel of funnels) {
    for (const source of ['meta','google'] as const) {
      let unknownRefund = false;
      const scope = {timezone,
        include:(row:Attribution) => source !== 'google' || googleOrderAccount(row,google.campaigns) === google.accountId,
        unknownRefundTime:() => {unknownRefund=true;}};
      const finance = await readAdSourceFinance(db,funnel,source,start,end,mode,scope);
      let legacy: SourceFinanceDay[] | undefined;
      if (funnel === 'us-main' && source === 'google') legacy = await readAdSourceFinance(db,'astrorekha','google',start,end,mode,scope);
      if (source === 'google') {
        const unmatched = await readAdSourceFinance(db,funnel,source,start,end,mode,{...scope,include:row=>googleOrderAccount(row,google.campaigns)===null});
        unassignedOrders += unmatched.reduce((sum,row)=>sum+row.orders,0);
      }
      const meta: Awaited<ReturnType<typeof indiaMeta>>[] = [];
      let metaError = false;
      let scopeKey = '';
      let selectionValid = false;
      if (source === 'meta') {
        try {
          const credentials = await credentialsFor[funnel](db,range);
          scopeKey = createHash('sha256').update(JSON.stringify(credentials.map(account=>({accountId:account.accountId,campaignIds:account.campaignIds,startDate:account.startDate,startTime:account.startTime,endDate:account.endDate,endTime:account.endTime})))).digest('hex');
          for (const credential of credentials) {
            balanceSources.set(credential.accountId,[...(balanceSources.get(credential.accountId)||[]),{key:`${funnel}:meta`,credential}]);
            accountCredentials.set(credential.accountId,[...(accountCredentials.get(credential.accountId)||[]),credential]);
            for (const campaign of credential.campaignIds) {
              const id = `${credential.accountId}:${campaign}`;
              if (assignedCampaigns.has(id)) {selectionValid=false;throw new Error('Overlapping campaign assignments.');}
              assignedCampaigns.add(id);
            }
            selectionValid = true;
            meta.push(await (country === 'india' ? indiaMeta(credential,{start,end},rate,mode) : usMeta(credential,{start,end},1,mode,timezone)));
          }
          metaError = meta.some(item=>Boolean(item.account.error) || !(country==='us' ? ['USD'] : ['USD','INR']).includes(item.account.currency));
        } catch { metaError = true; }
      }
      for (const day of finance) {
        let nativeDay = day;
        if (legacy) nativeDay = usGoogleFinanceDay(day,legacy.find(row=>row.date===day.date) || emptyDay(day.date),rate);
        let spend: number | null = null, indianSpend: number | null = null;
        if (source === 'meta' && !metaError) {
          spend = meta.reduce((sum,item)=>sum+(item.dailySpendInr[day.date]?.total || 0),0);
          indianSpend = meta.reduce((sum,item)=>sum+(item.dailySpendInr[day.date]?.indian || 0),0);
        } else if (source === 'google') {
          const current = googleDay(google.reports[funnel],day.date);
          spend = current?.total ?? null; indianSpend=current?.indian ?? null;
          if (legacy) {
            const old = googleDay(google.reports.astrorekha,day.date);
            spend = spend===null || !old ? null : spend+old.total/rate;
          }
        }
        const accountAmounts = (amount:number|null) => ({
          adsUsd:amount===null?null:roundMoney(currency==='USD'?amount:amount/rate),
          adsInr:amount===null?null:roundMoney(currency==='INR'?amount:amount*rate),
        });
        const accounts: AccountSpend[] = source==='google'
          ? [{id:google.accountId,name:country==='india'?'Astro India':'Astro USA',...accountAmounts(spend)}]
          : meta.map(item=>({id:item.account.id,name:item.account.name,...accountAmounts(item.account.error || !(country==='us'?['USD']:['USD','INR']).includes(item.account.currency)?null:item.dailySpendInr[day.date]?.total || 0)}));
        // Allocate only rounding pennies so the displayed account amounts reconcile to the source total.
        for(const metric of ['adsUsd','adsInr'] as const) {
          const target=accountAmounts(spend)[metric];
          if(target!==null && accounts.length && accounts.every(a=>a[metric]!==null)) {
            const largest=accounts.reduce((a,b)=>(a[metric] || 0)>=(b[metric] || 0)?a:b);
            largest[metric]=roundMoney((largest[metric] || 0)+target-accounts.reduce((sum,a)=>sum+(a[metric] || 0),0));
          }
        }
        const revenue = (nativeDay.received-nativeDay.refund)/100;
        const gst = spend===null || unknownRefund ? null : funnel==='astrorekha'
          ? calculateProfitSheetGst(revenue,day.date>='2026-10-01'?.18:.05,day.date>='2026-10-01'?indianSpend || 0:0).gst
          : nativeDay.salesTax/100+(currency==='INR'?(indianSpend || 0)*.18:0);
        const approximate = source==='meta' && (spend || 0)>0 && meta.some(item => {
          if (!item.account.timezone) return true;
          const minute = new Intl.DateTimeFormat('en-GB',{timeZone:item.account.timezone,minute:'2-digit'}).format(new Date(googleAccountDayWindow(day.date,timezone).start));
          return minute!=='00';
        });
        parts.get(day.date)!.push({key:`${funnel}:${source}`,label:`${labels[funnel]} · ${source==='meta'?'Meta / other sources':'Google Ads'}`,
          accounts,
          scopeKey:source==='meta'?scopeKey:`${google.accountId}:${funnel}`,
          retainAllowed:source==='meta'?selectionValid:google.reports[funnel].unavailableReasons?.[day.date]==='updating',
          fetchedAt:source==='google'?google.fetchedAt:new Date().toISOString(),approximate,
          salesTax:funnel==='astrorekha'?calculateProfitSheetGst(revenue,day.date>='2026-10-01'?.18:.05,0).gst:nativeDay.salesTax/100,
          adTax:gst===null?null:roundMoney(gst-(funnel==='astrorekha'?calculateProfitSheetGst(revenue,day.date>='2026-10-01'?.18:.05,0).gst:nativeDay.salesTax/100)),
          note: source==='meta' ? 'Includes direct and organic sales assigned to this workspace. Spend uses its selected Meta campaigns.' : `${country==='india'?'Astro India':'Astro USA'} only.${legacy?' Includes historical INR /discover purchases, converted to USD.':''}`,
          values:financialValues({received:nativeDay.received/100,refund:unknownRefund?null:nativeDay.refund/100,
            orders:nativeDay.orders,bundles:nativeDay.bundleOrders,adsUsd:spend===null?null:currency==='USD'?roundMoney(spend):roundMoney(spend/rate),
            adsInr:spend===null?null:currency==='INR'?roundMoney(spend):roundMoney(spend*rate),gst:gst===null?null:roundMoney(gst)},currency)});
      }
    }
  }
  const snapshots = await db.from('admin_balance_snapshots').select('payload').gte('captured_at',trackingDayStartUtc(start,'calendar_ist')).lt('captured_at',nextTrackingDayStartUtc(end,'calendar_ist')).order('captured_at');
  if(snapshots.error) throw new Error('Unable to read scheduled account snapshots.');
  const balances = await db.from(mode==='calendar_ist'?'profit_sheet_calendar':'profit_sheet')
    .select('date,account_balance_breakdown,account_balance_captured_at').gte('date',start).lte('date',end).order('date');
  if (balances.error) throw new Error('Unable to read balance snapshots.');
  const rows = dates.map(date=>{
    const accountIds = new Set([...accountCredentials].filter(([,credentials])=>credentials.some(c=>{const window=getMetaAccountWindowForRequest(c,shift(date,-1),shift(date,1),'calendar_ist');const day=googleAccountDayWindow(date,timezone);return window && window.startMillis<day.end && window.endMillis>day.start;})).map(([id])=>id));
    const saved = balances.data.find(row=>row.date===date);
    const items: Balance[] = saved?.account_balance_captured_at && Array.isArray(saved.account_balance_breakdown)
      ? saved.account_balance_breakdown.filter((a:{accountId:string})=>accountIds.has(a.accountId)).map((a:{accountId:string;accountName:string;currency:string;balance:number;balanceMode:string})=>({
        id:a.accountId,name:a.accountName,value:!['INR','USD'].includes(a.currency)?null:roundMoney(a.currency===currency?a.balance:a.currency==='USD'?a.balance*rate:a.balance/rate),capturedAt:saved.account_balance_captured_at,
        note:a.balanceMode==='outstanding'?'Outstanding amount; not prepaid credit.':'Remaining spending limit; counted once across shared funnels.'})) : [];
    for (const snapshot of snapshots.data) {
      const reading = snapshot.payload as BalanceReading;
      const snapshotDate = new Date(Date.parse(reading.at)+330*60000).toISOString().slice(0,10);
      if(snapshotDate!==date || reading.source!==(country==='india'?'midnight':'morning') || !accountIds.has(reading.accountId)) continue;
      const value = reading.status==='ok' && reading.remaining!=null && reading.currency
        ? roundMoney(reading.currency===currency?reading.remaining:reading.currency==='USD'?reading.remaining*rate:reading.remaining/rate) : null;
      const existing = items.findIndex(a=>a.id===reading.accountId);
      // The ledger's signed outstanding/remaining snapshot is authoritative when present.
      if(existing<0)items.push({id:reading.accountId,name:reading.accountName,value,capturedAt:reading.at,note:'Remaining spending limit; shared accounts counted once.'});
    }
    // Keep missing snapshots visible in the breakdown while summing available balances.
    for (const id of accountIds) if (!items.some(a=>a.id===id)) items.push({id,name:id,value:null,capturedAt:'',note:'No snapshot saved for this reporting boundary.'});
    return combineRow(date,parts.get(date)!,items.map(item=>({...item,sources:[...new Set((balanceSources.get(item.id)||[]).filter(({credential})=>{
      const window=getMetaAccountWindowForRequest(credential,shift(date,-1),shift(date,1),'calendar_ist');
      const day=googleAccountDayWindow(date,timezone);
      return window && window.startMillis<day.end && window.endMillis>day.start;
    }).map(source=>source.key))]})),currency);
  });
  return {country,currency,dayMode:country==='us'?'calendar_new_york':mode,window:countryWindow(country),rows,total:totalRows(rows,currency),exchangeRate:rate,
    fetchedAt:new Date().toISOString(),unassignedOrders,complete:rows.every(row=>row.values.profit!==null)};
}
