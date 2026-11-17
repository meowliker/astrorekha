import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import type { AcquisitionFunnel } from './admin-acquisition';
import { googleAccountDate, googleOrderAccount, readGoogleProfitContext, validateGoogleRange } from './google-ads-reporting';
import { readAdSourceFinance, type SourceFinanceDay } from './admin-source-finance';
import { cachedProfitReport } from './profit-report-cache';
import { calculateProfitSheetGst } from './profit-sheet-gst';
import { googleProfitRegion } from './google-profit-region';

export function googleProfitCacheKey(funnel: string, account: string, start: string, end: string, rate: string | null) {
  return createHash('sha256').update(JSON.stringify(['google-account-profit-v1', funnel, account, start, end, rate || 'auto'])).digest('hex');
}

/** Keep each workspace's existing financial formula; only the account and day boundaries change. */
export function googleProfitRow(day: SourceFinanceDay, costMicros: number | null, account: {id:string;name:string;currency:string}, funnel: AcquisitionFunnel, rate: number, attributionComplete: boolean) {
  const usd = funnel === 'us-main' || funnel === 'us-soulmate';
  if (!['USD','INR'].includes(account.currency)) throw new Error('Unsupported Google account currency.');
  const nativeCost = costMicros === null ? null : costMicros / 1e6;
  const inr = nativeCost === null ? null : account.currency === 'USD' ? nativeCost * rate : nativeCost;
  const dollars = nativeCost === null ? null : account.currency === 'USD' ? nativeCost : nativeCost / rate;
  if (funnel === 'astrorekha') {
    const revenue = (day.received - day.refund) / 100;
    const indianAdSpendInr = account.currency === 'INR' ? inr || 0 : 0;
    const calc = calculateProfitSheetGst(revenue, day.date >= '2026-10-01' ? .18 : .05, day.date >= '2026-10-01' ? indianAdSpendInr : 0);
    const known = inr !== null && attributionComplete;
    const profit = known ? revenue - calc.gst - inr! : null;
    return {date:day.date, day:new Date(day.date).toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}),
      revenue,grossRevenue:day.received/100,refundAmount:day.refund/100,adsCostINR:inr,adsCostUSD:dollars,
      gst:known?calc.gst:null,gstBreakdown:{...calc,indianAdSpendInr,indianAdAccounts:account.currency==='INR'?[{accountId:account.id,accountName:account.name,spendInr:indianAdSpendInr}]:[]},
      netRevenue:profit,profitPercent:profit===null?null:revenue>0?profit/revenue*100:0,
      roas:known&&inr?(day.bundleReceived-day.bundleRefund)/100/inr:null,
      bundleRevenue:(day.bundleReceived-day.bundleRefund)/100,bundlePurchases:day.bundleOrders,
      transactionCount:day.orders,salesCount:day.orders,refundCount:day.refunds,spendUnavailable:inr===null,profitUnavailable:!known};
  }
  const spend = usd ? dollars : inr;
  const adsInr = spend===null?null:Math.round(spend*100);
  const adGst = spend===null?null:usd?0:account.currency==='INR'?Math.round(spend*18):0;
  const revenue = day.received-day.refund;
  return {date:day.date,orders:day.orders,received:day.received,refund:day.refund,revenue,salesGst:day.salesTax,
    adsInr,adsUsd:dollars===null?null:Math.round(dollars*100),adGst,balance:null,balanceCapturedAt:null,
    profit:adsInr===null||adGst===null||!attributionComplete?null:revenue-day.salesTax-adsInr-adGst,
    roas:adsInr&&attributionComplete?revenue/adsInr:null,accounts:[],stale:false};
}

export async function googleProfitResponse(request: Request, funnel: AcquisitionFunnel) {
  const params = new URL(request.url).searchParams;
  const region = googleProfitRegion(funnel);
  const id = region.id;
  const start = params.get('startDate') || params.get('start') || '';
  const end = params.get('endDate') || params.get('end') || '';
  const suppliedRate = params.get('exchangeRate');
  try {
    validateGoogleRange(start,end);
    if (params.has('googleAccount') && params.get('googleAccount') !== id) throw new Error(`This workspace uses ${region.name}. Refresh the page to load its reporting day.`);
    if (suppliedRate && (!Number.isFinite(Number(suppliedRate)) || Number(suppliedRate)<=0)) throw new Error('Choose a valid exchange rate.');
  } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const load = async () => {
    const {account,campaigns,fetchedAt} = await readGoogleProfitContext(id,funnel,start,end);
    const today = googleAccountDate(Date.now(),account.timezone);
    if (start>today) return Response.json({error:'The selected dates have not started in this account timezone.'},{status:400});
    let rate = Number(suppliedRate);
    if (!rate) {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD',{signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Exchange rate unavailable.');
      rate = Number((await response.json()).rates?.INR);
      if (!Number.isFinite(rate)||rate<=0) throw new Error('Exchange rate unavailable.');
    }
    const unknown = new Set<string>(); const unknownDates = new Set<string>(); let unknownRefundTime = false;
    const finance = await readAdSourceFinance(db,funnel,'google',start,end,'account_day',{
      timezone:account.timezone,
      include: (row,at) => { const owner=googleOrderAccount(row,campaigns); if(!owner){unknown.add(String(row.payu_txn_id||row.id));if(at)unknownDates.add(googleAccountDate(at,account.timezone));else unknownRefundTime=true;} return owner===id; },
      unknownRefundTime:()=>{unknownRefundTime=true;},
    });
    const complete = !unknown.size && !unknownRefundTime;
    const rows = finance.filter(day=>day.date<=today).map(day=>googleProfitRow(day,account.rows.find(row=>row.date===day.date)?.costMicros??null,account,funnel,rate,!unknownRefundTime&&!unknownDates.has(day.date)));
    const warnings = [account.error,unknown.size?`${unknown.size} Google orders/refunds have no unique account attribution. Receipts show matched orders; profit and ROAS are unavailable on affected days until attribution is resolved.`:null,unknownRefundTime?'Some refunds have no exact timestamp. Profit is unavailable for this reporting window.':null].filter(Boolean);
    return Response.json({rows,adSource:'google',dayMode:'google_account',account,exchangeRate:rate,
      sourceFetchedAt:fetchedAt,fetchedAt,updatedAt:fetchedAt,dateRange:{start,end:end<today?end:today},missingRanges:[],missing:[],revision:1,accountCount:1,
      unassignedOrderCount:unknown.size,attributionComplete:complete,warnings,syncWarning:warnings.join(' ')||null});
  };
  try { return await cachedProfitReport(db,googleProfitCacheKey(funnel,id,start,end,suppliedRate),load,after); }
  catch { return Response.json({error:'Unable to load the Google account profit sheet. Please retry.'},{status:503}); }
}
