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
  // Refreshing the sheet must never send messages. The 15-minute cron delivers alerts.
  try { return NextResponse.json(await refreshBalances(db)); }
  catch { return NextResponse.json({ error: 'Refresh could not be completed. Saved balances have been retained.' }, { status: 503 }); }
}, 'administrator');
