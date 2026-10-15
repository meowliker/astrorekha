-- Independent delivery state for confirmed standalone purchases.
alter table public.soulmate_orders
  add column if not exists meta_purchase_sent_at timestamptz,
  add column if not exists meta_purchase_claimed_at timestamptz,
  add column if not exists ga_purchase_sent_at timestamptz,
  add column if not exists ga_purchase_claimed_at timestamptz;
create index if not exists soulmate_purchase_tracking_pending_idx
  on public.soulmate_orders (paid_at)
  where payment_status = 'paid' and payment_mode = 'live'
    and (meta_purchase_sent_at is null or ga_purchase_sent_at is null);
create index if not exists marketing_events_soulmate_sessions_idx
  on public.marketing_events (created_at, session_id)
  where product_type = 'soulmate_standalone';
