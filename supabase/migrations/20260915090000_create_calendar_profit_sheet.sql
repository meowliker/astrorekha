-- The existing profit_sheet remains the 11:30 AM IST reporting ledger.
-- Calendar-day rows are stored independently so refreshing either view cannot
-- overwrite the other view's revenue, spend, or exchange rate.
CREATE TABLE IF NOT EXISTS public.profit_sheet_calendar (
  LIKE public.profit_sheet INCLUDING ALL
);

ALTER TABLE public.profit_sheet_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_profit_sheet_calendar_all" ON public.profit_sheet_calendar;
CREATE POLICY "service_role_profit_sheet_calendar_all" ON public.profit_sheet_calendar
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.profit_sheet_calendar TO service_role;
