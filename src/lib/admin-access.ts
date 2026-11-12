import {NextRequest,NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {canAccess,workspaceForPath,type AdminAccess} from './admin-workspaces';
export const ADMIN_COOKIE='ar_admin_session';
export function adminToken(req:NextRequest){return req.headers.get('x-admin-session')||req.headers.get('authorization')?.replace(/^Bearer /,'')||req.cookies.get(ADMIN_COOKIE)?.value||'';}
export async function readAdminAccess(req:NextRequest):Promise<AdminAccess|null>{
 const token=adminToken(req);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const db=getSupabaseAdmin({fresh:true});
 const {data:session,error}=await db.from('admin_sessions').select('admin_id,expires_at').eq('id',token).maybeSingle();
 if(error)throw new Error('Access service unavailable');
 if(!session||!Number.isFinite(Date.parse(session.expires_at))||Date.parse(session.expires_at)<=Date.now())return null;
 const {data:member,error:me}=await db.from('admin_workspace_members').select('admin_id,is_administrator,active,workspaces').eq('admin_id',session.admin_id).maybeSingle();
 if(me)throw new Error('Workspace access is not configured');
 if(!member?.active)return null;
 return {id:member.admin_id,name:member.admin_id,isAdministrator:member.is_administrator,workspaces:member.workspaces};
}
export function withAdminAccess<A extends unknown[]>(handler:(req:NextRequest,...args:A)=>Promise<Response>, scope?:ReturnType<typeof workspaceForPath>){
 return async(req:NextRequest,...args:A)=>{
  try{
   const access=await readAdminAccess(req);
   if(!access)return NextResponse.json({error:'Sign in to admin'},{status:401});
   if(!canAccess(access,scope===undefined?workspaceForPath(req.nextUrl.pathname):scope))return NextResponse.json({error:'You do not have access to this workspace'},{status:403});
   // Cookie-backed mutations require a same-origin browser request. Bearer clients remain supported.
   if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!req.headers.get('authorization')&&!req.headers.get('x-admin-session')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
   const headers=new Headers(req.headers),token=adminToken(req);headers.set('x-admin-session',token);headers.set('authorization',`Bearer ${token}`);
   const response=await handler(new NextRequest(req.url,{headers,method:req.method,...(!['GET','HEAD'].includes(req.method)?{body:req.body}:{} )}),...args);
   response.headers.set('Cache-Control','private, no-store');return response;
  }catch(error){console.error('[admin access]',error instanceof Error?error.message:'failed');return NextResponse.json({error:'Admin service unavailable. Please retry.'},{status:503});}
 };
}
