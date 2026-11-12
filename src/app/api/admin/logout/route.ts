import {NextRequest,NextResponse} from 'next/server';
import {adminToken,ADMIN_COOKIE} from '@/lib/admin-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
export async function POST(req:NextRequest){if(!req.headers.get('x-admin-session')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});const token=adminToken(req);if(token){const r=await getSupabaseAdmin().from('admin_sessions').delete().eq('id',token);if(r.error)return NextResponse.json({error:'Unable to sign out'},{status:503});}const r=NextResponse.json({success:true});r.cookies.delete(ADMIN_COOKIE);return r;}
