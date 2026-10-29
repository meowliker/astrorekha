-- Pine Labs is opt-in; this migration never changes the active gateway.
alter table public.soulmate_orders add column if not exists gateway_order_id text;
create unique index if not exists soulmate_gateway_order_uidx on public.soulmate_orders(gateway,gateway_order_id) where gateway_order_id is not null;
create index if not exists payments_pinelabs_reconcile_idx on public.payments(gateway_checked_at nulls first) where gateway='pinelabs';
create or replace function public.fulfill_pinelabs_report_payment(p_order text,p_transaction text,p_amount bigint,p_paid_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; u public.users%rowtype; grants jsonb; item text;
begin
  select * into p from public.payments where id=p_order and gateway='pinelabs' for update;
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
revoke all on function public.fulfill_pinelabs_report_payment(text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.fulfill_pinelabs_report_payment(text,text,bigint,timestamptz) to service_role;


-- Bind provider ID once; all commercial data is immutable after creation.
create or replace function public.guard_pinelabs_order() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.gateway='pinelabs' or (TG_OP='UPDATE' and old.gateway='pinelabs')) and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Server-only payment'; end if;
  if TG_OP='UPDATE' and old.gateway='pinelabs' then
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
create trigger payments_pinelabs_guard before insert or update on public.payments for each row execute function public.guard_pinelabs_order();
create trigger soulmate_pinelabs_guard before insert or update on public.soulmate_orders for each row execute function public.guard_pinelabs_order();

-- Persist signed webhook identifiers before acknowledgement; no customer payloads or secrets.
create table public.pinelabs_webhook_events (
  event_id text primary key, event_type text not null, provider_order_id text not null,
  payment_mode text not null check(payment_mode in ('live','test')),
  created_at timestamptz not null default now(), checked_at timestamptz, processed_at timestamptz
);
alter table public.pinelabs_webhook_events enable row level security;
revoke all on public.pinelabs_webhook_events from anon,authenticated;
grant all on public.pinelabs_webhook_events to service_role;
create index pinelabs_webhook_pending_idx on public.pinelabs_webhook_events(checked_at nulls first) where processed_at is null;
create or replace function public.pinelabs_backup_schema_version() returns integer language sql stable as $$ select 1; $$;
revoke all on function public.pinelabs_backup_schema_version() from public,anon,authenticated;
grant execute on function public.pinelabs_backup_schema_version() to service_role;
