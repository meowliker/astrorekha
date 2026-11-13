-- Append after the migration's BEGIN/body without its COMMIT. Every schema/fixture change rolls back.
do $$
declare staff_id uuid; action_id uuid; uid text := 'support-sketch-regression-fixture'; stamp timestamptz := '2026-11-12T00:00:00Z'; result jsonb;
begin
 if exists(select 1 from users where id=uid) then raise exception 'Fixture ID occupied'; end if;
 insert into users(id,email,unlocked_features,coins) values(uid,'sketch-fixture@example.invalid','{"soulmateSketch":true}',15);
 insert into support_staff(email,name,role) values('sketch-regression@example.invalid','Rollback fixture','support') returning id into staff_id;
 insert into soulmate_sketches(user_id,status,question_answers,sketch_image_url,generation_count,updated_at)
 values(uid,'complete','{"attracted_to":"female","age_group":"40-45","vibe":"bold"}','https://example.invalid/old.jpg',1,stamp);
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,uid,'correct_sketch',jsonb_build_object('answers','{"age_group":"35-40","attracted_to":"male"}'::jsonb,'expectedUpdatedAt',stamp),'Explicit customer correction, rollback fixture','running') returning id into action_id;
 result= support_prepare_sketch_correction(action_id);
 if result->'answers'->>'vibe'<>'bold' or result->'answers'->>'age_group'<>'35-40' then raise exception 'Answer merge failed'; end if;
 if not exists(select 1 from soulmate_sketches where user_id=uid and sketch_image_url is null and provider_job_id is null and status='pending' and generation_count=1 and support_recovery_action_id=action_id) then raise exception 'Stale result not invalidated'; end if;
 if not exists(select 1 from support_actions where id=action_id and before_data->'record'->>'sketch_image_url'='https://example.invalid/old.jpg') then raise exception 'Original result not archived'; end if;
 begin
   perform support_prepare_sketch_correction(action_id);
   raise exception 'Duplicate correction accepted';
 exception when others then if sqlerrm='Duplicate correction accepted' then raise; end if; end;
 update support_actions set status='complete' where id=action_id;
 -- A stale read cannot replace a later operator's choices.
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,uid,'correct_sketch',jsonb_build_object('answers','{"age_group":"25-30"}'::jsonb,'expectedUpdatedAt',stamp),'Stale fixture','running') returning id into action_id;
 begin
   perform support_prepare_sketch_correction(action_id);
   raise exception 'Stale correction accepted';
 exception when others then if sqlerrm='Stale correction accepted' then raise; end if; end;
 update support_actions set status='needs_review' where id=action_id;
 update users set unlocked_features='{}' where id=uid;
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,uid,'correct_sketch',jsonb_build_object('answers','{"age_group":"25-30"}'::jsonb,'expectedUpdatedAt',(select updated_at from soulmate_sketches where user_id=uid)),'Unpurchased fixture','running') returning id into action_id;
 begin
   perform support_prepare_sketch_correction(action_id);
   raise exception 'Unpurchased correction accepted';
 exception when others then if sqlerrm='Unpurchased correction accepted' then raise; end if; end;
 if (select coins from users where id=uid)<>15 then raise exception 'Credits changed'; end if;
 if has_function_privilege('anon','public.support_prepare_sketch_correction(uuid)','execute') or has_function_privilege('authenticated','public.support_prepare_sketch_correction(uuid)','execute') then raise exception 'Public execution allowed'; end if;
end $$;
rollback;
select 'PASS: atomic answer merge, audit, invalidation, stale/duplicate/unpurchased rejection, no credit changes, RPC service-only; all writes rolled back' as result;
