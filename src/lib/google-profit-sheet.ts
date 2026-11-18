import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import { acquisitionTags, acquisitionTouch, type AcquisitionFunnel } from './admin-acquisition';
import { googleAccountDate, googleOrderAccount, readGoogleProfitContext, validateGoogleRange } from './google-ads-reporting';
import { readAdSourceFinance, type SourceFinanceDay } from './admin-source-finance';
import { cachedProfitReport } from './profit-report-cache';
import { calculateProfitSheetGst } from './profit-sheet-gst';
import { retainVerifiedGoogleProfit } from './google-profit-retention';
import { googleProfitRegion } from './google-profit-region';

export function googleProfitCacheKey(funnel: string, account: string, start: string, end: string, rate: string | null) {
  return createHash('sha256').update(JSON.stringify(['google-region-profit-v4', funnel, account, start, end, rate || 'auto'])).digest('hex');
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

/** Preserve INR receipts and tax; convert only the USA reporting view, never payment records. */
export function usGoogleFinanceDay(usd: SourceFinanceDay, inr: SourceFinanceDay, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid reporting exchange rate.');
  const convert = (amount:number) => Math.round(amount/rate);
  const legacyTax = calculateProfitSheetGst((inr.received-inr.refund)/100, inr.date >= '2026-10-01' ? .18 : .05, 0).gst;
  const received = usd.received+convert(inr.received), refund = usd.refund+convert(inr.refund);
  return {...usd,received,refund,orders:usd.orders+inr.orders,refunds:usd.refunds+inr.refunds,
    bundleReceived:usd.bundleReceived+convert(inr.bundleReceived),bundleRefund:usd.bundleRefund+convert(inr.bundleRefund),
    bundleOrders:usd.bundleOrders+inr.bundleOrders,salesTax:usd.salesTax+convert(Math.round(legacyTax*100)),
    originalInrReceived:inr.received,originalInrRefund:inr.refund,originalInrOrders:inr.orders};
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
    // Each regional workspace shows its owning account only. Historical USA /discover receipts are read below.
    const reports = await Promise.all([account].map(async current => {
      let unknownRefundTime = false;
      let finance = await readAdSourceFinance(db,funnel,'google',start,end,'account_day',{
        timezone:current.timezone,
        include:(row)=>googleOrderAccount(row,campaigns)===current.id,
        unknownRefundTime:()=>{unknownRefundTime=true;},
      });
      let originalInr = new Map<string,SourceFinanceDay>();
      if (funnel === 'us-main') {
        const legacy = await readAdSourceFinance(db,'astrorekha','google',start,end,'account_day',{
          timezone:current.timezone,include:row=>googleOrderAccount(row,campaigns)===current.id,
          unknownRefundTime:()=>{unknownRefundTime=true;},
        });
        originalInr = new Map(legacy.map(day=>[day.date,day]));
        finance = finance.map(day=>usGoogleFinanceDay(day,originalInr.get(day.date)!,rate));
      }
      const accountToday = googleAccountDate(Date.now(),current.timezone);
      const rows = finance.filter(day=>day.date<=accountToday).map(day=>({ ...googleProfitRow(day,
        current.rows.find(row=>row.date===day.date)?.costMicros??null,current,funnel,rate,!unknownRefundTime),
        ...(originalInr.has(day.date)?{originalInrReceived:originalInr.get(day.date)!.received,
          originalInrRefund:originalInr.get(day.date)!.refund,originalInrOrders:originalInr.get(day.date)!.orders}:{}),
      }));
      const warnings = [current.error,unknownRefundTime?'Some matched refunds have no exact timestamp. Profit is unavailable for this account window.':null].filter(Boolean);
      return {rows,funnel,unassignedDates:[],unknownRefundTime,adSource:'google',dayMode:'google_account',account:current,exchangeRate:rate,
        sourceFetchedAt:fetchedAt,fetchedAt,updatedAt:fetchedAt,dateRange:{start,end:end<accountToday?end:accountToday},missingRanges:[],missing:[],revision:4,accountCount:1,
        unassignedOrderCount:0,attributionComplete:!unknownRefundTime,warnings,syncWarning:warnings.join(' ')||null};
    }));
    // Unmatched Google receipts remain visible separately and are never guessed into an account.
    const unmatchedCampaigns = new Set<string>();
    let unmatchedRefundTime = false;
    const unmatched = await readAdSourceFinance(db,funnel,'google',start,end,'account_day',{
      timezone:account.timezone,
      include:(row)=>{
        if(googleOrderAccount(row,campaigns)) return false;
        const tags = acquisitionTags(acquisitionTouch(row));
        unmatchedCampaigns.add(String(tags.google_campaign_id || tags.gad_campaignid || tags.utm_campaign || 'Not recorded'));
        return true;
      },
      unknownRefundTime:()=>{unmatchedRefundTime=true;},
    });
    const primary = reports.find(report=>report.account.id===id)!;
    const additionalReports = reports.filter(report=>report.account.id!==id &&
      (report.rows.some(row=>Number('orders' in row?row.orders:row.salesCount)>0 || Number('refund' in row?row.refund:row.refundAmount)>0) ||
       report.account.rows.some(row=>row.costMicros===null&&row.status!=='not_started'||Number(row.costMicros)>0)));
    return Response.json({...primary, additionalReports, unassigned:{
      timezone:account.timezone,currency:funnel.startsWith('us-')?'USD':'INR',campaigns:[...unmatchedCampaigns],
      rows:unmatched.filter(day=>day.orders||day.refunds),unknownRefundTime:unmatchedRefundTime,
    }});
  };
  try { return await cachedProfitReport(db,googleProfitCacheKey(funnel,id,start,end,suppliedRate),load,after,async(fresh,previous) => {
    const merge = (next: Record<string,unknown>, before: Record<string,unknown> | null): Record<string,unknown> & {additionalReports:Record<string,unknown>[]} => {
      const main = retainVerifiedGoogleProfit(next, before);
      const extras = (next.additionalReports || []) as Record<string,unknown>[];
      const oldExtras = (before?.additionalReports || []) as Record<string,unknown>[];
      return {...main,additionalReports:extras.map(report=>retainVerifiedGoogleProfit(report,
        oldExtras.find(old=>(old.account as {id:string}).id===(report.account as {id:string}).id)||null))};
    };
    let merged = merge(fresh, previous);
    const pending = () => [merged,...merged.additionalReports].some(report =>
      (report.account as {rows:Array<{costMicros:number|null;unavailableReason?:string;retainedAt?:string}>}).rows
        .some(row=>row.costMicros===null&&row.unavailableReason==='updating'));
    if (pending()) {
      const history = await db.from('admin_profit_report_cache').select('payload').eq('payload->>funnel',funnel)
        .eq('payload->>revision','4').eq('payload->>dayMode','google_account').eq('payload->account->>id',id).order('fetched_at',{ascending:false}).limit(50);
      for (const entry of history.data || []) {
        if (!pending()) break;
        merged = merge(merged, entry.payload);
      }
    }
    return merged;
  }); }
  catch { return Response.json({error:'Unable to load the Google account profit sheet. Please retry.'},{status:503}); }
}
