-- First-party marketing attribution and funnel event stream.
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  visitor_id TEXT,
  session_id TEXT,
  user_id TEXT,
  email TEXT,
  route TEXT,
  path TEXT,
  url TEXT,
  referrer_url TEXT,
  product_type TEXT,
  product_id TEXT,
  product_name TEXT,
  payment_id TEXT,
  payu_txn_id TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'INR',
  metadata JSONB DEFAULT '{}'::jsonb,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  utm_id TEXT,
  click_id TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  landing_path TEXT,
  landing_url TEXT,
  attribution_captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_created_at ON public.marketing_events(created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_event_name ON public.marketing_events(event_name);
CREATE INDEX IF NOT EXISTS idx_marketing_events_visitor_id ON public.marketing_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_user_id ON public.marketing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_email ON public.marketing_events(email);
CREATE INDEX IF NOT EXISTS idx_marketing_events_meta_campaign_id ON public.marketing_events(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_meta_adset_id ON public.marketing_events(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_meta_ad_id ON public.marketing_events(meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_product ON public.marketing_events(product_type, product_id);

ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_marketing_events_all" ON public.marketing_events;
CREATE POLICY "service_role_marketing_events_all" ON public.marketing_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
