begin;
create table public.us_main_admin_settings (
  id boolean primary key default true check (id),
  accounts jsonb not null default '[]'::jsonb,
  exchange_rate numeric check (exchange_rate > 0 and exchange_rate <= 1000),
  revision integer not null default 1,
  sync_owner uuid,
  sync_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.us_main_admin_settings (id) values (true);
create table public.us_main_profit_sheet (
  date text primary key check (date >= '2026-10-15'),
  data jsonb not null,
  exchange_rate numeric,
  config_revision integer not null,
  synced_at timestamptz not null default now()
);
create table public.us_main_ad_spend_daily (
  date text not null,
  account_id text not null,
  data jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (date, account_id)
);
create table public.us_main_refund_events (
  event_id text primary key,
  order_id text not null references public.us_main_orders(id),
  date text not null,
  amount_paise bigint not null check (amount_paise > 0),
  gst_paise bigint not null check (gst_paise >= 0),
  synced_at timestamptz not null default now()
);
create index on public.us_main_refund_events(date);
alter table public.us_main_admin_settings enable row level security;
alter table public.us_main_profit_sheet enable row level security;
alter table public.us_main_ad_spend_daily enable row level security;
alter table public.us_main_refund_events enable row level security;
revoke all on public.us_main_admin_settings, public.us_main_profit_sheet, public.us_main_ad_spend_daily, public.us_main_refund_events from anon, authenticated;
grant all on public.us_main_admin_settings, public.us_main_profit_sheet, public.us_main_ad_spend_daily, public.us_main_refund_events to service_role;

create function public.save_us_main_profit_settings(p_revision integer, p_accounts jsonb, p_rate numeric)
returns integer language plpgsql security definer set search_path = public as $$
declare v_revision integer;
begin
  update us_main_admin_settings set accounts=p_accounts, exchange_rate=p_rate,
    revision=revision+1, updated_at=now() where id=true and revision=p_revision
    returning revision into v_revision;
  if v_revision is null then raise exception 'Settings changed. Reload and try again.'; end if;
  return v_revision;
end $$;

-- One bounded sync at a time; a changed configuration cannot receive stale results.
create function public.claim_us_main_profit_sync(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update us_main_admin_settings set sync_owner=p_owner, sync_until=now()+interval '5 minutes'
    where id=true and (sync_until is null or sync_until < now());
  return found;
end $$;
create function public.finish_us_main_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from us_main_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into us_main_refund_events(event_id,order_id,date,amount_paise,gst_paise)
    select event_id,order_id,date,amount_paise,gst_paise from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,synced_at=now();
  delete from us_main_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into us_main_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into us_main_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update us_main_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;
revoke all on function public.save_us_main_profit_settings(integer,jsonb,numeric), public.claim_us_main_profit_sync(uuid), public.finish_us_main_profit_sync(uuid,integer,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_us_main_profit_settings(integer,jsonb,numeric), public.claim_us_main_profit_sync(uuid), public.finish_us_main_profit_sync(uuid,integer,jsonb,jsonb,jsonb) to service_role;

create table public.us_main_tracking_views (
  key text primary key check (key like 'us_main_tracking_view_%'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.us_main_tracking_views enable row level security;
revoke all on public.us_main_tracking_views from anon, authenticated;
grant all on public.us_main_tracking_views to service_role;
create index us_main_tracking_paid_at_idx on public.us_main_orders(paid_at, id)
  where payment_mode = 'live' and payment_status = 'paid'
  and attribution->>'trackingEnvironment' = 'production';

-- Preserve gateway refund times for hourly tracking; older callers remain compatible.
alter table public.us_main_refund_events add column occurred_at timestamptz;
create or replace function public.finish_us_main_profit_sync(p_owner uuid, p_revision integer, p_rows jsonb, p_spend jsonb, p_refunds jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from us_main_admin_settings where id=true and sync_owner=p_owner
    and revision=p_revision and sync_until > now() for update;
  if not found then raise exception 'Reporting settings changed or refresh expired. Try again.'; end if;
  insert into us_main_refund_events(event_id,order_id,date,amount_paise,gst_paise,occurred_at)
    select event_id,order_id,date,amount_paise,gst_paise,occurred_at from jsonb_to_recordset(p_refunds)
      as x(event_id text,order_id text,date text,amount_paise bigint,gst_paise bigint,occurred_at timestamptz)
    on conflict(event_id) do update set amount_paise=excluded.amount_paise,gst_paise=excluded.gst_paise,occurred_at=coalesce(excluded.occurred_at,us_main_refund_events.occurred_at),synced_at=now();
  delete from us_main_ad_spend_daily where date in (select x->>'date' from jsonb_array_elements(p_rows) x);
  insert into us_main_ad_spend_daily(date,account_id,data)
    select x->>'date',x->>'accountId',x from jsonb_array_elements(p_spend) x;
  insert into us_main_profit_sheet(date,data,exchange_rate,config_revision)
    select x->>'date',x,(x->>'exchangeRate')::numeric,p_revision from jsonb_array_elements(p_rows) x
    on conflict(date) do update set data=excluded.data,exchange_rate=excluded.exchange_rate,
      config_revision=excluded.config_revision,synced_at=now();
  update us_main_admin_settings set sync_owner=null,sync_until=null where id=true and sync_owner=p_owner;
end $$;

-- Only Anay can delegate workspace access. Existing staff retain existing workspaces.
create table public.admin_workspace_members (
 admin_id text primary key references public.admins(id) on delete cascade,
 is_administrator boolean not null default false,
 active boolean not null default true,
 workspaces text[] not null default '{}',
 updated_at timestamptz not null default now(),
 check(workspaces <@ array['astrorekha','us-main','soulmate','us-soulmate','operations']::text[]),
 check(not is_administrator or admin_id='Anay')
);
insert into public.admin_workspace_members(admin_id,is_administrator,workspaces)
 select id,id='Anay',case when id='Anay' then array['astrorekha','us-main','soulmate','us-soulmate','operations'] else array['astrorekha','soulmate','us-soulmate','operations'] end from public.admins;
create table public.admin_access_audit(id bigint generated always as identity primary key, actor_id text not null, target_id text not null, before_state jsonb, after_state jsonb, created_at timestamptz not null default now());
alter table public.admin_workspace_members enable row level security;
alter table public.admin_access_audit enable row level security;
revoke all on public.admin_workspace_members,public.admin_access_audit from anon,authenticated;
grant all on public.admin_workspace_members,public.admin_access_audit to service_role;
grant usage,select on sequence public.admin_access_audit_id_seq to service_role;
create function public.set_admin_workspace_access(p_actor text,p_target text,p_active boolean,p_workspaces text[])
returns void language plpgsql security definer set search_path=public as $$
declare old_state jsonb; new_state jsonb;
begin
 perform 1 from admin_workspace_members where admin_id=p_actor and active and is_administrator for update;
 if not found then raise exception 'Administrator access required'; end if;
 if p_target='Anay' then raise exception 'Administrator access cannot be removed'; end if;
 if p_workspaces is null or not(p_workspaces <@ array['astrorekha','us-main','soulmate','us-soulmate','operations']::text[]) then raise exception 'Invalid workspaces'; end if;
 select to_jsonb(m) into old_state from admin_workspace_members m where admin_id=p_target for update;
 insert into admin_workspace_members(admin_id,active,workspaces) values(p_target,p_active,p_workspaces)
 on conflict(admin_id) do update set active=excluded.active,workspaces=excluded.workspaces,updated_at=now();
 select to_jsonb(m) into new_state from admin_workspace_members m where admin_id=p_target;
 insert into admin_access_audit(actor_id,target_id,before_state,after_state) values(p_actor,p_target,old_state,new_state);
end $$;
revoke all on function public.set_admin_workspace_access(text,text,boolean,text[]) from public,anon,authenticated;
grant execute on function public.set_admin_workspace_access(text,text,boolean,text[]) to service_role;

create table public.us_main_admin_audit(id bigint generated always as identity primary key, actor_id text not null references public.admins(id), action text not null, before_state jsonb, after_state jsonb, created_at timestamptz not null default now());
alter table public.us_main_admin_audit enable row level security;
revoke all on public.us_main_admin_audit from anon,authenticated;
grant all on public.us_main_admin_audit to service_role;
create function public.save_us_main_prices(p_actor text,p_expected jsonb,p_prices jsonb) returns void language plpgsql security definer set search_path=public as $$
declare old_prices jsonb;
begin
 select value into old_prices from us_main_settings where key='prices_usd_cents' for update;
 if not found or old_prices is distinct from p_expected then raise exception 'Prices changed. Reload before saving.';end if;
 if jsonb_typeof(p_prices)<>'object' then raise exception 'Invalid prices';end if;
 if exists(select 1 from jsonb_each_text(p_prices) p where p.value !~ '^[0-9]+$' or length(p.value)>6) then raise exception 'Invalid amount';end if;
 if exists(select 1 from jsonb_each_text(p_prices) p where p.value::int<50 or p.value::int>100000) then raise exception 'Price out of range';end if;
 update us_main_settings set value=p_prices where key='prices_usd_cents';
 insert into us_main_admin_audit(actor_id,action,before_state,after_state)values(p_actor,'pricing',old_prices,p_prices);
end;$$;
revoke all on function public.save_us_main_prices(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_us_main_prices(text,jsonb,jsonb) to service_role;
create table public.us_main_experiments(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),
 status text not null default 'draft' check(status in('draft','active','paused','completed')),
 bundle_a text not null,bundle_b text not null,created_by text not null references public.admins(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(bundle_a<>bundle_b)
);
create unique index us_main_one_active_experiment on public.us_main_experiments((true)) where status='active';
create table public.us_main_experiment_assignments(
 experiment_id uuid not null references public.us_main_experiments(id),owner_hash text not null,variant text not null check(variant in('A','B')),environment text not null,created_at timestamptz not null default now(),primary key(experiment_id,owner_hash,environment)
);
alter table public.us_main_experiments enable row level security;
alter table public.us_main_experiment_assignments enable row level security;
revoke all on public.us_main_experiments,public.us_main_experiment_assignments from anon,authenticated;
grant all on public.us_main_experiments,public.us_main_experiment_assignments to service_role;
create function public.create_workspace_admin(p_actor text,p_id text,p_hash text,p_workspaces text[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from admin_workspace_members where admin_id=p_actor and is_administrator and active)then raise exception 'Administrator required';end if;
 if p_id !~ '^[A-Za-z0-9_.-]{3,50}$' or p_hash !~ '^\$2[aby]\$' then raise exception 'Invalid credentials';end if;
 if not p_workspaces <@ array['astrorekha','us-main','soulmate','us-soulmate','operations']::text[] then raise exception 'Invalid workspace';end if;
 insert into admins(id,password_hash)values(p_id,p_hash);
 insert into admin_workspace_members(admin_id,workspaces)values(p_id,p_workspaces);
 insert into admin_access_audit(actor_id,target_id,after_state)values(p_actor,p_id,jsonb_build_object('active',true,'workspaces',p_workspaces,'created',true));
end;$$;
revoke all on function public.create_workspace_admin(text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.create_workspace_admin(text,text,text,text[]) to service_role;
commit;
