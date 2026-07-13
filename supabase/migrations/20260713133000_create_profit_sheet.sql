CREATE TABLE IF NOT EXISTS public.profit_sheet (
  date TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  revenue NUMERIC NOT NULL DEFAULT 0,
  gross_revenue NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  gst NUMERIC NOT NULL DEFAULT 0,
  ads_cost_usd NUMERIC NOT NULL DEFAULT 0,
  ads_cost_inr NUMERIC NOT NULL DEFAULT 0,
  net_revenue NUMERIC NOT NULL DEFAULT 0,
  profit_percent NUMERIC NOT NULL DEFAULT 0,
  roas NUMERIC NOT NULL DEFAULT 0,
  bundle_revenue NUMERIC NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  bundle_purchases INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  refund_count INTEGER NOT NULL DEFAULT 0,
  exchange_rate NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'payu_live',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profit_sheet_date ON public.profit_sheet(date);
CREATE INDEX IF NOT EXISTS idx_profit_sheet_synced_at ON public.profit_sheet(synced_at);

ALTER TABLE public.profit_sheet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_profit_sheet_all" ON public.profit_sheet;
CREATE POLICY "service_role_profit_sheet_all" ON public.profit_sheet
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
