import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
export const PURCHASE_RESET_COOKIE = 'ar_purchase_reset';
export function hashSecret(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function normalizePurchaseCode(code: unknown) { return typeof code === 'string' ? code.replace(/[\s-]/g, '').toUpperCase() : ''; }
export function purchaseCode(id: string, nonce: string) {
    const secret = process.env.PURCHASE_RECOVERY_CODE_SECRET || process.env.REPORT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret)
        throw new Error('Recovery signing is not configured');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = createHmac('sha256', secret).update(`purchase-access:v2:${id}:${nonce}`).digest();
    return Array.from(bytes.subarray(0, 8), byte => alphabet[byte & 31]).join('');
}
export function freshGrant() { return randomBytes(32).toString('hex'); }
export function setPasswordGrant(res: NextResponse, token: string) { res.cookies.set(PURCHASE_RESET_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth/purchase-access', maxAge: 15 * 60 }); return res; }
export function clearPasswordGrant(res: NextResponse) { res.cookies.set(PURCHASE_RESET_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth/purchase-access', maxAge: 0 }); return res; }
export function sameOrigin(req: NextRequest) {
    if (req.headers.get('sec-fetch-site') === 'cross-site')
        return false;
    try {
        const origin = new URL(req.headers.get('origin') || '');
        // Next.js dev may normalize 127.0.0.1 to localhost in nextUrl.
        const host = req.headers.get('host') || req.nextUrl.host;
        return origin.host === host && origin.protocol === req.nextUrl.protocol;
    }
    catch {
        return false;
    }
}
export function attemptIpHash(req: NextRequest) {
    // Vercel sets this header; do not trust arbitrary x-forwarded-for chains.
    const ip = process.env.VERCEL_ENV === 'production' ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown' : 'local';
    return hashSecret(`purchase-access-ip:${ip}`);
}
