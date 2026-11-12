import {NextRequest,NextResponse} from 'next/server';
import bcrypt from 'bcryptjs';
import {ownerToken,ownerHash,ORDER_TABLE,sameOrigin} from '@/lib/us-main/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {setReportSession} from '@/lib/report-session';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
 try{const body=await req.json(),token=ownerToken(req),email=String(body.email||'').trim().toLowerCase(),password=body.password;
 if(!token)return NextResponse.json({error:'Purchase access required'},{status:403});
 if(typeof password!=='string'||password.length<8||Buffer.byteLength(password,'utf8')>72||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||!/[!@#$%^&*(),.?":{}|<>]/.test(password))return NextResponse.json({message:'Use at least 8 characters with uppercase, lowercase, number and special character.'},{status:400});
 const db=getSupabaseAdmin(),r=await db.from(ORDER_TABLE).select('user_id').eq('owner_hash',ownerHash(token)).eq('customer_email',email).eq('type','bundle').not('fulfilled_at','is',null).order('paid_at',{ascending:false}).limit(1).maybeSingle();
 if(r.error||!r.data?.user_id)return NextResponse.json({error:'Verified purchase required'},{status:403});
 const result=await db.from('users').update({password_hash:await bcrypt.hash(password,12),updated_at:new Date().toISOString()}).eq('id',r.data.user_id).eq('email',email).is('password_hash',null).select('id,email,coins,unlocked_features,bundle_purchased').maybeSingle();
 if(result.error)throw result.error;if(!result.data)return NextResponse.json({error:'auth/email-already-in-use',message:'An account with this email already exists. Please log in.'},{status:409});
 const u=result.data;return setReportSession(NextResponse.json({success:true,user:{id:u.id,email:u.email,coins:u.coins,unlockedFeatures:u.unlocked_features,bundlePurchased:u.bundle_purchased}}),u.id);
 }catch{return NextResponse.json({message:'Unable to finish registration. Please try again.'},{status:503});}
}
