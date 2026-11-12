import {isCustomerAccountPath} from '@/lib/customer-account-path';
import {reportSessionUser} from '@/lib/report-session';
import {customerMarket} from '@/lib/customer-market';
import {NextRequest,NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {sameOrigin} from '@/lib/us-main/server';
import {sanitizePaymentAttribution} from '@/lib/attribution';
export async function POST(req:NextRequest){if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});try{
 if(Number(req.headers.get('content-length')||0)>12000)return NextResponse.json({error:'Too large'},{status:413});
 const b=await req.json();if(!['page_view','product_offer_view','quiz_start','quiz_complete','email_submitted','begin_checkout','chat_unlimited_offer_shown','chat_unlimited_offer_dismissed','chat_unlimited_offer_checkout_started'].includes(b.eventName)||typeof b.path!=='string'||!(/^\/us(?:$|\/onboarding(?:\/|$)|\/payment$)/.test(b.path)||isCustomerAccountPath(b.path))||b.path.length>256||!/^[-a-f0-9]{36}$/.test(b.eventId||'')||!/^[-a-f0-9]{36}$/.test(b.sessionId||''))return NextResponse.json({error:'Invalid event'},{status:400});
 const uid=reportSessionUser(req);
 if(!b.path.startsWith('/us')){if(!uid||await customerMarket(uid)!=='US')return NextResponse.json({error:'US account required'},{status:403});}
 const db=getSupabaseAdmin();const {count,error}=await db.from('us_main_events').select('id',{count:'exact',head:true}).eq('session_id',b.sessionId).gte('created_at',new Date(Date.now()-3600000).toISOString());if(error)throw error;if((count||0)>200)return NextResponse.json({error:'Rate limit'},{status:429});
 const r=await db.from('us_main_events').upsert({event_id:b.eventId,event_name:b.eventName,user_id:uid,product_type:typeof b.productType==='string'?b.productType.slice(0,40):null,product_id:typeof b.productId==='string'?b.productId.slice(0,100):null,path:b.path,session_id:b.sessionId,attribution:sanitizePaymentAttribution(b.attribution),environment:process.env.VERCEL_ENV||'local'},{onConflict:'event_id',ignoreDuplicates:true});if(r.error)throw r.error;return NextResponse.json({success:true});}catch{return NextResponse.json({error:'Tracking unavailable'},{status:503});}}
