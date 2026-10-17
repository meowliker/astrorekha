-- Isolated Soulmate reporting. No main-flow tables or credentials are copied.
create table public.soulmate_admin_settings (
  id boolean primary key default true check (id),
  accounts jsonb not null default '[]'::jsonb,
  exchange_rate numeric check (exchange_rate > 0 and exchange_rate <= 1000),
  revision integer not null default 1,
  sync_owner uuid,
  sync_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.soulmate_admin_settings (id) values (true);
create table public.soulmate_profit_sheet (
  date text primary key check (date >= '2026-10-15'),
  data jsonb not null,
  exchange_rate numeric,
  config_revision integer not null,
  synced_at timestamptz not null default now()
);
create table public.soulmate_ad_spend_daily (
  date text not null,
  account_id text not null,
  data jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (date, account_id)
);
create table public.soulmate_refund_events (
  event_id text primary key,
  order_id text not null references public.soulmate_orders(id),
  date text not null,
  amount_paise bigint not null check (amount_paise > 0),
  gst_paise bigint not null check (gst_paise >= 0),
  synced_at timestamptz not null default now()
);
create index on public.soulmate_refund_events(date);
alter table public.soulmate_admin_settings enable row level security;
alter table public.soulmate_profit_sheet enable row level security;
alter table public.soulmate_ad_spend_daily enable row level security;
alter table public.soulmate_refund_events enable row level security;
revoke all on public.soulmate_admin_settings, public.soulmate_profit_sheet, public.soulmate_ad_spend_daily, public.soulmate_refund_events from anon, authenticated;
grant all on public.soulmate_admin_settings, public.soulmate_profit_sheet, public.soulmate_ad_spend_daily, public.soulmate_refund_events to service_role;

create function public.save_soulmate_profit_settings(p_revision integer, p_accounts jsonb, p_rate numeric)
returns integer language plpgsql security definer set search_path = public as $$
declare v_revision integer;
begin
  update soulmate_admin_settings set accounts=p_accounts, exchange_rate=p_rate,
    revision=revision+1, updated_at=now() where id=true and revision=p_revision
    returning revision into v_revision;
  if v_revision is null then raise exception 'Settings changed. Reload and try again.'; end if;
  return v_revision;
end $$;

-- One bounded sync at a time; a changed configuration cannot receive stale results.
create function public.claim_soulmate_profit_sync(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update soulmate_admin_settings set sync_owner=p_owner, sync_until=now()+interval '5 minutes'
    where id=true and (sync_until is null or sync_until < now());
  return found;
end $$;
create function public.finish_soulmate_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from soulmate_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into soulmate_refund_events(event_id,order_id,date,amount_paise,gst_paise)
    select event_id,order_id,date,amount_paise,gst_paise from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,synced_at=now();
  delete from soulmate_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into soulmate_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into soulmate_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update soulmate_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;
revoke all on function public.save_soulmate_profit_settings(integer,jsonb,numeric), public.claim_soulmate_profit_sync(uuid), public.finish_soulmate_profit_sync(uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_soulmate_profit_settings(integer,jsonb,numeric), public.claim_soulmate_profit_sync(uuid), public.finish_soulmate_profit_sync(uuid,integer,jsonb,jsonb,jsonb) to service_role;
