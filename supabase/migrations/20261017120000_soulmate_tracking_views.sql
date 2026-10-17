-- Dedicated storage for Soulmate shared views. No normal-flow settings are changed.
create table public.soulmate_tracking_views (
  key text primary key check (key like 'soulmate_tracking_view_%'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.soulmate_tracking_views enable row level security;
revoke all on public.soulmate_tracking_views from anon, authenticated;
grant all on public.soulmate_tracking_views to service_role;
create index soulmate_tracking_paid_at_idx on public.soulmate_orders(paid_at, id)
  where funnel = 'soulmate_standalone' and payment_mode = 'live' and payment_status = 'paid'
  and attribution->>'trackingEnvironment' = 'production';

-- Preserve gateway refund times for hourly tracking; older callers remain compatible.
alter table public.soulmate_refund_events add column occurred_at timestamptz;
create or replace function public.finish_soulmate_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from soulmate_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into soulmate_refund_events(event_id,order_id,date,amount_paise,gst_paise,occurred_at)
    select event_id,order_id,date,amount_paise,gst_paise,occurred_at from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint,occurred_at timestamptz)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,occurred_at=coalesce(excluded.occurred_at,soulmate_refund_events.occurred_at),synced_at=now();
  delete from soulmate_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into soulmate_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into soulmate_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update soulmate_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;
