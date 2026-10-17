begin;
-- US-only tax configuration; existing commercial snapshots remain immutable.
alter table public.us_soulmate_orders drop constraint us_soulmate_tax_zero;
comment on column public.us_soulmate_orders.gst_amount is 'US checkout tax in USD cents. Legacy internal column name; customer-facing label is Tax.';
commit;
