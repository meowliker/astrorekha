import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { reportSessionUser } from '@/lib/report-session';
import { PURCHASE_RESET_COOKIE, clearPasswordGrant, hashSecret, sameOrigin } from './security';
export async function finishPurchaseAccess(req: NextRequest, changePassword: boolean) {
    const headers = { 'Cache-Control': 'private, no-store' };
    if (!sameOrigin(req))
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers });
    const uid = reportSessionUser(req), grant = req.cookies.get(PURCHASE_RESET_COOKIE)?.value;
    if (!uid || !grant || !/^[a-f0-9]{64}$/.test(grant))
        return NextResponse.json({ error: 'Verify your confirmation code first.' }, { status: 401, headers });
    try {
        let hash: string | null = null;
        if (changePassword) {
            const raw = await req.text();
            if (raw.length > 2048)
                return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers });
            const { newPassword, confirmPassword } = JSON.parse(raw);
            if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72)
                return NextResponse.json({ error: 'Use at least 8 characters and no more than 72 bytes.' }, { status: 400, headers });
            if (newPassword !== confirmPassword)
                return NextResponse.json({ error: 'The passwords do not match.' }, { status: 400, headers });
            // Check the short-lived proof before spending work on the password hash.
            const proof = await getSupabaseAdmin().from('purchase_password_grants').select('user_id').eq('token_hash', hashSecret(grant)).eq('user_id', uid).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
            if (proof.error)
                throw proof.error;
            if (!proof.data)
                return clearPasswordGrant(NextResponse.json({ error: 'This password setup session ended. Your reports are still available; use Forgot password to set a password later.' }, { status: 409, headers }));
            hash = await bcrypt.hash(newPassword, 12);
        }
        const result = await getSupabaseAdmin().rpc('finish_purchase_password', { p_user: uid, p_grant_hash: hashSecret(grant), p_password_hash: hash });
        if (result.error)
            throw result.error;
        if (!result.data)
            return clearPasswordGrant(NextResponse.json({ error: 'This password setup session ended. You can still open your reports.' }, { status: 409, headers }));
        return clearPasswordGrant(NextResponse.json({ success: true }, { headers }));
    }
    catch {
        return NextResponse.json({ error: 'Unable to save your choice. Please retry.' }, { status: 503, headers });
    }
}
