import {NextRequest,NextResponse} from 'next/server';
import {withAdminAccess} from '@/lib/admin-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {resolveRevenueRange,istDate,shiftDate} from '@/lib/revenue-dashboard';
import {filterAndSortOrders} from '@/lib/revenue-table';
import {usRevenueReport} from '@/lib/us-main-admin-revenue';
export const maxDuration=120;
async function handle(req:NextRequest){
 const q=req.nextUrl.searchParams;let range;
 try{range=resolveRevenueRange(q.get('startDate')||shiftDate(istDate(new Date()),-6),q.get('endDate')||istDate(new Date()));}catch{return NextResponse.json({error:'Choose valid dates'},{status:400});}
 const result=await usRevenueReport(getSupabaseAdmin(),range);
 if(q.has('snapshot')&&q.get('snapshot')!==result.snapshot)return NextResponse.json({error:'Records changed. Refresh before exporting.'},{status:409});
 const filtered=filterAndSortOrders(result.orders,q),limit=Math.min(2000,Math.max(1,Math.floor(Number(q.get('orderLimit'))||50))),offset=Math.max(0,Math.floor(Number(q.get('orderOffset'))||0));
 return NextResponse.json({...result,orders:filtered.slice(offset,offset+limit),orderPage:{total:filtered.length,limit,offset}});
}
export const GET=withAdminAccess(handle);export const POST=withAdminAccess(handle);
