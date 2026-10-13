-- Persist Meta Conversions API delivery so concurrent PayU callbacks and retries
-- use one Purchase event per confirmed transaction.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_client_user_agent text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_purchase_queued_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_purchase_claimed_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_purchase_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_meta_purchase_pending
  ON public.payments (meta_purchase_queued_at)
  WHERE payment_status IN ('paid', 'success', 'captured')
    AND meta_purchase_queued_at IS NOT NULL
    AND meta_purchase_sent_at IS NULL;
