-- Preserve all previous evening deliveries while allowing a separate midnight claim.
alter table public.monitoring_balance_digests
  add column delivery_slot text not null default 'evening'
  check (delivery_slot in ('midnight', 'evening'));
alter table public.monitoring_balance_digests drop constraint monitoring_balance_digests_pkey;
alter table public.monitoring_balance_digests add primary key (date, delivery_slot);
