alter table public.profit_sheet
  add column if not exists indian_ad_spend_inr numeric,
  add column if not exists indian_ad_accounts jsonb;

comment on column public.profit_sheet.indian_ad_spend_inr is
  'Saved spend in INR-currency Meta accounts for this reporting day, used for the 18% ad GST deduction.';
comment on column public.profit_sheet.indian_ad_accounts is
  'Saved per-account INR spend used to explain the daily GST deduction.';
