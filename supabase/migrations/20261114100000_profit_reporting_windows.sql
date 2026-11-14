-- Keep both reporting ledgers schema-compatible. Never copy totals between windows.
alter table public.profit_sheet_calendar
  add column if not exists indian_ad_spend_inr numeric,
  add column if not exists indian_ad_accounts jsonb,
  add column if not exists account_balance_usd numeric,
  add column if not exists account_balance_inr numeric,
  add column if not exists account_balance_exchange_rate numeric,
  add column if not exists account_balance_breakdown jsonb,
  add column if not exists account_balance_captured_at timestamptz;

create table if not exists public.admin_profit_report_cache (
  cache_key text primary key,
  payload jsonb,
  fetched_at timestamptz,
  refresh_token uuid,
  refresh_until timestamptz,
  refresh_error text
);
alter table public.admin_profit_report_cache enable row level security;
revoke all on public.admin_profit_report_cache from anon, authenticated;
grant all on public.admin_profit_report_cache to service_role;

create or replace function public.claim_profit_report_refresh(p_key text, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into admin_profit_report_cache(cache_key,refresh_token,refresh_until)
  values(p_key,p_token,now()+interval '5 minutes')
  on conflict(cache_key) do update set refresh_token=excluded.refresh_token,refresh_until=excluded.refresh_until
  where admin_profit_report_cache.refresh_until is null or admin_profit_report_cache.refresh_until < now();
  return found;
end;
$$;
revoke all on function public.claim_profit_report_refresh(text,uuid) from public, anon, authenticated;
grant execute on function public.claim_profit_report_refresh(text,uuid) to service_role;
