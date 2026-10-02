alter table public.profit_sheet
  add column if not exists account_balance_usd numeric,
  add column if not exists account_balance_inr numeric,
  add column if not exists account_balance_exchange_rate numeric,
  add column if not exists account_balance_breakdown jsonb,
  add column if not exists account_balance_captured_at timestamptz;

comment on column public.profit_sheet.account_balance_usd is
  'Sum of all configured Meta account balances captured at 11:30 AM IST for this reporting date, converted to USD.';
comment on column public.profit_sheet.account_balance_inr is
  'Sum of all configured Meta account balances captured at 11:30 AM IST for this reporting date, converted to INR.';
comment on column public.profit_sheet.account_balance_exchange_rate is
  'USD to INR exchange rate used for the saved account balance snapshot.';
comment on column public.profit_sheet.account_balance_breakdown is
  'Per-account Meta balance snapshot. Prepaid accounts store remaining spending limit; postpaid accounts store outstanding balance.';
comment on column public.profit_sheet.account_balance_captured_at is
  'Timestamp of the immutable daily Meta account balance snapshot.';
