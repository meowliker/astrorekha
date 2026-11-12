import {withAdminAccess} from "@/lib/admin-access";
import {NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {reconcileUsOrder} from '@/lib/us-main/reconcile';
async function handlePOST(){
 const db=getSupabaseAdmin();
 const {data,error}=await db.from('us_main_orders').select('*').eq('payment_mode','live').eq('attribution->>trackingEnvironment','production').in('payment_status',['created','pending']).not('stripe_session_id','is',null).gte('created_at',new Date(Date.now()-86400000).toISOString()).order('checked_at',{ascending:true,nullsFirst:true}).limit(3);
 if(error)return NextResponse.json({error:'Unable to check US orders'},{status:503});
 let recovered=0;for(const order of data){const result=await reconcileUsOrder(order);if(result.payment_status==='paid')recovered++;}
 return NextResponse.json({checked:data.length,recovered});
}

export const POST=withAdminAccess(handlePOST);
