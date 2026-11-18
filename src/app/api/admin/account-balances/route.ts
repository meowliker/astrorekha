import { deliverBalanceAdditionAlerts } from '@/lib/account-balance-alerts';
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAccess } from '@/lib/admin-access';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getBalancesView, refreshBalances } from '@/lib/account-balances';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const GET = withAdminAccess(async () => {
  try { return NextResponse.json(await getBalancesView(getSupabaseAdmin({ fresh: true }))); }
  catch { return NextResponse.json({ error: 'Balances could not be loaded. Check the connection and account-balances migration.' }, { status: 503 }); }
}, 'administrator');
export const POST = withAdminAccess(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || body.action !== 'refresh') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const db = getSupabaseAdmin({ fresh: true });
  try { const result = await refreshBalances(db);
    const alerts = await deliverBalanceAdditionAlerts(db).catch(() => ({ error: 'Balance saved; Slack delivery deferred' }));
    return NextResponse.json({ ...result, alerts }); }
  catch { return NextResponse.json({ error: 'Refresh could not be completed. Saved balances have been retained.' }, { status: 503 }); }
}, 'administrator');
