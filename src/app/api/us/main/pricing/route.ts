import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { usPricing, usCatalog, INTRO_PRICES } from '@/lib/us-main/catalog';
import { readPrices, enabled, ownerToken, setOwner } from '@/lib/us-main/server';
export async function GET(req: NextRequest) {
 const token = ownerToken(req) || crypto.randomBytes(32).toString('hex');
 try {
  const prices = await readPrices();
  return setOwner(NextResponse.json({success:true,pricing:usPricing(prices),catalog:usCatalog(prices),enabled:enabled()},{headers:{'Cache-Control':'private, no-store'}}),token);
 } catch {
  // Local UI preview is available before the migration. Never enable checkout without the DB.
  const prices = process.env.NODE_ENV === 'development' ? INTRO_PRICES : {};
  return setOwner(NextResponse.json({success:false,pricing:usPricing(prices),catalog:usCatalog(prices),enabled:false},{headers:{'Cache-Control':'private, no-store'}}),token);
 }
}
