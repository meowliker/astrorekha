-- Additive US main funnel. No existing gateway, pricing, ledger or reporting table is changed.
create table public.us_main_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.us_main_settings(key,value) values ('prices_usd_cents','{"palm-reading": 704, "palm-birth": 1056, "palm-birth-compat": 2013, "palm-birth-sketch": 2013, "palm-birth-sketch-aura-astro": 3271, "2026-predictions": 628, "compatibility": 628, "birth-chart": 628, "soulmate-sketch": 628, "past-life": 628, "numerology": 628, "spirit-animal": 628, "witch-archetype": 628}');
create table public.us_main_orders (
 id text primary key check(id ~ '^us_ar_[a-f0-9]{24}$'), funnel text not null default 'us_main' check(funnel='us_main'),
 owner_hash text not null, request_key text not null, user_id text references public.users(id),
 customer_email text not null, customer_name text not null,
 type text not null check(type in ('bundle','upsell')), bundle_id text, parent_order_id text references public.us_main_orders(id),
 amount_cents bigint not null check(amount_cents>=50), currency text not null default 'USD' check(currency='USD'),
 payment_mode text not null check(payment_mode in ('live','test')), payment_status text not null default 'pending' check(payment_status in ('pending','paid','failed')),
 stripe_session_id text unique, stripe_payment_id text unique, stripe_charge_id text unique,
 line_items jsonb not null check(jsonb_typeof(line_items)='array'), fulfillment_features jsonb not null check(jsonb_typeof(fulfillment_features)='array'), fulfillment_coins integer not null default 0 check(fulfillment_coins>=0),
 birth_details jsonb not null default '{}', attribution jsonb not null default '{}',
 created_at timestamptz not null default now(), paid_at timestamptz, fulfilled_at timestamptz, checked_at timestamptz, tracking_checked_at timestamptz,
 meta_purchase_sent_at timestamptz, meta_purchase_claimed_at timestamptz, ga_purchase_sent_at timestamptz, ga_purchase_claimed_at timestamptz,
 unique(owner_hash,request_key), check((type='bundle' and parent_order_id is null) or (type='upsell' and parent_order_id is not null))
);
create index us_main_pending on public.us_main_orders(checked_at nulls first) where fulfilled_at is null;
create index us_main_paid on public.us_main_orders(paid_at desc) where payment_status='paid';
create table public.us_main_events (id uuid primary key default gen_random_uuid(), event_id text not null unique, event_name text not null, path text not null, session_id text not null, attribution jsonb not null default '{}', environment text not null, created_at timestamptz not null default now());
create index us_main_events_time on public.us_main_events(created_at desc);
alter table public.us_main_settings enable row level security;
alter table public.us_main_orders enable row level security;
alter table public.us_main_events enable row level security;
revoke all on public.us_main_settings,public.us_main_orders,public.us_main_events from public,anon,authenticated;
grant all on public.us_main_settings,public.us_main_orders,public.us_main_events to service_role;

create function public.fulfill_us_main_order(p_order text,p_session text,p_intent text,p_charge text,p_amount bigint,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare o public.us_main_orders%rowtype; u public.users%rowtype; grants jsonb; feature text;
begin
 select * into o from public.us_main_orders where id=p_order for update;
 if o.id is null or o.stripe_session_id is distinct from p_session or o.amount_cents<>p_amount or nullif(p_intent,'') is null or nullif(p_charge,'') is null or p_paid_at is null or p_paid_at>now()+interval '1 minute' then raise exception 'Invalid verified US payment'; end if;
 if o.fulfilled_at is not null then
   if o.stripe_payment_id is distinct from p_intent or o.stripe_charge_id is distinct from p_charge then raise exception 'Payment identity mismatch'; end if;
   return false;
 end if;
 -- Serialize same-email fulfillment, including parallel bundle/upsell webhook deliveries.
 perform pg_advisory_xact_lock(hashtextextended(lower(o.customer_email),0));
 select * into u from public.users where email=o.customer_email for update;
 if u.id is null then
   insert into public.users(id,email,created_at,updated_at) values(gen_random_uuid()::text,o.customer_email,now(),now()) returning * into u;
 end if;
 grants:=coalesce(u.unlocked_features,'{}'::jsonb);
 for feature in select jsonb_array_elements_text(o.fulfillment_features) loop grants:=grants||jsonb_build_object(feature,true); end loop;
 update public.users set unlocked_features=grants,coins=coalesce(coins,0)+o.fulfillment_coins,payment_status='paid',purchase_type='one-time',
 bundle_purchased=case when o.type='bundle' then o.bundle_id else bundle_purchased end,updated_at=now() where id=u.id;
 update public.us_main_orders set user_id=u.id,payment_status='paid',stripe_payment_id=p_intent,stripe_charge_id=p_charge,paid_at=p_paid_at,fulfilled_at=now(),checked_at=now() where id=o.id;
 return true;
end; $$;
revoke all on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) to service_role;
create function public.guard_us_main_order() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.owner_hash,new.request_key,new.customer_email,new.type,new.bundle_id,new.parent_order_id,new.amount_cents,new.currency,new.payment_mode,new.line_items,new.fulfillment_features,new.fulfillment_coins,new.funnel,new.birth_details)
 is distinct from row(old.owner_hash,old.request_key,old.customer_email,old.type,old.bundle_id,old.parent_order_id,old.amount_cents,old.currency,old.payment_mode,old.line_items,old.fulfillment_features,old.fulfillment_coins,old.funnel,old.birth_details) then raise exception 'US purchase snapshot is immutable'; end if;
 if old.stripe_session_id is not null and new.stripe_session_id is distinct from old.stripe_session_id then raise exception 'Session identity changed'; end if;
 if old.fulfilled_at is not null and row(new.payment_status,new.paid_at,new.fulfilled_at,new.stripe_payment_id,new.stripe_charge_id,new.user_id) is distinct from row(old.payment_status,old.paid_at,old.fulfilled_at,old.stripe_payment_id,old.stripe_charge_id,old.user_id) then raise exception 'Fulfilled purchase is immutable'; end if;
 return new;
end; $$;
create trigger us_main_order_guard before update on public.us_main_orders for each row execute function public.guard_us_main_order();

create function public.us_main_summary(p_from timestamptz,p_to timestamptz,p_mode text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'paidOrders',(select count(*) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to),
  'grossCents',(select coalesce(sum(amount_cents),0) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to),
  'visits',(select count(distinct session_id) from us_main_events where event_name='page_view' and path='/us' and created_at>=p_from and created_at<p_to and ((p_mode='live' and environment='production') or (p_mode='test' and environment<>'production')))
 );
$$;
revoke all on function public.us_main_summary(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.us_main_summary(timestamptz,timestamptz,text) to service_role;
