import {filterSourceEvents,parseAdSource} from "@/lib/admin-acquisition";
import {NextRequest,NextResponse} from 'next/server';
import {withAdminAccess} from '@/lib/admin-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {resolveRevenueRange,istDate,shiftDate} from '@/lib/revenue-dashboard';
async function handle(req:NextRequest){const q=req.nextUrl.searchParams;let range;try{range=resolveRevenueRange(q.get('start')||shiftDate(istDate(new Date()),-6),q.get('end')||istDate(new Date()));}catch{return NextResponse.json({error:'Invalid date range'},{status:400});}
 const db=getSupabaseAdmin(),rows:Record<string,{path:string;views:number;sessions:Set<string>}>={},events:Record<string,{name:string;count:number;sessions:Set<string>}>={};const sessions=new Set<string>();let total=0;const allEvents: {id:string;event_name:string;path:string;session_id:string;attribution:Record<string,unknown>}[]=[];
 for(let offset=0;;offset+=1000){const r=await db.from('us_main_events').select('id,event_name,path,session_id,attribution').eq('environment','production').gte('created_at',range.from).lt('created_at',range.to).order('id').range(offset,offset+999);if(r.error)throw r.error;allEvents.push(...r.data);if(r.data.length<1000)break;if(offset>=99000)throw new Error('Choose fewer dates');}
 for(const e of filterSourceEvents(allEvents,parseAdSource(q))){total++;sessions.add(e.session_id);const event=events[e.event_name]||={name:e.event_name,count:0,sessions:new Set()};event.count++;event.sessions.add(e.session_id);if(e.event_name==='page_view'){const row=rows[e.path]||={path:e.path,views:0,sessions:new Set()};row.views++;row.sessions.add(e.session_id);}}
 return NextResponse.json({range,total,sessions:sessions.size,pages:Object.values(rows).map(r=>({...r,sessions:r.sessions.size})).sort((a,b)=>b.views-a.views),events:Object.values(events).map(r=>({...r,sessions:r.sessions.size})).sort((a,b)=>b.count-a.count)});
}
export const GET=withAdminAccess(handle);
