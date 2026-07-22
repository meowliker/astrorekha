-- Astrocartography report storage.

create table if not exists public.astrocartography_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'generating'
    check (status in ('generating', 'complete', 'failed')),
  birth_data jsonb not null default '{}'::jsonb,
  provider text not null default 'astrologyapi',
  provider_response jsonb not null default '{}'::jsonb,
  report_data jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists astrocartography_reports_user_id_idx
  on public.astrocartography_reports(user_id);

create index if not exists astrocartography_reports_status_idx
  on public.astrocartography_reports(status);

alter table public.astrocartography_reports enable row level security;

drop policy if exists "users_own_astrocartography_reports" on public.astrocartography_reports;
create policy "users_own_astrocartography_reports" on public.astrocartography_reports
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
