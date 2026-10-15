begin;
alter table public.soulmate_orders
  add column catalog_version integer not null default 1 check(catalog_version in (1,2)),
  add column line_items jsonb not null default '[]'::jsonb,
  add column add_ons jsonb not null default '[]'::jsonb,
  add column entitlements jsonb not null default '{}'::jsonb,
  add column review_status text not null default 'pending' check(review_status in ('pending','approved')),
  add column reviewed_at timestamptz,
  add column review_note text;
-- Existing paid schedules are immutable. All new catalog orders use 12/48 hours.
alter table public.soulmate_orders drop constraint soulmate_orders_delivery_hours_check;
alter table public.soulmate_orders add constraint soulmate_orders_delivery_hours_check
  check ((catalog_version=1 and delivery_hours in (8,12,48)) or
         (catalog_version=2 and delivery_hours in (12,48) and delivery_hours=(entitlements->>'scheduled_hours')::integer and delivery_hours=(entitlements->>'promised_hours')::integer));
alter table public.soulmate_orders alter column delivery_hours set default 48;
alter table public.soulmate_email_deliveries add column sent_at timestamptz;

create table public.soulmate_order_assets (
  order_id text not null references public.soulmate_orders(id),
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
alter table public.soulmate_order_assets enable row level security;
revoke all on public.soulmate_order_assets from anon,authenticated;
grant all on public.soulmate_order_assets to service_role;
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'] where id='soulmate-sketches-private';

create or replace function public.soulmate_order_snapshot_guard() returns trigger language plpgsql set search_path=public as $$
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
create function public.save_soulmate_order_asset(p_order text,p_kind text,p_path text,p_filename text,p_type text,p_size integer,p_sha text)
returns void language plpgsql set search_path=public as $$
declare o soulmate_orders;
begin
  select * into o from soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' or o.review_status<>'pending' then raise exception 'Order is not awaiting review'; end if;
  if not (o.entitlements->'required_assets' ? p_kind) then raise exception 'Asset was not purchased'; end if;
  if p_size + coalesce((select sum(size_bytes) from soulmate_order_assets where order_id=p_order and kind<>p_kind),0)>7340032 then raise exception 'Combined attachments exceed 7 MiB'; end if;
  insert into soulmate_order_assets(order_id,kind,storage_path,filename,content_type,size_bytes,sha256)
    values(p_order,p_kind,p_path,p_filename,p_type,p_size,p_sha)
    on conflict(order_id,kind) do update set storage_path=excluded.storage_path,filename=excluded.filename,content_type=excluded.content_type,size_bytes=excluded.size_bytes,sha256=excluded.sha256,uploaded_at=now();
end $$;

create function public.approve_soulmate_order(p_order text,p_note text default '')
returns void language plpgsql set search_path=public as $$
declare o soulmate_orders;
begin
  select * into o from soulmate_orders where id=p_order for update;
  if o.id is null or o.catalog_version<>2 or o.payment_status<>'paid' then raise exception 'Order is not a paid review order'; end if;
  if o.review_status='approved' then return; end if;
  if not exists(select 1 from soulmate_order_assets where order_id=p_order and kind='sketch') or
    exists(select 1 from jsonb_array_elements_text(o.entitlements->'required_assets') as required(kind) where not exists(select 1 from soulmate_order_assets a where a.order_id=p_order and a.kind=required.kind)) then
    raise exception 'Upload every purchased deliverable before approval';
  end if;
  update soulmate_orders set review_status='approved',reviewed_at=now(),review_note=left(p_note,2000) where id=p_order;
  update soulmate_generation_jobs set status='ready',last_error=null,next_attempt_at=greatest(now(),o.scheduled_send_at),updated_at=now() where order_id=p_order;
end $$;

-- A version-1 worker can never claim the new bundles and send only its old B&W sketch.
drop function public.claim_soulmate_deliveries(text,integer);
create function public.claim_soulmate_deliveries(p_mode text,p_limit integer default 3,p_catalog_version integer default 1)
returns setof public.soulmate_generation_jobs language plpgsql set search_path=public as $$
begin
  return query with candidates as (
    select j.order_id from soulmate_generation_jobs j
    join soulmate_orders o on o.id=j.order_id join soulmate_email_deliveries e on e.order_id=j.order_id
    where o.payment_status='paid' and o.payment_mode=p_mode and o.catalog_version<=p_catalog_version
      and (o.catalog_version=1 or (o.review_status='approved' and o.scheduled_send_at<=now()))
      and j.status<>'needs_review' and e.status not in ('delivered','needs_review')
      and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<now())
    order by j.next_attempt_at for update of j skip locked limit least(greatest(p_limit,1),3)
  ) update soulmate_generation_jobs j set lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    from candidates c where j.order_id=c.order_id returning j.*;
end $$;
revoke all on function public.save_soulmate_order_asset(text,text,text,text,text,integer,text),public.approve_soulmate_order(text,text),public.claim_soulmate_deliveries(text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_soulmate_order_asset(text,text,text,text,text,integer,text),public.approve_soulmate_order(text,text),public.claim_soulmate_deliveries(text,integer,integer) to service_role;
commit;
