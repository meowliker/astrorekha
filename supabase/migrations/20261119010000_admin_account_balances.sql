-- Separate from immutable profit-sheet snapshots and all payment/order ledgers.
create table public.admin_balance_runs (
  id text primary key, started_at timestamptz not null default now(), completed_at timestamptz, history_note text
);
create table public.admin_balance_current (
  account_id text primary key, last_attempt jsonb not null, last_verified jsonb
);
create table public.admin_balance_snapshots (
  run_id text not null references public.admin_balance_runs(id), account_id text not null,
  captured_at timestamptz not null, payload jsonb not null, primary key (run_id, account_id)
);
create index admin_balance_snapshots_time on public.admin_balance_snapshots(captured_at desc);
create table public.admin_balance_history (
  id text primary key, account_id text not null, occurred_at timestamptz not null, payload jsonb not null, notify boolean not null default false
);
create index admin_balance_history_time on public.admin_balance_history(occurred_at desc);
alter table public.admin_balance_runs enable row level security;
alter table public.admin_balance_current enable row level security;
alter table public.admin_balance_snapshots enable row level security;
alter table public.admin_balance_history enable row level security;
revoke all on public.admin_balance_runs, public.admin_balance_current, public.admin_balance_snapshots, public.admin_balance_history from anon, authenticated;
grant all on public.admin_balance_runs, public.admin_balance_current, public.admin_balance_snapshots, public.admin_balance_history to service_role;

-- First deployment establishes the alert cutoff; historical imports never notify.
create table public.admin_balance_alert_state (
  id boolean primary key default true check (id), activated_at timestamptz not null default now()
);
insert into public.admin_balance_alert_state(id) values(true);
create table public.admin_balance_alert_deliveries (
  id text primary key, event_id text not null references public.admin_balance_history(id),
  status text not null check(status in ('sending','sent','failed','unknown')),
  error text, updated_at timestamptz not null default now()
);
alter table public.admin_balance_alert_state enable row level security;
alter table public.admin_balance_alert_deliveries enable row level security;
revoke all on public.admin_balance_alert_state, public.admin_balance_alert_deliveries from anon, authenticated;
grant all on public.admin_balance_alert_state, public.admin_balance_alert_deliveries to service_role;
create index admin_balance_history_pending on public.admin_balance_history(occurred_at) where notify;

create function public.claim_admin_balance_refresh(p_key text) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('admin_account_balances'));
  if exists(select 1 from admin_balance_runs where id = p_key and completed_at is not null)
    or exists(select 1 from admin_balance_runs where completed_at is null and started_at > now() - interval '2 minutes') then return false; end if;
  insert into admin_balance_runs(id) values (p_key) on conflict (id) do update set started_at = now();
  return true;
end $$;
create function public.save_admin_balance_refresh(p_key text, p_readings jsonb, p_history jsonb, p_history_note text) returns void
language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('admin_account_balances'));
  if exists(select 1 from admin_balance_runs where id = p_key and completed_at is not null) then return; end if;
  for r in select * from jsonb_array_elements(p_readings) loop
    insert into admin_balance_snapshots values(p_key, r->>'accountId', (r->>'at')::timestamptz, r) on conflict do nothing;
    insert into admin_balance_current values(r->>'accountId', r, case when r->>'status' = 'ok' then r else null end)
    on conflict (account_id) do update set last_attempt = excluded.last_attempt,
      last_verified = coalesce(excluded.last_verified, admin_balance_current.last_verified)
    where (excluded.last_attempt->>'at')::timestamptz >= (admin_balance_current.last_attempt->>'at')::timestamptz;
  end loop;
  for r in select * from jsonb_array_elements(p_history) loop
    insert into admin_balance_history(id, account_id, occurred_at, payload, notify)
    values(r->>'id', r->>'accountId', (r->>'at')::timestamptz, r,
      coalesce(r->>'kind' = 'limit_change' and (r->>'before')::numeric > 0 and (r->>'amount')::numeric > 0
        and (r->>'after')::numeric > (r->>'before')::numeric
        and r->>'accountId' not in ('2022187855078303','2366717340763776')
        and (r->>'at')::timestamptz >= (select activated_at from admin_balance_alert_state where id)
        and exists(select 1 from jsonb_array_elements(p_readings) a where a->>'accountId' = r->>'accountId'), false)) on conflict do nothing;
  end loop;
  update admin_balance_runs set completed_at = now(), history_note = p_history_note where id = p_key;
end $$;
revoke all on function public.claim_admin_balance_refresh(text), public.save_admin_balance_refresh(text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.claim_admin_balance_refresh(text), public.save_admin_balance_refresh(text,jsonb,jsonb,text) to service_role;
