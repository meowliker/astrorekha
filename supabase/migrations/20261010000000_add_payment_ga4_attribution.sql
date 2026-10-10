-- AstroRekha orders are stored in public.payments. Existing UTM columns remain intact.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_term text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fb_campaign_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fb_adset_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fb_ad_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fbclid text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS first_touch jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS last_touch jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS landing_path text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ga_client_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ga_session_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ga_purchase_sent_at timestamptz;
-- A short-lived claim prevents parallel PayU callbacks from posting twice.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ga_purchase_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payments_paid_utm_created_at
  ON public.payments (utm_campaign, created_at)
  WHERE payment_status IN ('paid', 'success', 'captured');
