-- Future partner report storage

create table if not exists public.future_partner_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'complete', 'failed')),
  report_data jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists future_partner_reports_user_id_idx
  on public.future_partner_reports(user_id);

alter table public.future_partner_reports enable row level security;

drop policy if exists "users_own_future_partner_reports" on public.future_partner_reports;
create policy "users_own_future_partner_reports" on public.future_partner_reports
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
