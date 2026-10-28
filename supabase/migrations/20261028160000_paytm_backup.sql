-- Additive backup gateway. Existing PayU/Razorpay rows keep their current identifiers.
alter table public.payments
  add column if not exists gateway text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_transaction_id text,
  add column if not exists payment_mode text,
  add column if not exists product_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_name text,
  add column if not exists fulfillment_features jsonb,
  add column if not exists fulfillment_coins integer,
  add column if not exists paid_at timestamptz,
  add column if not exists gateway_checked_at timestamptz,
  add column if not exists gateway_check_until timestamptz;
create unique index if not exists payments_gateway_order_uidx on public.payments(gateway,gateway_order_id) where gateway_order_id is not null;
create unique index if not exists payments_gateway_transaction_uidx on public.payments(gateway,gateway_transaction_id) where gateway_transaction_id is not null and amount>0;
create index if not exists payments_paytm_reconcile_idx on public.payments(gateway_checked_at nulls first) where gateway='paytm';
alter table public.soulmate_orders
  add column if not exists gateway text not null default 'payu',
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_check_until timestamptz;
create unique index if not exists soulmate_gateway_transaction_uidx on public.soulmate_orders(gateway,gateway_transaction_id) where gateway_transaction_id is not null;

create table if not exists public.payment_gateway_requests (
  id bigint generated always as identity primary key,
  gateway text not null, operation text not null, order_id text not null,
  environment text not null, http_status integer, outcome text not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_gateway_requests_month_idx on public.payment_gateway_requests(gateway,created_at);
alter table public.payment_gateway_requests enable row level security;
revoke all on public.payment_gateway_requests from anon,authenticated;
grant all on public.payment_gateway_requests to service_role;
grant usage,select on sequence public.payment_gateway_requests_id_seq to service_role;

-- Serializes updates for both the order and customer. A crash rolls back the entire grant.
create or replace function public.fulfill_paytm_report_payment(p_order text,p_transaction text,p_amount bigint,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; u public.users%rowtype; grants jsonb; item text;
begin
  select * into p from public.payments where id=p_order and gateway='paytm' for update;
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
revoke all on function public.fulfill_paytm_report_payment(text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_paytm_report_payment(text,text,bigint,timestamptz) to service_role;

-- Browser/public API roles must never mutate new gateway evidence or snapshots.
create or replace function public.guard_paytm_order() returns trigger language plpgsql set search_path=public as $$
begin
  if new.gateway='paytm' and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Server-only payment'; end if;
  if TG_OP='UPDATE' and old.gateway='paytm' then
    if row(new.user_id,new.customer_email,new.gateway,new.gateway_order_id,new.payment_mode,new.amount,new.currency,new.fulfillment_features,new.fulfillment_coins,new.bundle_id,new.feature,new.type)
      is distinct from row(old.user_id,old.customer_email,old.gateway,old.gateway_order_id,old.payment_mode,old.amount,old.currency,old.fulfillment_features,old.fulfillment_coins,old.bundle_id,old.feature,old.type) then raise exception 'Purchase snapshot is immutable'; end if;
    if old.payment_status='paid' and new.payment_status<>'paid' then raise exception 'Cannot downgrade a paid order'; end if;
  end if;
  return new;
end; $$;
create trigger payments_paytm_guard before insert or update on public.payments for each row execute function public.guard_paytm_order();

-- Keep the checkout selector writable only through the authenticated server endpoint.
create or replace function public.guard_payment_gateway_setting() returns trigger language plpgsql as $$
begin
  if ((TG_OP<>'DELETE' and new.key='payment_gateway') or (TG_OP<>'INSERT' and old.key='payment_gateway'))
     and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Server-only gateway setting'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
create trigger payment_gateway_setting_guard before insert or update or delete on public.settings for each row execute function public.guard_payment_gateway_setting();

create or replace function public.paytm_backup_schema_version() returns integer language sql stable as $$ select 1; $$;
revoke all on function public.paytm_backup_schema_version() from public,anon,authenticated;
grant execute on function public.paytm_backup_schema_version() to service_role;
