import { createHash } from 'node:crypto';
import { after, type NextRequest } from 'next/server';
import { withAdminAccess } from '@/lib/admin-access';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { cachedProfitReport } from '@/lib/profit-report-cache';
import { loadConsolidatedProfit } from '@/lib/consolidated-profit-data';
import { countryTimezone, countryDate, retainConsolidatedSpend, type ConsolidatedReport } from '@/lib/consolidated-profit';
import { validateGoogleRange } from '@/lib/google-ads-reporting';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const GET = withAdminAccess(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const country = params.get('country');
  if (country !== 'india' && country !== 'us') return Response.json({error:'Choose India or US.'},{status:400});
  const start = params.get('start') || '', end = params.get('end') || '';
  try {
    validateGoogleRange(start,end);
    if (start<'2026-10-01' || end>countryDate(new Date(),country)) throw new Error('Choose dates from 1 October 2026 through the current reporting day.');
  } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  const db = getSupabaseAdmin({fresh:true});
  const key = createHash('sha256').update(JSON.stringify(['consolidated-profit-v4',country,start,end,countryTimezone(country)])).digest('hex');
  return cachedProfitReport(db,key,async()=>Response.json(await loadConsolidatedProfit(db,country,start,end)),after,
    (fresh,previous)=>retainConsolidatedSpend(fresh as unknown as ConsolidatedReport,previous as unknown as ConsolidatedReport|null) as unknown as Record<string,unknown>);
}, 'administrator');
