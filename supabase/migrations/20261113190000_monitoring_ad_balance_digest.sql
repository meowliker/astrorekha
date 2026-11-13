-- Once-daily claim prevents duplicate summaries from concurrent cron requests.
CREATE TABLE IF NOT EXISTS public.monitoring_balance_digests (
  date date PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'sent', 'not_delivered', 'failed')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivered integer NOT NULL DEFAULT 0
);
ALTER TABLE public.monitoring_balance_digests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitoring_balance_digests FROM anon, authenticated;
GRANT ALL ON public.monitoring_balance_digests TO service_role;
ALTER TABLE public.monitoring_notifications DROP CONSTRAINT IF EXISTS monitoring_notifications_event_check;
ALTER TABLE public.monitoring_notifications ADD CONSTRAINT monitoring_notifications_event_check CHECK (event IN ('issue', 'recovery', 'summary'));
