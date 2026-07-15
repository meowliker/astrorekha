create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'anthropic',
  model text not null,
  feature text not null,
  operation text,
  user_id text,
  request_id text,
  status text not null default 'success'
    check (status in ('success', 'failed')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 8) not null default 0,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_created_at_idx
  on public.ai_usage_logs(created_at desc);

create index if not exists ai_usage_logs_feature_created_at_idx
  on public.ai_usage_logs(feature, created_at desc);

create index if not exists ai_usage_logs_user_id_created_at_idx
  on public.ai_usage_logs(user_id, created_at desc);

create index if not exists ai_usage_logs_model_created_at_idx
  on public.ai_usage_logs(model, created_at desc);

alter table public.ai_usage_logs enable row level security;

