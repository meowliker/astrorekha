import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { reportSessionUser } from '@/lib/report-session';
import { PURCHASE_RESET_COOKIE, hashSecret } from '@/lib/purchase-access/security';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest) {
    const userId = reportSessionUser(req), token = req.cookies.get(PURCHASE_RESET_COOKIE)?.value;
    if (!userId || !token || !/^[a-f0-9]{64}$/.test(token))
        return NextResponse.json({ verified: false }, { headers });
    try {
        const r = await getSupabaseAdmin().from('purchase_password_grants').select('user_id').eq('token_hash', hashSecret(token)).eq('user_id', userId).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
        if (r.error)
            throw r.error;
        return NextResponse.json({ verified: !!r.data }, { headers });
    }
    catch {
        return NextResponse.json({ error: 'Unable to check your recovery session. Please retry.' }, { status: 503, headers });
    }
}
