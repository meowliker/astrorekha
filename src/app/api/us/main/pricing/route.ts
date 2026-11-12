import {usExperiment} from '@/lib/us-main/experiments';
import {ownerHash} from '@/lib/us-main/server';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { usPricing, usCatalog, INTRO_PRICES } from '@/lib/us-main/catalog';
import { readPrices, enabled, ownerToken, setOwner } from '@/lib/us-main/server';
export async function GET(req: NextRequest) {
 const token = ownerToken(req) || crypto.randomBytes(32).toString('hex');
 try {
  const prices = await readPrices();
  const experiment=req.nextUrl.searchParams.get("experiment")==="paywall"?await usExperiment(ownerHash(token),true):null;
  return setOwner(NextResponse.json({success:true,defaultBundle:experiment?.defaultBundle||null,pricing:usPricing(prices),catalog:usCatalog(prices),enabled:enabled()},{headers:{'Cache-Control':'private, no-store'}}),token);
 } catch {
  // Local UI preview is available before the migration. Never enable checkout without the DB.
  const prices = process.env.NODE_ENV === 'development' ? INTRO_PRICES : {};
  return setOwner(NextResponse.json({success:false,pricing:usPricing(prices),catalog:usCatalog(prices),enabled:false},{headers:{'Cache-Control':'private, no-store'}}),token);
 }
}
