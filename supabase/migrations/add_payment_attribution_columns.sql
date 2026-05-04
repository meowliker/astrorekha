-- Add first-party attribution fields to payments for live campaign attribution
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS utm_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS click_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_adset_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS meta_ad_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS landing_path TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS landing_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS referrer_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS attribution_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_meta_campaign_id ON public.payments(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_fulfilled_at ON public.payments(fulfilled_at);
