import {getSupabaseAdmin} from '@/lib/supabase-admin';
export type CustomerMarket='IN'|'US';
/** No IP/currency/browser override: this decision belongs to the authenticated account. */
export async function customerMarket(userId:string):Promise<CustomerMarket>{
 const {data,error}=await getSupabaseAdmin().from('customer_markets').select('market').eq('user_id',userId).maybeSingle();
 if(error)throw new Error('Account pricing is unavailable');
 return data?.market==='US'?'US':'IN';
}
export async function activeUsChatPass(userId:string){
 const {data,error}=await getSupabaseAdmin().from('us_main_chat_passes').select('order_id,starts_at,ends_at').eq('user_id',userId).gt('ends_at',new Date().toISOString()).order('ends_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error('US chat pass lookup failed');
 if(!data)return null;
 return {id:data.order_id,payuTxnId:null,startedAt:data.starts_at,endsAt:data.ends_at,remainingSeconds:Math.max(0,Math.floor((Date.parse(data.ends_at)-Date.now())/1000))};
}
