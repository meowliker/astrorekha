CREATE TABLE IF NOT EXISTS public.monitoring_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL UNIQUE,
  trigger text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'healthy', 'issues', 'failed')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  alert_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_monitoring_runs_started_at ON public.monitoring_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.monitoring_incidents (
  check_key text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL,
  message text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_notified_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.monitoring_meta_snapshots (
  account_id text PRIMARY KEY,
  account_name text NOT NULL,
  amount_spent numeric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.monitoring_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('email', 'slack', 'slack_chat')),
  label text NOT NULL,
  address text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.monitoring_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.monitoring_runs(id) ON DELETE SET NULL,
  check_key text NOT NULL,
  event text NOT NULL CHECK (event IN ('issue', 'recovery')),
  destination_kind text NOT NULL CHECK (destination_kind IN ('email', 'slack', 'slack_chat')),
  destination_label text NOT NULL,
  delivered boolean NOT NULL,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_monitoring_notifications_sent_at ON public.monitoring_notifications (sent_at DESC);

-- Every table is read and written through authenticated server routes with the service-role key.
ALTER TABLE public.monitoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_meta_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_notifications ENABLE ROW LEVEL SECURITY;
