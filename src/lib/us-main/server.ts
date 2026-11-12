import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { PaymentAttributionPayload } from '@/lib/attribution';
import {reportSessionUser} from '@/lib/report-session';
import type { UsPrices } from './catalog';
export const ORDER_TABLE = 'us_main_orders';
export type UsOrder = { id: string; owner_hash: string; user_id: string | null; customer_email: string; customer_name: string; type: 'bundle'|'upsell'|'report'|'coins'|'chat_pass'; bundle_id: string | null; amount_cents: number; paid_amount_cents?: number | null; currency: 'USD'; payment_mode: 'test'|'live'; payment_status: string; stripe_session_id: string|null; paid_at: string|null; fulfilled_at: string|null; created_at: string; parent_order_id: string|null; line_items: {id:string;name:string;cents:number}[]; fulfillment_features: string[]; fulfillment_coins: number; attribution: { testPromotion?: string; marketing: PaymentAttributionPayload; gaClientId?: string|null; gaSessionId?: string|null; trackingEnvironment: string; userAgent?: string }; };
export function enabled() { return process.env.US_MAIN_ENABLED === 'true'; }
export function stripeKey() {
  const key = process.env.US_MAIN_STRIPE_SECRET_KEY?.trim();
  if (!key || !/^sk_(test|live)_/.test(key)) throw new Error('US main Stripe credentials are not configured');
  return { key, mode: key.startsWith('sk_live_') ? 'live' as const : 'test' as const };
}
export async function stripe(path: string, body?: URLSearchParams, idempotencyKey?: string) {
  const { key } = stripeKey();
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Stripe path');
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2026-03-25.dahlia', ...(body ? {'Content-Type':'application/x-www-form-urlencoded'} : {}), ...(idempotencyKey ? {'Idempotency-Key':idempotencyKey} : {}) }, ...(body ? {body} : {}) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error('Stripe could not complete this request');
  return data;
}
export function ownerToken(req: NextRequest) { const token = req.cookies.get('ar_us_main_owner')?.value; return token && /^[a-f0-9]{64}$/.test(token) ? token : null; }
export function ownerHash(token: string) { return crypto.createHash('sha256').update(`us-main:${token}`).digest('hex'); }
export function setOwner(res: NextResponse, token: string) { res.cookies.set('ar_us_main_owner', token, {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/us/main',maxAge:30*86400}); return res; }
export function sameOrigin(req: NextRequest) {
  try {
    const origin=new URL(req.headers.get('origin') || '');
    if(origin.host !== req.headers.get('host')) return false;
    if(process.env.NODE_ENV!=='production' && ['localhost','127.0.0.1'].includes(origin.hostname)) return origin.protocol==='http:' || origin.protocol==='https:';
    return origin.origin===new URL(process.env.US_MAIN_APP_ORIGIN || 'https://astrorekha.com').origin;
  } catch { return false; }
}
export async function readOrder(id: string): Promise<UsOrder|null> {
  if (!/^us_ar_[a-f0-9]{24}$/.test(id)) return null;
  const r = await getSupabaseAdmin().from(ORDER_TABLE).select('*').eq('id',id).maybeSingle();
  if (r.error) throw new Error('US order storage unavailable');
  return r.data;
}
export async function ownedOrder(req: NextRequest, id: string) { const token = ownerToken(req),uid=reportSessionUser(req); if (!token&&!uid) return null; const o = await readOrder(id); return o && ((token&&o.owner_hash===ownerHash(token)) || (uid&&o.user_id===uid)) ? o : null; }
export async function readPrices(): Promise<UsPrices> {
  const r = await getSupabaseAdmin().from('us_main_settings').select('value').eq('key','prices_usd_cents').maybeSingle();
  if (r.error) throw new Error('US pricing storage unavailable');
  const prices = r.data?.value || {};
  return prices;
}
// URLs come from the configured app origin, never from payment/browser query parameters.
export function checkoutOrigin(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production' && sameOrigin(req)) {
    const origin=new URL(req.headers.get('origin')!);
    if(['localhost','127.0.0.1'].includes(origin.hostname)) return origin.origin;
  }
  const origin = process.env.US_MAIN_APP_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:') throw new Error('US checkout origin unavailable');
  return new URL(origin).origin;
}
