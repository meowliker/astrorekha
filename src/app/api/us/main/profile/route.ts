import {NextRequest,NextResponse} from 'next/server';
import {reportSessionUser} from '@/lib/report-session';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {birthSnapshotToDbFields,normalizeBirthDetailsSnapshot} from '@/lib/birth-details';
import {sameOrigin} from '@/lib/us-main/server';
/** Saves report inputs only for an authenticated, fulfilled US-main customer. */
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
 const uid=reportSessionUser(req);if(!uid)return NextResponse.json({error:'Sign in required'},{status:401});
 try{
  const raw=await req.text();if(raw.length>8000000)return NextResponse.json({error:'Photo too large'},{status:413});
  const b=JSON.parse(raw),db=getSupabaseAdmin();
  const paid=await db.from('us_main_orders').select('customer_email').eq('user_id',uid).not('fulfilled_at','is',null).limit(1).maybeSingle();
  if(paid.error||!paid.data)return NextResponse.json({error:'US purchase required'},{status:403});
  const fields=birthSnapshotToDbFields(normalizeBirthDetailsSnapshot({...b,sunSign:null,moonSign:null,ascendantSign:null},'us_main'));
  const palm=typeof b.palmImage==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.palmImage)?b.palmImage:null;
  const saved=await db.from('user_profiles').upsert({id:uid,email:paid.data.customer_email,...fields,goals:Array.isArray(b.goals)?b.goals.filter((x:unknown)=>typeof x==='string').slice(0,20):[],...(palm?{palm_image:palm}:{}),updated_at:new Date().toISOString()},{onConflict:'id'});
  if(saved.error)throw saved.error;
  return NextResponse.json({success:true});
 }catch{return NextResponse.json({error:'Unable to save report details. Please retry.'},{status:503});}
}
