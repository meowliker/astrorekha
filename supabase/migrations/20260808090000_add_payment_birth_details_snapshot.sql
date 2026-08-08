ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS birth_details_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS birth_details_complete BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_payments_birth_details_complete
  ON public.payments (birth_details_complete)
  WHERE birth_details_complete = TRUE;
