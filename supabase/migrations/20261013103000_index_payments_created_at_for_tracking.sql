-- Tracking reads refunds within an 11:30 AM IST business-day window.
-- The primary-key index on id cannot efficiently serve that created_at range.
-- This also speeds the paid-order fallback for older rows without fulfilled_at.
CREATE INDEX IF NOT EXISTS idx_payments_created_at_id
  ON public.payments (created_at, id);
