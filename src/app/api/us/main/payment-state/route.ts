import {NextRequest,NextResponse} from 'next/server';
import {ownerToken,ownerHash,ORDER_TABLE} from '@/lib/us-main/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
export async function GET(req:NextRequest){
 const token=ownerToken(req);if(!token)return NextResponse.json({hasPaidBundlePayment:false},{headers:{'Cache-Control':'no-store'}});
 try{const db=getSupabaseAdmin();let query=db.from(ORDER_TABLE).select('id,customer_email,bundle_id,user_id').eq('owner_hash',ownerHash(token)).eq('type','bundle').eq('payment_status','paid').not('fulfilled_at','is',null).order('paid_at',{ascending:false}).limit(1);
 const email=req.nextUrl.searchParams.get('email')?.trim().toLowerCase();if(email)query=query.eq('customer_email',email);
 const r=await query.maybeSingle();if(r.error)throw r.error;const o=r.data;
 const user=o?.user_id?await db.from('users').select('password_hash').eq('id',o.user_id).maybeSingle():null;
 return NextResponse.json({hasPaidBundlePayment:!!o,hasRegisteredAccount:!!user?.data?.password_hash,latestBundleId:o?.bundle_id||null,userId:o?.user_id||null,email:o?.customer_email||null,orderId:o?.id||null},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Unable to read US payment state'},{status:503});}
}
