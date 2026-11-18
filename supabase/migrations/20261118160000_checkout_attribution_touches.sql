-- Attribution evidence only. Does not grant reports, change money or emit purchases.
create table if not exists public.checkout_attribution_touches (
  payment_id text not null references public.payments(id) on delete cascade,
  touch_key text not null,
  observed_at timestamptz not null default clock_timestamp(),
  touch jsonb not null,
  ga_client_id text,
  ga_session_id text,
  primary key (payment_id, touch_key)
);
create index if not exists checkout_attribution_payment_time_idx
  on public.checkout_attribution_touches(payment_id, observed_at desc);
alter table public.checkout_attribution_touches enable row level security;
revoke all on public.checkout_attribution_touches from public, anon, authenticated;
grant select, insert on public.checkout_attribution_touches to service_role;
