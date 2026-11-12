import crypto from 'crypto';
import {NextRequest,NextResponse} from 'next/server';
import {reportSessionUser} from '@/lib/report-session';
import {customerMarket} from '@/lib/customer-market';
import {accountCatalog} from '@/lib/us-main/account-catalog';
import {readPrices,ownerToken,setOwner,enabled} from '@/lib/us-main/server';
export async function GET(req:NextRequest){
 const userId=reportSessionUser(req);
 if(!userId)return NextResponse.json({error:'Please sign in to load your account prices.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
 try{
  const market=await customerMarket(userId);
  const response=NextResponse.json({userId,market,currency:market==='US'?'USD':'INR',enabled:market==='US'?enabled():true,products:market==='US'?accountCatalog(await readPrices()):[]},{headers:{'Cache-Control':'private, no-store'}});
  return market==='US'?setOwner(response,ownerToken(req)||crypto.randomBytes(32).toString('hex')):response;
 }catch{return NextResponse.json({error:'Account prices could not be loaded. Please refresh.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
