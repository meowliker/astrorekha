import {createHash} from 'crypto';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
export function experimentVariant(id:string,owner:string){return parseInt(createHash('sha256').update(`${id}:${owner}`).digest('hex').slice(0,8),16)%2===0?'A':'B';}
export async function usExperiment(owner:string,record=false){
 // Experiment storage must never block checkout if unavailable.
 try{const db=getSupabaseAdmin(),env=process.env.VERCEL_ENV||'local';const r=await db.from('us_main_experiments').select('id,bundle_a,bundle_b').eq('status','active').maybeSingle();if(r.error||!r.data)return null;
 const experiment=r.data;const variant=experimentVariant(experiment.id,owner);
 if(record){const saved=await db.from('us_main_experiment_assignments').upsert({experiment_id:experiment.id,owner_hash:owner,variant,environment:env},{onConflict:'experiment_id,owner_hash,environment',ignoreDuplicates:true});if(saved.error)return null;}
 else {const seen=await db.from('us_main_experiment_assignments').select('variant').eq('experiment_id',experiment.id).eq('owner_hash',owner).eq('environment',env).maybeSingle();if(seen.error||!seen.data)return null;}
 return {experimentId:experiment.id,variant,defaultBundle:variant==='A'?experiment.bundle_a:experiment.bundle_b};
 }catch{return null;}
}
