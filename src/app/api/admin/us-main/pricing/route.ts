import {NextRequest,NextResponse} from 'next/server';
import {withAdminAccess,readAdminAccess} from '@/lib/admin-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {readPrices} from '@/lib/us-main/server';
import {usCatalog} from '@/lib/us-main/catalog';
import {accountCatalog} from '@/lib/us-main/account-catalog';
async function read(){const prices=await readPrices();return {prices,products:[...usCatalog(prices),...accountCatalog(prices)]};}
async function get(){const audit=await getSupabaseAdmin().from('us_main_admin_audit').select('actor_id,created_at,action').eq('action','pricing').order('created_at',{ascending:false}).limit(10);if(audit.error)throw audit.error;return NextResponse.json({...await read(),audit:audit.data});}
async function put(req:NextRequest){const b=await req.json(),current=await read(),actor=await readAdminAccess(req);
 if(!b.prices||typeof b.prices!=='object'||Array.isArray(b.prices)||!b.expected)return NextResponse.json({error:'Invalid price list'},{status:400});
 const keys=new Set(current.products.map(p=>p.id));const changes=Object.entries(b.prices);
 if(changes.some(([k,v])=>!keys.has(k)||!Number.isSafeInteger(v)||Number(v)<50||Number(v)>100000))return NextResponse.json({error:'Use a valid USD price from $0.50 to $1,000.00.'},{status:400});
 const prices={...current.prices,...b.prices};const result=await getSupabaseAdmin().rpc('save_us_main_prices',{p_actor:actor!.id,p_expected:b.expected,p_prices:prices});if(result.error)return NextResponse.json({error:'Prices changed or could not be saved. Reload and try again.'},{status:409});return NextResponse.json({success:true,...await read()});}
export const GET=withAdminAccess(get);export const PUT=withAdminAccess(put);
