-- Support credentials never grant direct access to customer tables. Server-only API.
begin;
create table public.support_staff (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email = lower(email)),
 name text not null, role text not null check(role in ('owner','support')), password_hash text,
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.support_sessions (
 token_hash text primary key, staff_id uuid not null references public.support_staff(id),
 kind text not null check(kind in ('browser','api','invite')), name text not null default '',
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.support_cases (
 id uuid primary key default gen_random_uuid(), mailbox text not null default 'team.astrorekha@gmail.com'
 check(mailbox = 'team.astrorekha@gmail.com'), thread_id text unique, customer_id text,
 subject text not null, issue text not null, status text not null default 'open'
 check(status in ('open','needs_input','needs_approval','ready_for_review','resolved')),
 assigned_to uuid references public.support_staff(id), draft text, draft_verified_at timestamptz,
 created_by uuid not null references public.support_staff(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.support_actions (
 id uuid primary key default gen_random_uuid(), request_key uuid not null,
 actor_id uuid not null references public.support_staff(id), customer_id text not null,
 case_id uuid references public.support_cases(id), kind text not null,
 payload jsonb not null default '{}', reason text not null,
 status text not null check(status in ('awaiting_approval','running','complete','needs_review','rejected')),
 approved_by uuid references public.support_staff(id), approved_at timestamptz,
 before_data jsonb, result jsonb, created_at timestamptz not null default now(), finished_at timestamptz,
 unique(actor_id, request_key)
);
-- Different request IDs cannot start concurrent repairs on the same account.
create unique index support_one_running on public.support_actions(customer_id) where status = 'running';
create index support_actions_customer on public.support_actions(customer_id,created_at desc);
create table public.support_audit (
 id bigint generated always as identity primary key, actor_id uuid references public.support_staff(id),
 event text not null, target text, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.support_rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);

grant all on public.support_staff,public.support_sessions,public.support_cases,public.support_actions,public.support_audit,public.support_rate_limits to service_role;
grant usage, select on sequence public.support_audit_id_seq to service_role;

alter table public.support_staff enable row level security;
alter table public.support_sessions enable row level security;
alter table public.support_cases enable row level security;
alter table public.support_actions enable row level security;
alter table public.support_audit enable row level security;
alter table public.support_rate_limits enable row level security;
revoke all on public.support_staff,public.support_sessions,public.support_cases,public.support_actions,public.support_audit,public.support_rate_limits from anon, authenticated;
-- Audit rows cannot be edited, including through the server API.
create function public.support_immutable_audit() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Support audit entries are immutable'; end $$;
create trigger support_audit_immutable before update or delete on public.support_audit for each row execute function public.support_immutable_audit();

create function public.support_rate_limit(p_key text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into support_rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=case when support_rate_limits.expires_at<now() then 1 else support_rate_limits.count+1 end,
 expires_at=case when support_rate_limits.expires_at<now() then excluded.expires_at else support_rate_limits.expires_at end returning count into n;
 return n<=p_limit;
end $$;

create function public.support_bootstrap(p_admin_token text,p_email text,p_name text,p_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('support_bootstrap'));
 if not exists(select 1 from admin_sessions where id=p_admin_token and expires_at>now()) then raise exception 'Invalid admin session'; end if;
 if exists(select 1 from support_staff where role='owner') then raise exception 'Support owner already exists'; end if;
 insert into support_staff(email,name,role,password_hash) values(p_email,p_name,'owner',p_hash) returning id into v_id;
 insert into support_audit(actor_id,event,target) values(v_id,'owner_bootstrapped',v_id::text);
 return v_id;
end $$;

-- All short repairs and their completion evidence commit in one transaction.
create function public.support_apply(p_action uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a support_actions%rowtype; u users%rowtype; p payments%rowtype; r jsonb; old jsonb; f text; patch jsonb; v_features jsonb;
begin
 select * into a from support_actions where id=p_action for update;
 if not found then raise exception 'Action not found'; end if;
 if a.status='complete' then return a.result; end if;
 if a.status<>'running' then raise exception 'Action is not running'; end if;
 if not exists(select 1 from support_staff where id=a.actor_id and active) then raise exception 'Staff access revoked'; end if;
 if a.kind in ('change_email','add_questions','link_payment','grant_features') and not exists
 (select 1 from support_staff where id=a.approved_by and role='owner' and active) then raise exception 'Owner approval required'; end if;
 select * into u from users where id=a.customer_id for update;
 if not found then raise exception 'Customer not found'; end if;
 old=jsonb_build_object('email',u.email,'coins',u.coins,'unlocked_features',u.unlocked_features,
 'birth_month',u.birth_month,'birth_day',u.birth_day,'birth_year',u.birth_year,'birth_hour',u.birth_hour,
 'birth_minute',u.birth_minute,'birth_period',u.birth_period,'birth_place',u.birth_place);
 if a.kind='change_email' then
   perform pg_advisory_xact_lock(hashtext(lower(a.payload->>'email')));
   if exists(select 1 from users where lower(email)=lower(a.payload->>'email') and id<>u.id) then raise exception 'Email belongs to another account'; end if;
   update users set email=a.payload->>'email' where id=u.id;
   update user_profiles set email=a.payload->>'email' where id=u.id;
   r=jsonb_build_object('email',a.payload->>'email');
 elsif a.kind='add_questions' then
   if (a.payload->>'questions')::int not between 1 and 100 then raise exception 'Invalid question count'; end if;
   update users set coins=coalesce(coins,0)+(a.payload->>'questions')::int*3 where id=u.id;
   r=jsonb_build_object('questionsAdded',(a.payload->>'questions')::int,'coins',coalesce(u.coins,0)+(a.payload->>'questions')::int*3);
 elsif a.kind='reconcile_payment' then
   select * into p from payments where id=a.payload->>'paymentId' for update;
   if not found or p.user_id is distinct from u.id or p.payment_status in ('refunded','chargeback','partially_refunded') then raise exception 'Payment ownership changed'; end if;
   if (a.payload->>'verifiedAmount')::bigint<>p.amount or a.payload->>'transactionId' is null then raise exception 'Verification missing'; end if;
   if exists(select 1 from payments x where x.id<>p.id and x.fulfilled_at is not null and
     (x.payu_payment_id=a.payload->>'transactionId' or x.gateway_transaction_id=a.payload->>'transactionId')) then raise exception 'Transaction already fulfilled elsewhere'; end if;
   v_features=coalesce(u.unlocked_features::jsonb,'{}'::jsonb);
   for f in select jsonb_array_elements_text(a.payload->'features') loop
     v_features=jsonb_set(v_features,array[f],'true'::jsonb);
   end loop;
   update users set unlocked_features=v_features,coins=coalesce(coins,0)+case when p.fulfilled_at is null and p.payment_status not in ('paid','success','captured') then (a.payload->>'coins')::int else 0 end where id=u.id;
   update users set payment_status='paid',purchase_type=case when p.type in ('bundle','bundle_payment') then 'one-time' else purchase_type end,bundle_purchased=case when p.type in ('bundle','bundle_payment') then p.bundle_id else bundle_purchased end where id=u.id;
   update payments set payment_status='paid',fulfilled_at=coalesce(fulfilled_at,now()),
     payu_payment_id=case when coalesce(gateway,'payu')='payu' then a.payload->>'transactionId' else payu_payment_id end,
     gateway_transaction_id=case when gateway in ('pinelabs','paytm') then a.payload->>'transactionId' else gateway_transaction_id end where id=p.id;
   r=jsonb_build_object('paymentId',p.id,'verified',true,'alreadyFulfilled',p.fulfilled_at is not null,'features',a.payload->'features','coinReviewRequired',p.fulfilled_at is null and p.payment_status in ('paid','success','captured'));
 elsif a.kind in ('restore_access','grant_features') then
   if a.kind='restore_access' then
     select * into p from payments where id=a.payload->>'paymentId' for update;
     if not found or p.user_id is distinct from u.id or p.payment_status not in ('paid','success','captured') or p.fulfilled_at is null then raise exception 'Verified fulfilled purchase required'; end if;
   end if;
   v_features=coalesce(u.unlocked_features::jsonb,'{}'::jsonb);
   for f in select jsonb_array_elements_text(a.payload->'features') loop
     if f not in ('palmReading','birthChart','futurePartnerReport','soulmateSketch','pastLifeReport','astrocartographyReport','auraColorReport','numerologyReport','spiritAnimalReport','witchArchetypeReport','compatibilityTest','prediction2026') then raise exception 'Invalid feature'; end if;
     v_features=jsonb_set(v_features,array[f],'true'::jsonb);
   end loop;
   update users set unlocked_features=v_features where id=u.id;
   r=jsonb_build_object('unlockedFeatures',v_features);
 elsif a.kind='correct_birth' then
   patch=a.payload->'fields';
   -- jsonb_populate_record respects the existing column types.
   select * into u from jsonb_populate_record(u,patch);
   update users set birth_month=u.birth_month,birth_day=u.birth_day,birth_year=u.birth_year,
     birth_hour=u.birth_hour,birth_minute=u.birth_minute,birth_period=u.birth_period,birth_place=u.birth_place,
     sun_sign=u.sun_sign,moon_sign=u.moon_sign,ascendant_sign=u.ascendant_sign where id=a.customer_id;
   insert into user_profiles(id,email,birth_month,birth_day,birth_year,birth_hour,birth_minute,birth_period,birth_place,knows_birth_time,sun_sign,moon_sign,ascendant_sign)
     values(u.id,u.email,u.birth_month,u.birth_day,u.birth_year,u.birth_hour,u.birth_minute,u.birth_period,u.birth_place,true,jsonb_build_object('name',u.sun_sign),jsonb_build_object('name',u.moon_sign),jsonb_build_object('name',u.ascendant_sign))
     on conflict(id) do update set birth_month=excluded.birth_month,birth_day=excluded.birth_day,birth_year=excluded.birth_year,
     birth_hour=excluded.birth_hour,birth_minute=excluded.birth_minute,birth_period=excluded.birth_period,birth_place=excluded.birth_place,
     knows_birth_time=true,sun_sign=excluded.sun_sign,moon_sign=excluded.moon_sign,ascendant_sign=excluded.ascendant_sign;
   if a.payload->'natal' is not null then
     insert into natal_charts(id,chart,dasha,signs,birth_data,calculated_at) values(u.id,a.payload->'natal'->'chart',a.payload->'natal'->'dasha',a.payload->'natal'->'signs',a.payload->'natal'->'birth_data',now())
     on conflict(id) do update set chart=excluded.chart,dasha=excluded.dasha,signs=excluded.signs,birth_data=excluded.birth_data,calculated_at=now();
   end if;
   -- Old content is retained, but cannot be claimed ready after a birth correction.
   update birth_chart_reports set status='pending' where user_id=u.id;
   update future_partner_reports set status='pending' where user_id=u.id;
   update past_life_reports set status='failed' where user_id=u.id;
   update astrocartography_reports set status='failed' where user_id=u.id;
   delete from birth_chart_user_links where user_id=u.id;
   update palm_readings set deleted_at=now() where id=u.id;
   update user_profiles set palm_reading_result=null where id=u.id;
   r=jsonb_build_object('birthDetailsUpdated',true,'regenerationRequired',true);
 elsif a.kind='link_payment' then
   select * into p from payments where id=a.payload->>'paymentId' for update;
   if not found or p.fulfilled_at is not null or (p.user_id is not null and p.user_id<>u.id) then raise exception 'Payment already assigned; manual investigation required'; end if;
   if lower(p.customer_email) is distinct from lower(u.email) then raise exception 'Payment email does not match customer'; end if;
   update payments set user_id=u.id where id=p.id;
   r=jsonb_build_object('paymentId',p.id,'mappedTo',u.id,'reconciliationRequired',true);
 elsif a.kind='reset_quiz' and a.payload->>'report'='auraColorReport' then
   old=old||jsonb_build_object('aura', (select to_jsonb(x) from aura_color_reports x where user_id=u.id limit 1));
   delete from aura_color_reports where user_id=u.id;
   r=jsonb_build_object('quizReset',true);
 else raise exception 'Unsupported atomic repair'; end if;
 update support_actions set status='complete',before_data=old,result=r,finished_at=now() where id=a.id;
 insert into support_audit(actor_id,event,target,detail) values(a.actor_id,a.kind,u.id,jsonb_build_object('actionId',a.id,'approvedBy',a.approved_by));
 return r;
end $$;

revoke all on function public.support_rate_limit(text,integer,integer),public.support_bootstrap(text,text,text,text),public.support_apply(uuid),public.support_immutable_audit() from public,anon,authenticated;
grant execute on function public.support_rate_limit(text,integer,integer),public.support_bootstrap(text,text,text,text),public.support_apply(uuid) to service_role;
commit;
