-- Store tax breakdown and paywall experiment metadata for GST-exclusive checkout tests.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paywall_test_id TEXT,
  ADD COLUMN IF NOT EXISTS paywall_variant TEXT,
  ADD COLUMN IF NOT EXISTS tax_mode TEXT,
  ADD COLUMN IF NOT EXISTS base_amount INTEGER,
  ADD COLUMN IF NOT EXISTS gst_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS gst_amount INTEGER,
  ADD COLUMN IF NOT EXISTS total_amount INTEGER;

CREATE INDEX IF NOT EXISTS idx_payments_paywall_test
  ON public.payments(paywall_test_id, paywall_variant);
