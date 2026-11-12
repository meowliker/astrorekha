-- Extend only the US ledger. No existing INR prices, payments or credits are rewritten.
create table public.customer_markets(user_id text primary key references public.users(id),market text not null check(market in ('IN','US')),source_order_id text references public.us_main_orders(id),created_at timestamptz not null default now());
create table public.us_main_chat_passes(order_id text primary key references public.us_main_orders(id),user_id text not null references public.users(id),starts_at timestamptz not null,ends_at timestamptz not null,check(ends_at>starts_at));
alter table public.us_main_events add column user_id text references public.users(id),add column product_type text,add column product_id text;
create index us_main_chat_passes_active on public.us_main_chat_passes(user_id,ends_at desc);
alter table public.customer_markets enable row level security;
alter table public.us_main_chat_passes enable row level security;
revoke all on public.customer_markets,public.us_main_chat_passes from public,anon,authenticated;
grant all on public.customer_markets,public.us_main_chat_passes to service_role;
-- Existing US main purchasers retain their market unless they also have an older INR purchase.
insert into public.customer_markets(user_id,market,source_order_id)
select distinct on(o.user_id) o.user_id,
 case when exists(select 1 from payments p where p.user_id=o.user_id and p.payment_status in ('paid','success','captured') and p.created_at<o.paid_at) then 'IN' else 'US' end,o.id
from us_main_orders o where o.fulfilled_at is not null and o.type='bundle' order by o.user_id,o.paid_at;
alter table public.us_main_orders drop constraint us_main_orders_type_check;
alter table public.us_main_orders drop constraint us_main_orders_check;
alter table public.us_main_orders add constraint us_main_orders_type_check check(type in ('bundle','upsell','report','coins','chat_pass'));
alter table public.us_main_orders add constraint us_main_orders_parent_check check((type='upsell' and parent_order_id is not null) or(type<>'upsell' and parent_order_id is null));
update public.us_main_settings set value=value||'{"report-2026": 621, "report-birth-chart": 621, "report-compatibility": 621, "report-soulmate-sketch": 621, "report-future-partner": 621, "report-aura-color": 621, "report-astrocartography": 621, "report-past-life": 621, "report-numerology": 621, "report-spirit-animal": 621, "report-vastu-shastra-guide": 317, "report-witch-archetype": 621, "coins-50": 212, "coins-150": 543, "coins-300": 895, "coins-500": 1279, "elysia-unlimited-20m": 372}'::jsonb,updated_at=now() where key='prices_usd_cents';
create or replace function public.fulfill_us_main_order(p_order text,p_session text,p_intent text,p_charge text,p_amount bigint,p_paid_at timestamptz)
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
 if o.user_id is not null and o.user_id<>u.id then raise exception 'Account identity mismatch'; end if;
 if o.type='bundle' then
   insert into public.customer_markets(user_id,market,source_order_id)
   values(u.id,case when u.payment_status='paid' and not exists(select 1 from us_main_orders where user_id=u.id and fulfilled_at is not null) then 'IN' else 'US' end,o.id)
   on conflict(user_id) do nothing;
 end if;
 if o.type in ('report','coins','chat_pass') and not exists(select 1 from customer_markets where user_id=u.id and market='US') then raise exception 'US account required'; end if;
 grants:=coalesce(u.unlocked_features,'{}'::jsonb);
 for feature in select jsonb_array_elements_text(o.fulfillment_features) loop grants:=grants||jsonb_build_object(feature,true); end loop;
 update public.users set unlocked_features=grants,coins=coalesce(coins,0)+o.fulfillment_coins,payment_status='paid',purchase_type='one-time',
 bundle_purchased=case when o.type='bundle' then o.bundle_id else bundle_purchased end,updated_at=now() where id=u.id;
 update public.us_main_orders set user_id=u.id,payment_status='paid',stripe_payment_id=p_intent,stripe_charge_id=p_charge,paid_at=p_paid_at,fulfilled_at=now(),checked_at=now() where id=o.id;
 if o.type='chat_pass' then
   insert into us_main_chat_passes(order_id,user_id,starts_at,ends_at)
   select o.id,u.id,greatest(now(),coalesce(max(ends_at),now())),greatest(now(),coalesce(max(ends_at),now()))+interval '20 minutes'
   from us_main_chat_passes where user_id=u.id;
 end if;
 return true;
end; $$;
revoke all on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) to service_role;
