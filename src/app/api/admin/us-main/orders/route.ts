import {parseAdSource,matchesAdSource,acquisitionChannel,acquisitionTouch,isAcquisitionTest} from "@/lib/admin-acquisition";
import {withAdminAccess} from "@/lib/admin-access";
import { NextRequest,NextResponse } from 'next/server';
import { soulmateAdmin } from '@/lib/us-soulmate-admin';
async function handleGET(req:NextRequest) {
 const db=await soulmateAdmin(req);if(!db)return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const q=req.nextUrl.searchParams, adSource=parseAdSource(q), mode=q.get('mode')==='test'?'test':'live';
  const environment=['local','preview'].includes(q.get('environment')||'')?q.get('environment')!:'production';
  const from=q.get('from')||new Date(Date.now()-30*86400000).toISOString().slice(0,10), to=q.get('to')||new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to)return NextResponse.json({error:'Invalid dates'},{status:400});
  const end=new Date(Date.parse(to)+86400000).toISOString(),start=new Date(from).toISOString();
  const page=Math.max(0,Math.min(10000,Number(q.get('page'))||0));
  let query=db.from('us_main_orders').select('id,customer_name,customer_email,type,bundle_id,amount_cents,paid_amount_cents,payment_mode,payment_status,created_at,paid_at,fulfilled_at,line_items,attribution,stripe_payment_id,meta_purchase_sent_at,ga_purchase_sent_at',{count:'exact'}).eq('payment_mode',mode).eq('attribution->>trackingEnvironment',environment).gte('created_at',start).lt('created_at',end).order('created_at',{ascending:false});
  const search=(q.get('search')||'').replace(/[^a-zA-Z0-9@._ -]/g,'').slice(0,100);
  if(search)query=query.or(`customer_email.ilike.%${search}%,id.ilike.%${search}%,customer_name.ilike.%${search}%`);
  if(adSource==='all') {
   const [orders,summary]=await Promise.all([query.range(page*50,page*50+49),db.rpc('us_main_summary',{p_from:start,p_to:end,p_mode:mode,p_environment:environment})]);
   if(orders.error||summary.error)throw new Error('US storage unavailable');
   return NextResponse.json({orders:orders.data?.map(row=>({...row,ad_source:isAcquisitionTest(row)?"test":acquisitionChannel(acquisitionTouch(row))})),total:orders.count,summary:summary.data,currency:'USD',timezone:'UTC'});
  }
  const matches=[];
  for(let offset=0;;offset+=1000){const result=await query.range(offset,offset+999);if(result.error)throw result.error;matches.push(...result.data.filter(row=>matchesAdSource(row,adSource)));if(result.data.length<1000)break;if(offset>=99000)throw new Error('Choose fewer dates');}
  let paidOrders=0,grossCents=0;
  for(let offset=0;;offset+=1000){const result=await db.from('us_main_orders').select('id,attribution,amount_cents,paid_amount_cents').eq('payment_mode',mode).eq('attribution->>trackingEnvironment',environment).eq('payment_status','paid').gte('paid_at',start).lt('paid_at',end).order('id').range(offset,offset+999);if(result.error)throw result.error;for(const row of result.data)if(matchesAdSource(row,adSource)){paidOrders++;grossCents+=row.paid_amount_cents??row.amount_cents;}if(result.data.length<1000)break;if(offset>=99000)throw new Error('Choose fewer dates');}
  return NextResponse.json({orders:matches.slice(page*50,page*50+50).map(row=>({...row,ad_source:isAcquisitionTest(row)?"test":acquisitionChannel(acquisitionTouch(row))})),total:matches.length,summary:{paidOrders,grossCents,visits:null},currency:'USD',timezone:'UTC'});
 }catch{return NextResponse.json({error:'US main data is unavailable. Check that its database migration has been applied.'},{status:503});}
}

export const GET=withAdminAccess(handleGET);
