-- US checkout collects email only. Existing historical phone values are preserved.
alter table public.us_soulmate_orders alter column customer_phone drop not null;
comment on column public.us_soulmate_orders.customer_phone is 'Legacy optional field. New US checkout orders do not collect a phone number.';
