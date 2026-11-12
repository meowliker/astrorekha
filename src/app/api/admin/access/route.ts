import bcrypt from "bcryptjs";
import {withAdminAccess} from "@/lib/admin-access";
import {NextRequest,NextResponse} from 'next/server';
import {readAdminAccess} from '@/lib/admin-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {WORKSPACES} from '@/lib/admin-workspaces';
async function handleGET(){const db=getSupabaseAdmin();const [members,audit]=await Promise.all([db.from('admin_workspace_members').select('admin_id,is_administrator,active,workspaces,updated_at').order('admin_id'),db.from('admin_access_audit').select('actor_id,target_id,before_state,after_state,created_at').order('created_at',{ascending:false}).limit(30)]);if(members.error||audit.error)throw new Error('Unable to load access');return NextResponse.json({members:members.data,audit:audit.data});}
async function handlePUT(req:NextRequest){const actor=await readAdminAccess(req);if(!actor?.isAdministrator)return NextResponse.json({error:'Administrator required'},{status:403});const b=await req.json();if(typeof b.adminId!=='string'||typeof b.active!=='boolean'||!Array.isArray(b.workspaces)||b.workspaces.some((x:unknown)=>typeof x!=='string'||!Object.hasOwn(WORKSPACES,x)))return NextResponse.json({error:'Invalid access settings'},{status:400});const result=await getSupabaseAdmin().rpc('set_admin_workspace_access',{p_actor:actor.id,p_target:b.adminId,p_active:b.active,p_workspaces:[...new Set(b.workspaces)]});if(result.error)return NextResponse.json({error:'Unable to change access. Administrator access cannot be removed.'},{status:400});return NextResponse.json({success:true});}

export const GET=withAdminAccess(handleGET);
export const PUT=withAdminAccess(handlePUT);

async function handlePOST(req:NextRequest){const actor=await readAdminAccess(req),b=await req.json();if(!actor?.isAdministrator)return NextResponse.json({error:'Administrator required'},{status:403});if(typeof b.adminId!=='string'||!/^[A-Za-z0-9_.-]{3,50}$/.test(b.adminId)||typeof b.password!=='string'||b.password.length<12||b.password.length>128||!Array.isArray(b.workspaces)||b.workspaces.some((x:unknown)=>typeof x!=='string'||!Object.hasOwn(WORKSPACES,x)))return NextResponse.json({error:'Use a 3–50 character admin ID and a password of at least 12 characters.'},{status:400});const result=await getSupabaseAdmin().rpc('create_workspace_admin',{p_actor:actor.id,p_id:b.adminId,p_hash:await bcrypt.hash(b.password,12),p_workspaces:[...new Set(b.workspaces)]});if(result.error)return NextResponse.json({error:'Unable to create admin. The ID may already exist.'},{status:409});return NextResponse.json({success:true});}
export const POST=withAdminAccess(handlePOST);
