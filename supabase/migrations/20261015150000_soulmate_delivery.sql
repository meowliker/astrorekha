begin;
create table public.soulmate_sessions (
  id uuid primary key,
  token_hash text not null,
  answers jsonb not null default '{}'::jsonb,
  revision integer not null check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.soulmate_orders add column session_id uuid references public.soulmate_sessions(id);
alter table public.soulmate_orders add column scheduled_send_at timestamptz;

-- Server-only optimistic updates: an older network response cannot erase newer answers.
create function public.save_soulmate_session(p_id uuid, p_token_hash text, p_answers jsonb, p_revision integer)
returns boolean language plpgsql set search_path = public as $$
declare saved uuid;
begin
  insert into soulmate_sessions(id, token_hash, answers, revision)
  values(p_id, p_token_hash, p_answers, p_revision)
  on conflict(id) do update set answers = excluded.answers, revision = excluded.revision, updated_at = now()
  where soulmate_sessions.token_hash = excluded.token_hash and (soulmate_sessions.revision < excluded.revision or (soulmate_sessions.revision = excluded.revision and soulmate_sessions.answers = excluded.answers))
  returning id into saved;
  if saved is not null then return true; end if;
  return exists(select 1 from soulmate_sessions where id = p_id and token_hash = p_token_hash and revision > p_revision);
end $$;

create table public.soulmate_generation_jobs (
  order_id text primary key references public.soulmate_orders(id),
  status text not null default 'queued' check(status in ('queued','submitting','generating','ready','needs_review')),
  prompt text,
  prompt_version text not null default 'standalone-v1',
  provider_job_id text unique,
  generation_attempts integer not null default 0,
  failures integer not null default 0,
  storage_path text unique,
  image_sha256 text,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.soulmate_email_deliveries (
  order_id text primary key references public.soulmate_orders(id),
  id uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check(status in ('pending','submitting','scheduled','sent','delivered','needs_review')),
  scheduled_at timestamptz not null,
  provider_message_id text unique,
  submitted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create index soulmate_generation_pending_idx on public.soulmate_generation_jobs(next_attempt_at) where status <> 'needs_review';

-- Backfill any already-paid, undelivered orders using their original payment time.
update public.soulmate_orders set scheduled_send_at = paid_at + interval '8 hours' where payment_status = 'paid';
insert into public.soulmate_generation_jobs(order_id) select id from public.soulmate_orders where payment_status = 'paid' and fulfillment_status <> 'delivered';
insert into public.soulmate_email_deliveries(order_id,scheduled_at) select id,scheduled_send_at from public.soulmate_orders where payment_status = 'paid' and fulfillment_status <> 'delivered';

-- Keep the checkout snapshot immutable; mutable chat drafts never change an order.
create function public.soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.answers,new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint)
     is distinct from row(old.answers,old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint) then
    raise exception 'Soulmate order snapshot is immutable; create a new checkout';
  end if;
  if old.payment_status = 'paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    new.scheduled_send_at := new.paid_at + interval '8 hours';
  end if;
  return new;
end $$;
create trigger soulmate_order_snapshot_guard before update on public.soulmate_orders for each row execute function public.soulmate_order_snapshot_guard();

create function public.queue_soulmate_delivery() returns trigger language plpgsql set search_path = public as $$
begin
  if new.payment_status = 'paid' then
    insert into soulmate_generation_jobs(order_id) values(new.id) on conflict do nothing;
    insert into soulmate_email_deliveries(order_id,scheduled_at) values(new.id,new.scheduled_send_at) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger queue_soulmate_delivery after update of payment_status on public.soulmate_orders for each row execute function public.queue_soulmate_delivery();

-- Claim each order once, even when local and hosted workers overlap.
create function public.claim_soulmate_deliveries(p_mode text, p_limit integer default 3)
returns setof public.soulmate_generation_jobs language plpgsql set search_path = public as $$
begin
  return query
  with candidates as (
    select j.order_id from soulmate_generation_jobs j
    join soulmate_orders o on o.id = j.order_id
    join soulmate_email_deliveries e on e.order_id = j.order_id
    where o.payment_status = 'paid' and o.payment_mode = p_mode
      and j.status <> 'needs_review' and e.status not in ('delivered','needs_review')
      and j.next_attempt_at <= now() and (j.lease_until is null or j.lease_until < now())
    order by j.next_attempt_at for update of j skip locked limit least(greatest(p_limit,1),3)
  )
  update soulmate_generation_jobs j set lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes', updated_at = now()
  from candidates c where j.order_id = c.order_id returning j.*;
end $$;

-- A storage path is private and contains the order id; never use customer names/emails as keys.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('soulmate-sketches-private','soulmate-sketches-private',false,10485760,array['image/jpeg','image/png','image/webp']);

alter table public.soulmate_sessions enable row level security;
alter table public.soulmate_generation_jobs enable row level security;
alter table public.soulmate_email_deliveries enable row level security;
revoke all on public.soulmate_sessions, public.soulmate_generation_jobs, public.soulmate_email_deliveries from anon, authenticated;
grant all on public.soulmate_sessions, public.soulmate_generation_jobs, public.soulmate_email_deliveries to service_role;
revoke all on function public.save_soulmate_session(uuid,text,jsonb,integer), public.claim_soulmate_deliveries(text,integer), public.queue_soulmate_delivery(), public.soulmate_order_snapshot_guard() from public, anon, authenticated;
grant execute on function public.save_soulmate_session(uuid,text,jsonb,integer), public.claim_soulmate_deliveries(text,integer) to service_role;
commit;
