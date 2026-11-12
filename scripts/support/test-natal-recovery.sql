-- Runs against the installed support schema. All fixture/account changes roll back.
begin;
do $$
declare staff_id uuid; action_id uuid; uid text := 'ec553e74-80a2-4be6-aa8d-d02537dfc0fe'; existing_chart natal_charts%rowtype; fields jsonb;
begin
 if not exists(select 1 from users where id=uid and email='astrorekha@gmail.com') then raise exception 'Dedicated test account missing'; end if;
 select * into existing_chart from natal_charts where id=uid;
 select jsonb_build_object('birth_month',birth_month,'birth_day',birth_day,'birth_year',birth_year,'birth_hour',birth_hour,'birth_minute',birth_minute,'birth_period',birth_period,'birth_place',birth_place,'sun_sign',sun_sign,'moon_sign',moon_sign,'ascendant_sign',ascendant_sign) into fields from users where id=uid;
 insert into support_staff(email,name,role) values('natal-regression@example.invalid','Rollback fixture','support') returning id into staff_id;
 insert into support_actions(request_key,actor_id,customer_id,kind,payload,reason,status)
 values(gen_random_uuid(),staff_id,uid,'correct_birth',jsonb_build_object('fields',fields,'natal',jsonb_build_object('chart',existing_chart.chart,'dasha',existing_chart.dasha,'signs',existing_chart.signs,'birth_data',existing_chart.birth_data)),'Rollback-only natal schema regression','running') returning id into action_id;
 perform support_apply(action_id);
 if not exists(select 1 from natal_charts where id=uid and calculated_at is not null) then raise exception 'Calculation timestamp missing'; end if;
 if not exists(select 1 from support_actions where id=action_id and status='complete') then raise exception 'Birth action not complete'; end if;
end $$;
rollback;
select 'PASS: birth correction with natal data and calculation timestamp; all writes rolled back' as result;
