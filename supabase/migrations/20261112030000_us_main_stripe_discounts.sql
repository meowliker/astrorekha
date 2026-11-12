-- Store Stripe-verified discounted totals without altering the original basket or INR flows.
alter table public.us_main_orders add column paid_amount_cents bigint check(paid_amount_cents>=0 and paid_amount_cents<=amount_cents);
create or replace function public.fulfill_us_main_order(p_order text,p_session text,p_intent text,p_charge text,p_amount bigint,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare o public.us_main_orders%rowtype; u public.users%rowtype; grants jsonb; feature text;
begin
 select * into o from public.us_main_orders where id=p_order for update;
 if o.id is null or o.stripe_session_id is distinct from p_session or p_amount is null or p_amount<0 or p_amount>o.amount_cents or (p_amount>0 and (nullif(p_intent,'') is null or nullif(p_charge,'') is null)) or (p_amount=0 and (p_intent is not null or p_charge is not null)) or p_paid_at is null or p_paid_at>now()+interval '1 minute' then raise exception 'Invalid verified US payment'; end if;
 if o.fulfilled_at is not null then
   if coalesce(o.paid_amount_cents,o.amount_cents)<>p_amount or o.stripe_payment_id is distinct from p_intent or o.stripe_charge_id is distinct from p_charge then raise exception 'Payment identity mismatch'; end if;
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
 update public.us_main_orders set user_id=u.id,paid_amount_cents=p_amount,payment_status='paid',stripe_payment_id=p_intent,stripe_charge_id=p_charge,paid_at=p_paid_at,fulfilled_at=now(),checked_at=now() where id=o.id;
 if o.type='chat_pass' then
   insert into us_main_chat_passes(order_id,user_id,starts_at,ends_at)
   select o.id,u.id,greatest(now(),coalesce(max(ends_at),now())),greatest(now(),coalesce(max(ends_at),now()))+interval '20 minutes'
   from us_main_chat_passes where user_id=u.id;
 end if;
 return true;
end; $$;
revoke all on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_us_main_order(text,text,text,text,bigint,timestamptz) to service_role;

create or replace function public.guard_us_main_order() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.owner_hash,new.request_key,new.customer_email,new.type,new.bundle_id,new.parent_order_id,new.amount_cents,new.currency,new.payment_mode,new.line_items,new.fulfillment_features,new.fulfillment_coins,new.funnel,new.birth_details)
 is distinct from row(old.owner_hash,old.request_key,old.customer_email,old.type,old.bundle_id,old.parent_order_id,old.amount_cents,old.currency,old.payment_mode,old.line_items,old.fulfillment_features,old.fulfillment_coins,old.funnel,old.birth_details) then raise exception 'US purchase snapshot is immutable'; end if;
 if old.stripe_session_id is not null and new.stripe_session_id is distinct from old.stripe_session_id then raise exception 'Session identity changed'; end if;
 if old.fulfilled_at is not null and row(new.paid_amount_cents,new.payment_status,new.paid_at,new.fulfilled_at,new.stripe_payment_id,new.stripe_charge_id,new.user_id) is distinct from row(old.paid_amount_cents,old.payment_status,old.paid_at,old.fulfilled_at,old.stripe_payment_id,old.stripe_charge_id,old.user_id) then raise exception 'Fulfilled purchase is immutable'; end if;
 return new;
end; $$;

create or replace function public.us_main_summary(p_from timestamptz,p_to timestamptz,p_mode text,p_environment text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'paidOrders',(select count(*) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to and attribution->>'trackingEnvironment'=p_environment),
  'grossCents',(select coalesce(sum(coalesce(paid_amount_cents,amount_cents)),0) from us_main_orders where payment_mode=p_mode and payment_status='paid' and paid_at>=p_from and paid_at<p_to and attribution->>'trackingEnvironment'=p_environment),
  'visits',(select count(distinct session_id) from us_main_events where event_name='page_view' and path='/us' and created_at>=p_from and created_at<p_to and environment=p_environment)
 );
$$;
revoke all on function public.us_main_summary(timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.us_main_summary(timestamptz,timestamptz,text,text) to service_role;
