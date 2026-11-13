begin;
-- Keeps app-side polling and stale questionnaire uploads from overwriting a support recovery.
alter table public.soulmate_sketches add column if not exists support_recovery_action_id uuid references public.support_actions(id);
create or replace function public.support_prepare_sketch_correction(p_action uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a support_actions%rowtype; s soulmate_sketches%rowtype; u users%rowtype; merged jsonb;
begin
 select * into a from support_actions where id=p_action for update;
 if not found or a.kind<>'correct_sketch' or a.status<>'running' then raise exception 'Invalid sketch correction action'; end if;
 if not exists(select 1 from support_staff where id=a.actor_id and active) then raise exception 'Staff access revoked'; end if;
 select * into u from users where id=a.customer_id for update;
 if not found or coalesce((u.unlocked_features->>'soulmateSketch')::boolean,false)=false then raise exception 'Sketch is not unlocked'; end if;
 select * into s from soulmate_sketches where user_id=u.id for update;
 if not found then raise exception 'Inspect saved sketch inputs first'; end if;
 if a.before_data is not null then raise exception 'Correction already prepared; inspect saved state before retrying'; end if;
 if s.updated_at is distinct from (a.payload->>'expectedUpdatedAt')::timestamptz then raise exception 'Sketch changed; reload customer before correcting'; end if;
 if s.status='generating' then raise exception 'Finish the existing sketch recovery before changing answers'; end if;
 if jsonb_typeof(a.payload->'answers')<>'object' or a.payload->'answers'='{}'::jsonb then raise exception 'Answer changes required'; end if;
 merged=coalesce(s.question_answers,'{}'::jsonb) || (a.payload->'answers');
 update support_actions set before_data=jsonb_build_object('report','soulmateSketch','record',to_jsonb(s)),
 result=jsonb_build_object('stage','answers_corrected','answers',merged) where id=a.id;
 update soulmate_sketches set question_answers=merged,status='pending',sketch_image_url=null,
 provider_job_id=null,prompt=null,generated_at=null,support_recovery_action_id=a.id,updated_at=clock_timestamp() where user_id=u.id;
 insert into support_audit(actor_id,event,target,detail) values(a.actor_id,'sketch_answers_corrected',u.id,jsonb_build_object('actionId',a.id,'changes',a.payload->'answers'));
 return jsonb_build_object('answers',merged);
end $$;
revoke all on function public.support_prepare_sketch_correction(uuid) from public, anon, authenticated;
grant execute on function public.support_prepare_sketch_correction(uuid) to service_role;
commit;
