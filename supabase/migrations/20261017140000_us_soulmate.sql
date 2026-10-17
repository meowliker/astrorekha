-- US Soulmate only. No existing rows, functions, queues or schedules are changed.
begin;
create table public.us_soulmate_marketing_events (like public.marketing_events including defaults including constraints including indexes);
alter table public.us_soulmate_marketing_events enable row level security;
revoke all on public.us_soulmate_marketing_events from anon, authenticated;
grant all on public.us_soulmate_marketing_events to service_role;
-- Source: 20261015120000_create_soulmate_orders.sql
-- Standalone /soulmate checkout. Never insert these orders in public.payments.
create table if not exists public.us_soulmate_orders (
  id text primary key check (id ~ '^us_sm_[a-f0-9]{20}$'),
  funnel text not null default 'us_soulmate_standalone' check (funnel = 'us_soulmate_standalone'),
  checkout_key uuid not null unique,
  checkout_fingerprint text not null,
  plan text not null check (plan in ('standard', 'express')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  answers jsonb not null,
  base_amount integer not null check (base_amount > 0),
  gst_amount integer not null check (gst_amount >= 0),
  amount integer not null check (amount = base_amount + gst_amount),
  currency text not null default 'USD' check (currency = 'USD'),
  delivery_hours integer not null check (delivery_hours in (12, 48)),
  product_info text not null,
  payment_status text not null default 'created' check (payment_status in ('created', 'pending', 'paid', 'failed')),
  stripe_payment_id text unique,
  payment_mode text not null check (payment_mode in ('live', 'test')),
  paid_at timestamptz,
  delivery_due_at timestamptz,
  fulfillment_status text not null default 'awaiting_payment' check (fulfillment_status in ('awaiting_payment', 'queued', 'delivered')),
  delivered_at timestamptz,
  attribution jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists us_soulmate_orders_revenue_idx on public.us_soulmate_orders (payment_mode, payment_status, created_at);
create index if not exists us_soulmate_orders_delivery_idx on public.us_soulmate_orders (fulfillment_status, delivery_due_at);
alter table public.us_soulmate_orders enable row level security;
revoke all on public.us_soulmate_orders from anon, authenticated;
grant all on public.us_soulmate_orders to service_role;
comment on table public.us_soulmate_orders is 'Private standalone soulmate ledger; excluded from the main Profit Sheet, users, marketing events, and payments. Amounts in paise. Paid orders queue for sketch delivery.';

-- Source: 20261015150000_soulmate_delivery.sql
create table public.us_soulmate_sessions (
  id uuid primary key,
  token_hash text not null,
  answers jsonb not null default '{}'::jsonb,
  revision integer not null check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.us_soulmate_orders add column session_id uuid references public.us_soulmate_sessions(id);
alter table public.us_soulmate_orders add column scheduled_send_at timestamptz;

-- Server-only optimistic updates: an older network response cannot erase newer answers.
create function public.save_us_soulmate_session(p_id uuid, p_token_hash text, p_answers jsonb, p_revision integer)
returns boolean language plpgsql set search_path = public as $$
declare saved uuid;
begin
  insert into us_soulmate_sessions(id, token_hash, answers, revision)
  values(p_id, p_token_hash, p_answers, p_revision)
  on conflict(id) do update set answers = excluded.answers, revision = excluded.revision, updated_at = now()
  where us_soulmate_sessions.token_hash = excluded.token_hash and (us_soulmate_sessions.revision < excluded.revision or (us_soulmate_sessions.revision = excluded.revision and us_soulmate_sessions.answers = excluded.answers))
  returning id into saved;
  if saved is not null then return true; end if;
  return exists(select 1 from us_soulmate_sessions where id = p_id and token_hash = p_token_hash and revision > p_revision);
end $$;

create table public.us_soulmate_generation_jobs (
  order_id text primary key references public.us_soulmate_orders(id),
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
create table public.us_soulmate_email_deliveries (
  order_id text primary key references public.us_soulmate_orders(id),
  id uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check(status in ('pending','submitting','scheduled','sent','delivered','needs_review')),
  scheduled_at timestamptz not null,
  provider_message_id text unique,
  submitted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create index us_soulmate_generation_pending_idx on public.us_soulmate_generation_jobs(next_attempt_at) where status <> 'needs_review';

-- Backfill any already-paid, undelivered orders using their original payment time.
update public.us_soulmate_orders set scheduled_send_at = paid_at + interval '8 hours' where payment_status = 'paid';
insert into public.us_soulmate_generation_jobs(order_id) select id from public.us_soulmate_orders where payment_status = 'paid' and fulfillment_status <> 'delivered';
insert into public.us_soulmate_email_deliveries(order_id,scheduled_at) select id,scheduled_send_at from public.us_soulmate_orders where payment_status = 'paid' and fulfillment_status <> 'delivered';

-- Keep the checkout snapshot immutable; mutable chat drafts never change an order.
create function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path = public as $$
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
create trigger us_soulmate_order_snapshot_guard before update on public.us_soulmate_orders for each row execute function public.us_soulmate_order_snapshot_guard();

create function public.queue_us_soulmate_delivery() returns trigger language plpgsql set search_path = public as $$
begin
  if new.payment_status = 'paid' then
    insert into us_soulmate_generation_jobs(order_id) values(new.id) on conflict do nothing;
    insert into us_soulmate_email_deliveries(order_id,scheduled_at) values(new.id,new.scheduled_send_at) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger queue_us_soulmate_delivery after update of payment_status on public.us_soulmate_orders for each row execute function public.queue_us_soulmate_delivery();

-- Claim each order once, even when local and hosted workers overlap.
create function public.claim_us_soulmate_deliveries(p_mode text, p_limit integer default 3)
returns setof public.us_soulmate_generation_jobs language plpgsql set search_path = public as $$
begin
  return query
  with candidates as (
    select j.order_id from us_soulmate_generation_jobs j
    join us_soulmate_orders o on o.id = j.order_id
    join us_soulmate_email_deliveries e on e.order_id = j.order_id
    where o.payment_status = 'paid' and o.payment_mode = p_mode
      and j.status <> 'needs_review' and e.status not in ('delivered','needs_review')
      and j.next_attempt_at <= now() and (j.lease_until is null or j.lease_until < now())
    order by j.next_attempt_at for update of j skip locked limit least(greatest(p_limit,1),3)
  )
  update us_soulmate_generation_jobs j set lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes', updated_at = now()
  from candidates c where j.order_id = c.order_id returning j.*;
end $$;

-- A storage path is private and contains the order id; never use customer names/emails as keys.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('us-soulmate-sketches-private','us-soulmate-sketches-private',false,10485760,array['image/jpeg','image/png','image/webp']);

alter table public.us_soulmate_sessions enable row level security;
alter table public.us_soulmate_generation_jobs enable row level security;
alter table public.us_soulmate_email_deliveries enable row level security;
revoke all on public.us_soulmate_sessions, public.us_soulmate_generation_jobs, public.us_soulmate_email_deliveries from anon, authenticated;
grant all on public.us_soulmate_sessions, public.us_soulmate_generation_jobs, public.us_soulmate_email_deliveries to service_role;
revoke all on function public.save_us_soulmate_session(uuid,text,jsonb,integer), public.claim_us_soulmate_deliveries(text,integer), public.queue_us_soulmate_delivery(), public.us_soulmate_order_snapshot_guard() from public, anon, authenticated;
grant execute on function public.save_us_soulmate_session(uuid,text,jsonb,integer), public.claim_us_soulmate_deliveries(text,integer) to service_role;

-- Source: 20261015160000_soulmate_eight_hour_delivery.sql
-- Keep customer-facing deadlines aligned with the existing eight-hour email schedule.
alter table public.us_soulmate_orders drop constraint us_soulmate_orders_delivery_hours_check;
update public.us_soulmate_orders set delivery_hours = 8,
  delivery_due_at = case when paid_at is not null then paid_at + interval '8 hours' else null end;
alter table public.us_soulmate_orders add constraint us_soulmate_orders_delivery_hours_check check (delivery_hours = 8);
alter table public.us_soulmate_orders alter column delivery_hours set default 8;

-- Source: 20261015190000_soulmate_purchase_tracking.sql
-- Independent delivery state for confirmed standalone purchases.
alter table public.us_soulmate_orders
  add column if not exists meta_purchase_sent_at timestamptz,
  add column if not exists meta_purchase_claimed_at timestamptz,
  add column if not exists ga_purchase_sent_at timestamptz,
  add column if not exists ga_purchase_claimed_at timestamptz;
create index if not exists us_soulmate_purchase_tracking_pending_idx
  on public.us_soulmate_orders (paid_at)
  where payment_status = 'paid' and payment_mode = 'live'
    and (meta_purchase_sent_at is null or ga_purchase_sent_at is null);
create index if not exists us_soulmate_marketing_events_us_soulmate_sessions_idx
  on public.us_soulmate_marketing_events (created_at, session_id)
  where product_type = 'us_soulmate_standalone';

-- Source: 20261015210000_soulmate_buyer_items.sql
alter table public.us_soulmate_orders
  add column catalog_version integer not null default 1 check(catalog_version in (1,2)),
  add column line_items jsonb not null default '[]'::jsonb,
  add column add_ons jsonb not null default '[]'::jsonb,
  add column entitlements jsonb not null default '{}'::jsonb,
  add column review_status text not null default 'pending' check(review_status in ('pending','approved')),
  add column reviewed_at timestamptz,
  add column review_note text;
-- Existing paid schedules are immutable. All new catalog orders use 12/48 hours.
alter table public.us_soulmate_orders drop constraint us_soulmate_orders_delivery_hours_check;
alter table public.us_soulmate_orders add constraint us_soulmate_orders_delivery_hours_check
  check ((catalog_version=1 and delivery_hours in (8,12,48)) or
         (catalog_version=2 and delivery_hours in (12,48) and delivery_hours=(entitlements->>'scheduled_hours')::integer and delivery_hours=(entitlements->>'promised_hours')::integer));
alter table public.us_soulmate_orders alter column delivery_hours set default 48;
alter table public.us_soulmate_email_deliveries add column sent_at timestamptz;

create table public.us_soulmate_order_assets (
  order_id text not null references public.us_soulmate_orders(id),
  kind text not null check(kind in ('sketch','description','timeline')),
  storage_path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes integer not null check(size_bytes > 0 and size_bytes <= 3145728),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_at timestamptz not null default now(),
  primary key(order_id,kind),
  check(storage_path like order_id || '/%')
);
alter table public.us_soulmate_order_assets enable row level security;
revoke all on public.us_soulmate_order_assets from anon,authenticated;
grant all on public.us_soulmate_order_assets to service_role;
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'] where id='us-soulmate-sketches-private';

create or replace function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.answers,new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.answers,old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order snapshot is immutable; create a new checkout';
  end if;
  if old.payment_status='paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status='paid' and old.payment_status<>'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    new.scheduled_send_at := new.paid_at + make_interval(hours => new.delivery_hours);
  end if;
  return new;
end $$;

-- Lock the order for both upload registration and approval, preventing a partial bundle from being approved.
create function public.save_us_soulmate_order_asset(p_order text,p_kind text,p_path text,p_filename text,p_type text,p_size integer,p_sha text)
returns void language plpgsql set search_path=public as $$
declare o us_soulmate_orders;
begin
  select * into o from us_soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending' then raise exception 'Order is not awaiting review'; end if;
  if not (o.entitlements->'required_assets' ? p_kind) then raise exception 'Asset was not purchased'; end if;
  if p_size + coalesce((select sum(size_bytes) from us_soulmate_order_assets where order_id=p_order and kind<>p_kind),0)>7340032 then raise exception 'Combined attachments exceed 7 MiB'; end if;
  insert into us_soulmate_order_assets(order_id,kind,storage_path,filename,content_type,size_bytes,sha256)
    values(p_order,p_kind,p_path,p_filename,p_type,p_size,p_sha)
    on conflict(order_id,kind) do update set storage_path=excluded.storage_path,filename=excluded.filename,content_type=excluded.content_type,size_bytes=excluded.size_bytes,sha256=excluded.sha256,uploaded_at=now();
end $$;

create function public.approve_us_soulmate_order(p_order text,p_note text default '')
returns void language plpgsql set search_path=public as $$
declare o us_soulmate_orders;
begin
  select * into o from us_soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' then raise exception 'Order is not a paid review order'; end if;
  if o.review_status='approved' then return; end if;
  if not exists(select 1 from us_soulmate_order_assets where order_id=p_order and kind='sketch') or
    exists(select 1 from jsonb_array_elements_text(o.entitlements->'required_assets') as required(kind) where not exists(select 1 from us_soulmate_order_assets a where a.order_id=p_order and a.kind=required.kind)) then
    raise exception 'Upload every purchased deliverable before approval';
  end if;
  update us_soulmate_orders set review_status='approved',reviewed_at=now(),review_note=left(p_note,2000) where id=p_order;
  update us_soulmate_generation_jobs set status='ready',last_error=null,next_attempt_at=greatest(now(),o.scheduled_send_at),updated_at=now() where order_id=p_order;
end $$;

-- A version-1 worker can never claim the new bundles and send only its old B&W sketch.
drop function public.claim_us_soulmate_deliveries(text,integer);
create function public.claim_us_soulmate_deliveries(p_mode text,p_limit integer default 3,p_catalog_version integer default 1)
returns setof public.us_soulmate_generation_jobs language plpgsql set search_path=public as $$
begin
  return query with candidates as (
    select j.order_id from us_soulmate_generation_jobs j
    join us_soulmate_orders o on o.id=j.order_id join us_soulmate_email_deliveries e on e.order_id=j.order_id
    where o.payment_status='paid' and o.payment_mode=p_mode and o.catalog_version<=p_catalog_version
      and (o.catalog_version=1 or (o.review_status='approved' and o.scheduled_send_at<=now()))
      and j.status<>'needs_review' and e.status not in ('delivered','needs_review')
      and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now())
    order by j.next_attempt_at for update of j skip locked limit least(greatest(p_limit,1),3)
  ) update us_soulmate_generation_jobs j set lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    from candidates c where j.order_id=c.order_id returning j.*;
end $$;
revoke all on function public.save_us_soulmate_order_asset(text,text,text,text,text,integer,text),public.approve_us_soulmate_order(text,text),public.claim_us_soulmate_deliveries(text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_us_soulmate_order_asset(text,text,text,text,text,integer,text),public.approve_us_soulmate_order(text,text),public.claim_us_soulmate_deliveries(text,integer,integer) to service_role;

-- Source: 20261015223000_soulmate_confirmation_invoices.sql
create sequence public.us_soulmate_invoice_number_seq;
create table public.us_soulmate_order_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id text unique references public.us_soulmate_orders(id),
  source text not null check(source in ('purchase','manual_preview')),
  invoice_number text not null unique default ('ARUS-' || to_char(now() at time zone 'Asia/Kolkata','YY') || '-' || lpad(nextval('public.us_soulmate_invoice_number_seq')::text,7,'0')),
  issued_at timestamptz not null default now(),
  snapshot jsonb not null,
  storage_path text unique,
  pdf_sha256 text,
  status text not null default 'pending' check(status in ('pending','preparing','submitting','sent','needs_review')),
  lease_until timestamptz,
  processing_token uuid,
  submitted_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  check((source='purchase' and order_id is not null) or (source='manual_preview' and order_id is null))
);
alter table public.us_soulmate_order_invoices enable row level security;
revoke all on public.us_soulmate_order_invoices, public.us_soulmate_invoice_number_seq from anon,authenticated;
grant all on public.us_soulmate_order_invoices, public.us_soulmate_invoice_number_seq to service_role;
create index us_soulmate_invoice_queue on public.us_soulmate_order_invoices(issued_at) where source='purchase' and status in ('pending','preparing');

create function public.ensure_us_soulmate_invoice(p_order text) returns uuid language plpgsql set search_path=public as $$
declare o us_soulmate_orders; invoice_id uuid;
begin
  select * into o from us_soulmate_orders where id=p_order;
  if o.id is null or o.payment_status<>'paid' or o.catalog_version<>2 then return null; end if;
  insert into us_soulmate_order_invoices(order_id,source,snapshot)
  values(o.id,'purchase',jsonb_build_object('customerName',o.customer_name,'customerEmail',o.customer_email,'orderId',o.id,'items',o.line_items,'entitlements',o.entitlements,'subtotal',o.base_amount,'gst',o.gst_amount,'total',o.amount,'paidAt',o.paid_at,'deliveryDueAt',o.delivery_due_at))
  on conflict(order_id) do nothing;
  select id into invoice_id from us_soulmate_order_invoices where order_id=o.id;
  return invoice_id;
end $$;
create function public.us_soulmate_invoice_after_payment() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_status='paid' and old.payment_status<>'paid' and new.catalog_version=2 then perform ensure_us_soulmate_invoice(new.id); end if;
  return new;
end $$;
create trigger us_soulmate_invoice_on_payment after update of payment_status on public.us_soulmate_orders for each row execute function public.us_soulmate_invoice_after_payment();
create function public.us_soulmate_invoice_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.id,new.order_id,new.source,new.invoice_number,new.issued_at,new.snapshot) is distinct from row(old.id,old.order_id,old.source,old.invoice_number,old.issued_at,old.snapshot) then raise exception 'Invoice snapshot is immutable'; end if;
  if old.storage_path is not null and row(new.storage_path,new.pdf_sha256) is distinct from row(old.storage_path,old.pdf_sha256) then raise exception 'Saved invoice PDF is immutable'; end if;
  return new;
end $$;
create trigger us_soulmate_invoice_guard before update on public.us_soulmate_order_invoices for each row execute function public.us_soulmate_invoice_snapshot_guard();
revoke all on function public.ensure_us_soulmate_invoice(text),public.us_soulmate_invoice_after_payment(),public.us_soulmate_invoice_snapshot_guard() from public,anon,authenticated;
grant execute on function public.ensure_us_soulmate_invoice(text) to service_role;

-- Source: 20261016183000_soulmate_answer_revisions.sql
alter table public.us_soulmate_orders
  add column answer_revision integer not null default 1 check (answer_revision > 0),
  add column answers_updated_at timestamptz;

create table public.us_soulmate_order_answer_revisions (
  id bigint generated always as identity primary key,
  order_id text not null references public.us_soulmate_orders(id),
  revision integer not null check (revision > 0),
  previous_answers jsonb not null,
  revised_answers jsonb not null,
  revised_at timestamptz not null default now(),
  unique(order_id, revision)
);
alter table public.us_soulmate_order_answer_revisions enable row level security;
revoke all on public.us_soulmate_order_answer_revisions from anon, authenticated;
grant all on public.us_soulmate_order_answer_revisions to service_role;

-- Keep commercial and customer identity fields immutable. Answers are revised only
-- through revise_us_soulmate_order_answers(), which records an audit snapshot and resets fulfilment.
create or replace function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
  end if;
  if old.payment_status='paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status='paid' and old.payment_status<>'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    new.scheduled_send_at := new.paid_at + make_interval(hours => new.delivery_hours);
  end if;
  return new;
end $$;

create or replace function public.revise_us_soulmate_order_answers(p_order text, p_answers jsonb)
returns text[] language plpgsql set search_path=public as $$
declare
  o public.us_soulmate_orders;
  delivery_status text;
  old_paths text[];
  new_revision integer;
begin
  select * into o from public.us_soulmate_orders where id=p_order for update;
  if o.id is null or o.payment_status<>'paid' then raise exception 'Order is not paid'; end if;
  if o.fulfillment_status='delivered' or o.delivered_at is not null then raise exception 'Delivered orders cannot be revised'; end if;
  select status into delivery_status from public.us_soulmate_email_deliveries where order_id=p_order for update;
  if delivery_status in ('submitting','scheduled','sent','delivered') then raise exception 'Delivery has already been submitted'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Invalid answers'; end if;
  if p_answers=o.answers then return array[]::text[]; end if;

  new_revision := o.answer_revision + 1;
  insert into public.us_soulmate_order_answer_revisions(order_id,revision,previous_answers,revised_answers)
    values(p_order,new_revision,o.answers,p_answers);

  select coalesce(array_agg(path),array[]::text[]) into old_paths from (
    select storage_path as path from public.us_soulmate_order_assets where order_id=p_order
    union
    select storage_path as path from public.us_soulmate_generation_jobs where order_id=p_order and storage_path is not null
  ) paths;

  delete from public.us_soulmate_order_assets where order_id=p_order;
  update public.us_soulmate_orders set
    answers=p_answers,
    answer_revision=new_revision,
    answers_updated_at=now(),
    review_status='pending',
    reviewed_at=null,
    review_note=null,
    updated_at=now()
  where id=p_order;
  update public.us_soulmate_generation_jobs set
    status='queued',
    prompt=null,
    provider_job_id=null,
    generation_attempts=0,
    failures=0,
    storage_path=null,
    image_sha256=null,
    lease_id=null,
    lease_until=null,
    next_attempt_at=now(),
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  update public.us_soulmate_email_deliveries set
    status='pending',
    provider_message_id=null,
    submitted_at=null,
    sent_at=null,
    delivered_at=null,
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  return old_paths;
end $$;

revoke all on function public.revise_us_soulmate_order_answers(text,jsonb) from public,anon,authenticated;
grant execute on function public.revise_us_soulmate_order_answers(text,jsonb) to service_role;


-- Source: 20261016190000_enforce_soulmate_answer_audit.sql
create or replace function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
  end if;
  if new.answers is distinct from old.answers then
    if new.answer_revision<>old.answer_revision+1 or not exists(
      select 1 from public.us_soulmate_order_answer_revisions r
      where r.order_id=old.id and r.revision=new.answer_revision
        and r.previous_answers=old.answers and r.revised_answers=new.answers
    ) then
      raise exception 'Soulmate answers require an audited revision';
    end if;
  elsif row(new.answer_revision,new.answers_updated_at) is distinct from row(old.answer_revision,old.answers_updated_at) then
    raise exception 'Soulmate answer revision metadata is immutable';
  end if;
  if old.payment_status='paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status='paid' and old.payment_status<>'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    new.scheduled_send_at := new.paid_at + make_interval(hours => new.delivery_hours);
  end if;
  return new;
end $$;


-- Source: 20261016191500_soulmate_generation_answer_revision.sql
alter table public.us_soulmate_generation_jobs
  add column answer_revision integer not null default 1 check(answer_revision > 0);
update public.us_soulmate_generation_jobs j set answer_revision=o.answer_revision
  from public.us_soulmate_orders o where o.id=j.order_id;

create or replace function public.revise_us_soulmate_order_answers(p_order text, p_answers jsonb)
returns text[] language plpgsql set search_path=public as $$
declare
  o public.us_soulmate_orders;
  delivery_status text;
  old_paths text[];
  new_revision integer;
begin
  select * into o from public.us_soulmate_orders where id=p_order for update;
  if o.id is null or o.payment_status<>'paid' then raise exception 'Order is not paid'; end if;
  if o.fulfillment_status='delivered' or o.delivered_at is not null then raise exception 'Delivered orders cannot be revised'; end if;
  select status into delivery_status from public.us_soulmate_email_deliveries where order_id=p_order for update;
  if delivery_status in ('submitting','scheduled','sent','delivered') then raise exception 'Delivery has already been submitted'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Invalid answers'; end if;
  if p_answers=o.answers then return array[]::text[]; end if;

  new_revision := o.answer_revision + 1;
  insert into public.us_soulmate_order_answer_revisions(order_id,revision,previous_answers,revised_answers)
    values(p_order,new_revision,o.answers,p_answers);

  select coalesce(array_agg(path),array[]::text[]) into old_paths from (
    select storage_path as path from public.us_soulmate_order_assets where order_id=p_order
    union
    select storage_path as path from public.us_soulmate_generation_jobs where order_id=p_order and storage_path is not null
  ) paths;

  delete from public.us_soulmate_order_assets where order_id=p_order;
  update public.us_soulmate_orders set
    answers=p_answers,
    answer_revision=new_revision,
    answers_updated_at=now(),
    review_status='pending',
    reviewed_at=null,
    review_note=null,
    updated_at=now()
  where id=p_order;
  update public.us_soulmate_generation_jobs set
    answer_revision=new_revision,
    status='queued',
    prompt=null,
    provider_job_id=null,
    generation_attempts=0,
    failures=0,
    storage_path=null,
    image_sha256=null,
    lease_id=null,
    lease_until=null,
    next_attempt_at=now(),
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  update public.us_soulmate_email_deliveries set
    status='pending',
    provider_message_id=null,
    submitted_at=null,
    sent_at=null,
    delivered_at=null,
    last_error=null,
    updated_at=now()
  where order_id=p_order;
  return old_paths;
end $$;

revoke all on function public.revise_us_soulmate_order_answers(text,jsonb) from public,anon,authenticated;
grant execute on function public.revise_us_soulmate_order_answers(text,jsonb) to service_role;

-- Serialize sending with answer edits. After this checkpoint an edit is rejected;
-- if the edit wins first, the stale worker cannot submit its attachments.
create function public.begin_us_soulmate_delivery(p_order text, p_revision integer, p_lease uuid)
returns boolean language plpgsql set search_path=public as $$
declare o public.us_soulmate_orders;
begin
  select * into o from public.us_soulmate_orders where id=p_order for update;
  if o.id is null or o.payment_status<>'paid' or o.answer_revision<>p_revision then return false; end if;
  if o.catalog_version=2 and (o.review_status<>'approved' or o.scheduled_send_at>now()) then return false; end if;
  if not exists(select 1 from public.us_soulmate_generation_jobs where order_id=p_order and lease_id=p_lease and answer_revision=p_revision and lease_until>now()) then return false; end if;
  update public.us_soulmate_email_deliveries set status='submitting',submitted_at=now(),updated_at=now()
    where order_id=p_order and status='pending';
  return found;
end $$;
revoke all on function public.begin_us_soulmate_delivery(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.begin_us_soulmate_delivery(text,integer,uuid) to service_role;


-- Source: 20261016203000_soulmate_profit_ledger.sql
-- Isolated Soulmate reporting. No main-flow tables or credentials are copied.
create table public.us_soulmate_admin_settings (
  id boolean primary key default true check (id),
  accounts jsonb not null default '[]'::jsonb,
  exchange_rate numeric check (exchange_rate > 0 and exchange_rate <= 1000),
  revision integer not null default 1,
  sync_owner uuid,
  sync_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.us_soulmate_admin_settings (id) values (true);
create table public.us_soulmate_profit_sheet (
  date text primary key check (date >= '2026-10-15'),
  data jsonb not null,
  exchange_rate numeric,
  config_revision integer not null,
  synced_at timestamptz not null default now()
);
create table public.us_soulmate_ad_spend_daily (
  date text not null,
  account_id text not null,
  data jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (date, account_id)
);
create table public.us_soulmate_refund_events (
  event_id text primary key,
  order_id text not null references public.us_soulmate_orders(id),
  date text not null,
  amount_paise bigint not null check (amount_paise > 0),
  gst_paise bigint not null check (gst_paise >= 0),
  synced_at timestamptz not null default now()
);
create index on public.us_soulmate_refund_events(date);
alter table public.us_soulmate_admin_settings enable row level security;
alter table public.us_soulmate_profit_sheet enable row level security;
alter table public.us_soulmate_ad_spend_daily enable row level security;
alter table public.us_soulmate_refund_events enable row level security;
revoke all on public.us_soulmate_admin_settings, public.us_soulmate_profit_sheet, public.us_soulmate_ad_spend_daily, public.us_soulmate_refund_events from anon, authenticated;
grant all on public.us_soulmate_admin_settings, public.us_soulmate_profit_sheet, public.us_soulmate_ad_spend_daily, public.us_soulmate_refund_events to service_role;

create function public.save_us_soulmate_profit_settings(p_revision integer, p_accounts jsonb, p_rate numeric)
returns integer language plpgsql security definer set search_path = public as $$
declare v_revision integer;
begin
  update us_soulmate_admin_settings set accounts=p_accounts, exchange_rate=p_rate,
    revision=revision+1, updated_at=now() where id=true and revision=p_revision
    returning revision into v_revision;
  if v_revision is null then raise exception 'Settings changed. Reload and try again.'; end if;
  return v_revision;
end $$;

-- One bounded sync at a time; a changed configuration cannot receive stale results.
create function public.claim_us_soulmate_profit_sync(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update us_soulmate_admin_settings set sync_owner=p_owner, sync_until=now()+interval '5 minutes'
    where id=true and (sync_until is null or sync_until < now());
  return found;
end $$;
create function public.finish_us_soulmate_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from us_soulmate_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into us_soulmate_refund_events(event_id,order_id,date,amount_paise,gst_paise)
    select event_id,order_id,date,amount_paise,gst_paise from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,synced_at=now();
  delete from us_soulmate_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into us_soulmate_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into us_soulmate_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update us_soulmate_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;
revoke all on function public.save_us_soulmate_profit_settings(integer,jsonb,numeric), public.claim_us_soulmate_profit_sync(uuid), public.finish_us_soulmate_profit_sync(uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_us_soulmate_profit_settings(integer,jsonb,numeric), public.claim_us_soulmate_profit_sync(uuid), public.finish_us_soulmate_profit_sync(uuid,integer,jsonb,jsonb,jsonb) to service_role;

-- Source: 20261017100000_soulmate_automatic_reports.sql
-- Standalone funnel only. The original app's us_soulmate_sketches and reports are unrelated.
create table public.us_soulmate_report_jobs (
  order_id text primary key references public.us_soulmate_orders(id),
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
alter table public.us_soulmate_report_jobs enable row level security;
revoke all on public.us_soulmate_report_jobs from anon,authenticated;
grant all on public.us_soulmate_report_jobs to service_role;
create index us_soulmate_report_queue on public.us_soulmate_report_jobs(next_attempt_at) where status in ('queued','preparing');

create function public.claim_us_soulmate_report_jobs(p_mode text,p_limit integer default 2)
returns setof public.us_soulmate_report_jobs language plpgsql set search_path=public as $$
begin
  if p_mode not in ('live','test') then raise exception 'Invalid payment mode'; end if;
  insert into us_soulmate_report_jobs(order_id,answer_revision)
    select o.id,o.answer_revision from us_soulmate_orders o
    join us_soulmate_email_deliveries e on e.order_id=o.id
    where o.catalog_version=2 and o.payment_status='paid' and o.payment_mode=p_mode
      and o.review_status='pending' and o.fulfillment_status<>'delivered' and o.delivered_at is null
      and e.status='pending' and o.scheduled_send_at is not null
      and not exists(select 1 from us_soulmate_order_assets a where a.order_id=o.id)
    on conflict(order_id) do update set answer_revision=excluded.answer_revision,status='queued',state=null,
      lease_id=null,lease_until=null,failures=0,next_attempt_at=now(),last_error=null,updated_at=now()
    where us_soulmate_report_jobs.answer_revision<>excluded.answer_revision;
  return query with candidates as (
    select o.id from us_soulmate_orders o join us_soulmate_report_jobs j on j.order_id=o.id
    join us_soulmate_email_deliveries e on e.order_id=o.id
    where o.catalog_version=2 and o.payment_status='paid' and o.payment_mode=p_mode
      and o.review_status='pending' and o.fulfillment_status<>'delivered' and o.delivered_at is null
      and e.status='pending' and j.answer_revision=o.answer_revision
      and j.status in ('queued','preparing') and j.next_attempt_at<=now()
      and (j.lease_until is null or j.lease_until<now())
      and not exists(select 1 from us_soulmate_order_assets a where a.order_id=o.id)
    order by o.scheduled_send_at,j.next_attempt_at for update of o skip locked limit least(greatest(p_limit,1),2)
  ) update us_soulmate_report_jobs j set status='preparing',lease_id=gen_random_uuid(),
      lease_until=now()+interval '10 minutes',updated_at=now()
    from candidates c where j.order_id=c.id returning j.*;
end $$;

create function public.checkpoint_us_soulmate_reports(p_order text,p_revision integer,p_lease uuid,p_state jsonb,
  p_release boolean default false,p_error text default null,p_hold boolean default false)
returns void language plpgsql set search_path=public as $$
declare o us_soulmate_orders;
begin
  select * into o from us_soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending'
    or o.answer_revision<>p_revision or o.fulfillment_status='delivered'
    or not exists(select 1 from us_soulmate_email_deliveries where order_id=p_order and status='pending')
    or exists(select 1 from us_soulmate_order_assets where order_id=p_order)
    then raise exception 'Preparation snapshot is no longer current'; end if;
  update us_soulmate_report_jobs set state=p_state,status=case when p_hold then 'needs_review' else 'preparing' end,
    lease_id=case when p_release then null else lease_id end,
    lease_until=case when p_release then null else lease_until end,
    failures=case when p_error is not null then failures+1 else 0 end,
    last_error=left(p_error,1000),
    next_attempt_at=now()+case when p_error is not null then interval '5 minutes' else interval '30 seconds' end,updated_at=now()
    where order_id=p_order and answer_revision=p_revision and lease_id=p_lease and lease_until>now();
  if not found then raise exception 'Preparation lease expired'; end if;
  update us_soulmate_generation_jobs set status=case when p_hold then 'needs_review' else 'generating' end,
    last_error=left(p_error,1000),updated_at=now() where order_id=p_order and answer_revision=p_revision;
end $$;

create function public.finish_us_soulmate_reports(p_order text,p_revision integer,p_lease uuid)
returns void language plpgsql set search_path=public as $$
declare o us_soulmate_orders; j us_soulmate_report_jobs; a jsonb;
begin
  select * into o from us_soulmate_orders where id=p_order for update;
  select * into j from us_soulmate_report_jobs where order_id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending'
    or o.fulfillment_status='delivered' or o.answer_revision<>p_revision
    or j.answer_revision<>p_revision or j.lease_id is distinct from p_lease or j.lease_until<=now()
    or j.status<>'preparing' or j.state->>'stage' is distinct from 'prepared'
    or j.state->'quality'->>'passed' is distinct from 'true'
    or not exists(select 1 from us_soulmate_email_deliveries where order_id=p_order and status='pending')
    or exists(select 1 from us_soulmate_order_assets where order_id=p_order)
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
    insert into us_soulmate_order_assets(order_id,kind,storage_path,filename,content_type,size_bytes,sha256)
      values(p_order,a->>'kind',a->>'storagePath',a->>'filename','application/pdf',(a->>'size')::integer,a->>'sha256');
  end loop;
  update us_soulmate_orders set review_status='approved',reviewed_at=now(),
    review_note='Automatic checks passed: ' || coalesce(j.state->'quality'->>'fingerprint',''),updated_at=now() where id=p_order;
  update us_soulmate_generation_jobs set status='ready',last_error=null,failures=0,
    next_attempt_at=greatest(now(),o.scheduled_send_at),updated_at=now() where order_id=p_order;
  update us_soulmate_report_jobs set status='ready',lease_id=null,lease_until=null,last_error=null,updated_at=now() where order_id=p_order;
end $$;
revoke all on function public.claim_us_soulmate_report_jobs(text,integer),public.checkpoint_us_soulmate_reports(text,integer,uuid,jsonb,boolean,text,boolean),public.finish_us_soulmate_reports(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_us_soulmate_report_jobs(text,integer),public.checkpoint_us_soulmate_reports(text,integer,uuid,jsonb,boolean,text,boolean),public.finish_us_soulmate_reports(text,integer,uuid) to service_role;

-- Source: 20261017110000_soulmate_backend_delivery_schedule.sql
-- New payments only. Existing paid schedules and commercial snapshots remain immutable.
create or replace function public.us_soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.customer_name,new.customer_email,new.customer_phone,new.plan,new.amount,new.base_amount,new.gst_amount,new.session_id,new.payment_mode,new.checkout_fingerprint,new.catalog_version,new.line_items,new.add_ons,new.entitlements,new.product_info,new.delivery_hours)
     is distinct from row(old.customer_name,old.customer_email,old.customer_phone,old.plan,old.amount,old.base_amount,old.gst_amount,old.session_id,old.payment_mode,old.checkout_fingerprint,old.catalog_version,old.line_items,old.add_ons,old.entitlements,old.product_info,old.delivery_hours) then
    raise exception 'Soulmate order commercial snapshot is immutable';
  end if;
  if new.answers is distinct from old.answers then
    if new.answer_revision<>old.answer_revision+1 or not exists(
      select 1 from public.us_soulmate_order_answer_revisions r
      where r.order_id=old.id and r.revision=new.answer_revision
        and r.previous_answers=old.answers and r.revised_answers=new.answers
    ) then
      raise exception 'Soulmate answers require an audited revision';
    end if;
  elsif row(new.answer_revision,new.answers_updated_at) is distinct from row(old.answer_revision,old.answers_updated_at) then
    raise exception 'Soulmate answer revision metadata is immutable';
  end if;
  if old.payment_status='paid' and row(new.payment_status,new.paid_at,new.scheduled_send_at) is distinct from row(old.payment_status,old.paid_at,old.scheduled_send_at) then
    raise exception 'Paid soulmate order cannot be downgraded or rescheduled';
  end if;
  if new.payment_status='paid' and old.payment_status<>'paid' then
    if new.paid_at is null then raise exception 'Paid timestamp required'; end if;
    -- Backend send target is independent of the immutable 12/48-hour customer promise.
    new.scheduled_send_at := new.paid_at + make_interval(hours => case when new.catalog_version=2 then 8 else new.delivery_hours end);
  end if;
  return new;
end $$;


-- Source: 20261017120000_soulmate_tracking_views.sql
-- Dedicated storage for Soulmate shared views. No normal-flow settings are changed.
create table public.us_soulmate_tracking_views (
  key text primary key check (key like 'us_soulmate_tracking_view_%'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.us_soulmate_tracking_views enable row level security;
revoke all on public.us_soulmate_tracking_views from anon, authenticated;
grant all on public.us_soulmate_tracking_views to service_role;
create index us_soulmate_tracking_paid_at_idx on public.us_soulmate_orders(paid_at, id)
  where funnel = 'us_soulmate_standalone' and payment_mode = 'live' and payment_status = 'paid'
  and attribution->>'trackingEnvironment' = 'production';

-- Preserve gateway refund times for hourly tracking; older callers remain compatible.
alter table public.us_soulmate_refund_events add column occurred_at timestamptz;
create or replace function public.finish_us_soulmate_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from us_soulmate_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into us_soulmate_refund_events(event_id,order_id,date,amount_paise,gst_paise,occurred_at)
    select event_id,order_id,date,amount_paise,gst_paise,occurred_at from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint,occurred_at timestamptz)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,occurred_at=coalesce(excluded.occurred_at,us_soulmate_refund_events.occurred_at),synced_at=now();
  delete from us_soulmate_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into us_soulmate_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into us_soulmate_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update us_soulmate_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;
alter table public.us_soulmate_orders add column stripe_session_id text unique;
alter table public.us_soulmate_orders add column stripe_charge_id text unique;
alter table public.us_soulmate_orders add constraint us_soulmate_tax_zero check (gst_amount = 0);
update public.us_soulmate_admin_settings set exchange_rate = 1;
commit;
