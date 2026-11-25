-- Fastrr is opt-in; this migration never changes the active gateway.
alter table public.soulmate_orders add column if not exists gateway_order_id text;
create unique index if not exists soulmate_gateway_order_uidx on public.soulmate_orders(gateway,gateway_order_id) where gateway_order_id is not null;
create index if not exists payments_shiprocket_reconcile_idx on public.payments(gateway_checked_at nulls first) where gateway='shiprocket';
create or replace function public.fulfill_shiprocket_report_payment(p_order text,p_transaction text,p_amount bigint,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; u public.users%rowtype; grants jsonb; item text;
begin
  select * into p from public.payments where id=p_order and gateway='shiprocket' for update;
  if p.id is null or p.amount<=0 or p.amount<>p_amount or p.currency<>'INR' or nullif(p_transaction,'') is null then raise exception 'Invalid verified payment'; end if;
  if p.gateway_transaction_id is not null and p.gateway_transaction_id<>p_transaction then raise exception 'Transaction reference changed'; end if;
  if p.fulfilled_at is not null then return false; end if;
  if p.fulfillment_features is null or jsonb_typeof(p.fulfillment_features)<>'array' or p.fulfillment_coins is null or p.fulfillment_coins<0 then raise exception 'Missing purchase snapshot'; end if;
  select * into u from public.users where id=p.user_id for update;
  if u.id is null then raise exception 'Customer missing'; end if;
  grants:=coalesce(u.unlocked_features,'{}'::jsonb);
  for item in select jsonb_array_elements_text(p.fulfillment_features) loop grants:=grants||jsonb_build_object(item,true); end loop;
  update public.users set unlocked_features=grants,coins=coalesce(coins,0)+p.fulfillment_coins,
    payment_status='paid',purchase_type=case when p.type='chat_pass' then coalesce(purchase_type,'one-time') when p.type='bundle' then 'one-time' else p.type end,
    bundle_purchased=case when p.type='bundle' then p.bundle_id else bundle_purchased end,updated_at=now() where id=p.user_id;
  update public.payments set payment_status='paid',gateway_transaction_id=p_transaction,
    paid_at=coalesce(paid_at,p_paid_at,now()),fulfilled_at=now(),meta_purchase_queued_at=coalesce(meta_purchase_queued_at,now()) where id=p.id;
  return true;
end; $$;
revoke all on function public.fulfill_shiprocket_report_payment(text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_shiprocket_report_payment(text,text,bigint,timestamptz) to service_role;


-- Bind provider ID once; all commercial data is immutable after creation.
create or replace function public.guard_shiprocket_order() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.gateway='shiprocket' or (TG_OP='UPDATE' and old.gateway='shiprocket')) and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Server-only payment'; end if;
  if TG_OP='UPDATE' and old.gateway='shiprocket' then
    if new.gateway is distinct from old.gateway or new.amount is distinct from old.amount or new.payment_mode is distinct from old.payment_mode or new.customer_email is distinct from old.customer_email then raise exception 'Purchase snapshot is immutable'; end if;
    if old.gateway_order_id is not null and new.gateway_order_id is distinct from old.gateway_order_id then raise exception 'Provider order cannot change'; end if;
    if old.gateway_transaction_id is not null and new.gateway_transaction_id is distinct from old.gateway_transaction_id then raise exception 'Payment reference cannot change'; end if;
    if old.payment_status='paid' and new.payment_status is distinct from 'paid' then raise exception 'Cannot downgrade paid order'; end if;
    if TG_TABLE_NAME='payments' then
      if row(new.user_id,new.currency,new.fulfillment_features,new.fulfillment_coins,new.bundle_id,new.feature,new.type,new.base_amount,new.gst_amount,new.total_amount)
        is distinct from row(old.user_id,old.currency,old.fulfillment_features,old.fulfillment_coins,old.bundle_id,old.feature,old.type,old.base_amount,old.gst_amount,old.total_amount) then raise exception 'Purchase snapshot is immutable'; end if;
    else
      if row(new.plan,new.base_amount,new.gst_amount,new.line_items,new.entitlements,new.add_ons,new.answers,new.delivery_hours)
        is distinct from row(old.plan,old.base_amount,old.gst_amount,old.line_items,old.entitlements,old.add_ons,old.answers,old.delivery_hours) then raise exception 'Purchase snapshot is immutable'; end if;
    end if;
  end if;
  return new;
end; $$;
create trigger payments_shiprocket_guard before insert or update on public.payments for each row execute function public.guard_shiprocket_order();
create trigger soulmate_shiprocket_guard before insert or update on public.soulmate_orders for each row execute function public.guard_shiprocket_order();


-- Checkout tokens are encrypted at rest; only server code can read these rows.
create table public.shiprocket_checkout_sessions (
  order_id text primary key,
  payment_mode text not null check (payment_mode in ('live','test')),
  variant_id text not null check (variant_id ~ '^[0-9]+$'),
  return_state text not null,
  provider_order_id text unique check (provider_order_id ~ '^[a-f0-9]{24}$'),
  token_encrypted text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.shiprocket_checkout_sessions enable row level security;
revoke all on public.shiprocket_checkout_sessions from public,anon,authenticated;
grant select,insert,update on public.shiprocket_checkout_sessions to service_role;
create or replace function public.guard_shiprocket_session() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then
    if not exists(select 1 from public.payments where id=new.order_id and gateway='shiprocket' and payment_mode=new.payment_mode)
      and not exists(select 1 from public.soulmate_orders where id=new.order_id and gateway='shiprocket' and payment_mode=new.payment_mode)
      then raise exception 'Missing saved Fastrr purchase'; end if;
  elsif row(new.order_id,new.payment_mode,new.variant_id,new.return_state) is distinct from row(old.order_id,old.payment_mode,old.variant_id,old.return_state)
    or (old.provider_order_id is not null and row(new.provider_order_id,new.token_encrypted,new.expires_at) is distinct from row(old.provider_order_id,old.token_encrypted,old.expires_at))
    then raise exception 'Fastrr checkout binding is immutable';
  end if;
  return new;
end; $$;
create trigger shiprocket_checkout_session_guard before insert or update on public.shiprocket_checkout_sessions for each row execute function public.guard_shiprocket_session();
create or replace function public.shiprocket_checkout_schema_version() returns integer language sql stable as $$ select 1; $$;
revoke all on function public.shiprocket_checkout_schema_version() from public,anon,authenticated;
grant execute on function public.shiprocket_checkout_schema_version() to service_role;
