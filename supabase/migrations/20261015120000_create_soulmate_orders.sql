-- Standalone /soulmate checkout. Never insert these orders in public.payments.
create table if not exists public.soulmate_orders (
  id text primary key check (id ~ '^sm_[a-f0-9]{20}$'),
  funnel text not null default 'soulmate_standalone' check (funnel = 'soulmate_standalone'),
  checkout_key uuid not null unique,
  checkout_fingerprint text not null,
  plan text not null check (plan in ('standard', 'express')),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  answers jsonb not null,
  base_amount integer not null check (base_amount > 0),
  gst_amount integer not null check (gst_amount >= 0),
  amount integer not null check (amount = base_amount + gst_amount),
  currency text not null default 'INR' check (currency = 'INR'),
  delivery_hours integer not null check (delivery_hours in (12, 48)),
  product_info text not null,
  payment_status text not null default 'created' check (payment_status in ('created', 'pending', 'paid', 'failed')),
  payu_payment_id text unique,
  payment_mode text not null check (payment_mode in ('live', 'test')),
  paid_at timestamptz,
  delivery_due_at timestamptz,
  fulfillment_status text not null default 'awaiting_payment' check (fulfillment_status in ('awaiting_payment', 'queued', 'delivered')),
  delivered_at timestamptz,
  attribution jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists soulmate_orders_revenue_idx on public.soulmate_orders (payment_mode, payment_status, created_at);
create index if not exists soulmate_orders_delivery_idx on public.soulmate_orders (fulfillment_status, delivery_due_at);
alter table public.soulmate_orders enable row level security;
revoke all on public.soulmate_orders from anon, authenticated;
grant all on public.soulmate_orders to service_role;
comment on table public.soulmate_orders is 'Private standalone soulmate ledger; excluded from the main Profit Sheet, users, marketing events, and payments. Amounts in paise. Paid orders queue for sketch delivery.';
