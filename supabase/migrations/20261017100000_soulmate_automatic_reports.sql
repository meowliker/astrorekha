begin;
-- Standalone funnel only. The original app's soulmate_sketches and reports are unrelated.
create table public.soulmate_report_jobs (
  order_id text primary key references public.soulmate_orders(id),
  answer_revision integer not null check(answer_revision > 0),
  status text not null default 'queued' check(status in ('queued','preparing','ready','needs_review')),
  state jsonb,
  lease_id uuid,
  lease_until timestamptz,
  failures integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.soulmate_report_jobs enable row level security;
revoke all on public.soulmate_report_jobs from anon,authenticated;
grant all on public.soulmate_report_jobs to service_role;
create index soulmate_report_queue on public.soulmate_report_jobs(next_attempt_at) where status in ('queued','preparing');

create function public.claim_soulmate_report_jobs(p_mode text,p_limit integer default 2)
returns setof public.soulmate_report_jobs language plpgsql set search_path=public as $$
begin
  if p_mode not in ('live','test') then raise exception 'Invalid payment mode'; end if;
  insert into soulmate_report_jobs(order_id,answer_revision)
    select o.id,o.answer_revision from soulmate_orders o
    join soulmate_email_deliveries e on e.order_id=o.id
    where o.catalog_version=2 and o.payment_status='paid' and o.payment_mode=p_mode
      and o.review_status='pending' and o.fulfillment_status<>'delivered' and o.delivered_at is null
      and e.status='pending' and o.scheduled_send_at is not null
      and not exists(select 1 from soulmate_order_assets a where a.order_id=o.id)
    on conflict(order_id) do update set answer_revision=excluded.answer_revision,status='queued',state=null,
      lease_id=null,lease_until=null,failures=0,next_attempt_at=now(),last_error=null,updated_at=now()
    where soulmate_report_jobs.answer_revision<>excluded.answer_revision;
  return query with candidates as (
    select o.id from soulmate_orders o join soulmate_report_jobs j on j.order_id=o.id
    join soulmate_email_deliveries e on e.order_id=o.id
    where o.catalog_version=2 and o.payment_status='paid' and o.payment_mode=p_mode
      and o.review_status='pending' and o.fulfillment_status<>'delivered' and o.delivered_at is null
      and e.status='pending' and j.answer_revision=o.answer_revision
      and j.status in ('queued','preparing') and j.next_attempt_at<=now()
      and (j.lease_until is null or j.lease_until<now())
      and not exists(select 1 from soulmate_order_assets a where a.order_id=o.id)
    order by o.scheduled_send_at,j.next_attempt_at for update of o skip locked limit least(greatest(p_limit,1),2)
  ) update soulmate_report_jobs j set status='preparing',lease_id=gen_random_uuid(),
      lease_until=now()+interval '10 minutes',updated_at=now()
    from candidates c where j.order_id=c.id returning j.*;
end $$;

create function public.checkpoint_soulmate_reports(p_order text,p_revision integer,p_lease uuid,p_state jsonb,
  p_release boolean default false,p_error text default null,p_hold boolean default false)
returns void language plpgsql set search_path=public as $$
declare o soulmate_orders;
begin
  select * into o from soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending'
    or o.answer_revision<>p_revision or o.fulfillment_status='delivered'
    or not exists(select 1 from soulmate_email_deliveries where order_id=p_order and status='pending')
    or exists(select 1 from soulmate_order_assets where order_id=p_order)
    then raise exception 'Preparation snapshot is no longer current'; end if;
  update soulmate_report_jobs set state=p_state,status=case when p_hold then 'needs_review' else 'preparing' end,
    lease_id=case when p_release then null else lease_id end,
    lease_until=case when p_release then null else lease_until end,
    failures=case when p_error is not null then failures+1 else 0 end,
    last_error=left(p_error,1000),
    next_attempt_at=now()+case when p_error is not null then interval '5 minutes' else interval '30 seconds' end,updated_at=now()
    where order_id=p_order and answer_revision=p_revision and lease_id=p_lease and lease_until>now();
  if not found then raise exception 'Preparation lease expired'; end if;
  update soulmate_generation_jobs set status=case when p_hold then 'needs_review' else 'generating' end,
    last_error=left(p_error,1000),updated_at=now() where order_id=p_order and answer_revision=p_revision;
end $$;

create function public.finish_soulmate_reports(p_order text,p_revision integer,p_lease uuid)
returns void language plpgsql set search_path=public as $$
declare o soulmate_orders; j soulmate_report_jobs; a jsonb;
begin
  select * into o from soulmate_orders where id=p_order for update;
  select * into j from soulmate_report_jobs where order_id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending'
    or o.fulfillment_status='delivered' or o.answer_revision<>p_revision
    or j.answer_revision<>p_revision or j.lease_id is distinct from p_lease or j.lease_until<=now()
    or j.status<>'preparing' or j.state->>'stage' is distinct from 'prepared'
    or j.state->'quality'->>'passed' is distinct from 'true'
    or not exists(select 1 from soulmate_email_deliveries where order_id=p_order and status='pending')
    or exists(select 1 from soulmate_order_assets where order_id=p_order)
    then raise exception 'Reports are not eligible for automatic approval'; end if;
  if jsonb_typeof(j.state->'assets') is distinct from 'array'
    or jsonb_array_length(j.state->'assets')<>jsonb_array_length(o.entitlements->'required_assets')
    or exists(select 1 from jsonb_array_elements_text(o.entitlements->'required_assets') r(kind)
      where not exists(select 1 from jsonb_array_elements(j.state->'assets') x where x->>'kind'=r.kind))
    or (select sum((x->>'size')::integer) from jsonb_array_elements(j.state->'assets') x)>7340032
    then raise exception 'Purchased attachments do not match'; end if;
  for a in select * from jsonb_array_elements(j.state->'assets') loop
    if a->>'storagePath' not like p_order || '/auto-r' || p_revision || '/%'
      or a->>'storagePath' not like '%' || (a->>'sha256') || '.pdf'
      then raise exception 'Invalid prepared asset path'; end if;
    insert into soulmate_order_assets(order_id,kind,storage_path,filename,content_type,size_bytes,sha256)
      values(p_order,a->>'kind',a->>'storagePath',a->>'filename','application/pdf',(a->>'size')::integer,a->>'sha256');
  end loop;
  update soulmate_orders set review_status='approved',reviewed_at=now(),
    review_note='Automatic checks passed: ' || coalesce(j.state->'quality'->>'fingerprint',''),updated_at=now() where id=p_order;
  update soulmate_generation_jobs set status='ready',last_error=null,failures=0,
    next_attempt_at=greatest(now(),o.scheduled_send_at),updated_at=now() where order_id=p_order;
  update soulmate_report_jobs set status='ready',lease_id=null,lease_until=null,last_error=null,updated_at=now() where order_id=p_order;
end $$;
revoke all on function public.claim_soulmate_report_jobs(text,integer),public.checkpoint_soulmate_reports(text,integer,uuid,jsonb,boolean,text,boolean),public.finish_soulmate_reports(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_soulmate_report_jobs(text,integer),public.checkpoint_soulmate_reports(text,integer,uuid,jsonb,boolean,text,boolean),public.finish_soulmate_reports(text,integer,uuid) to service_role;
commit;
