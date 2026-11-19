import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkBalanceAdditions } from '@/lib/account-balances';
import { deliverBalanceAdditionAlerts } from '@/lib/account-balance-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin({ fresh: true });
    const result = await checkBalanceAdditions(db);
    const alerts = await deliverBalanceAdditionAlerts(db);
    return NextResponse.json({ ...result, alerts }, {
      status: result.failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Balance addition check failed' }, { status: 503 });
  }
}
