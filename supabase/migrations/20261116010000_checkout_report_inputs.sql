-- Private report inputs saved before the payment redirect. No existing payments/grants are changed.
create table public.checkout_report_inputs (
  market text not null check (market in ('IN','US')),
  order_id text not null,
  palm_image text not null check (octet_length(palm_image) <= 1500000 and palm_image ~ '^data:image/(jpeg|png|webp);base64,'),
  created_at timestamptz not null default now(),
  primary key (market, order_id)
);
alter table public.checkout_report_inputs enable row level security;
revoke all on public.checkout_report_inputs from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_report_inputs to service_role;
-- Reads go through signed server routes which join only the account's fulfilled purchases.
