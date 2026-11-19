import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { refreshBalances } from '@/lib/account-balances';
import { balanceSchedule } from '@/lib/account-balances-types';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  if (!balanceSchedule(now)) return NextResponse.json({ error: 'Outside scheduled window' }, { status: 409 });
  try { const db = getSupabaseAdmin({ fresh: true }); const result = await refreshBalances(db, true, now);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Balance update failed' }, { status: 503 }); }
}
