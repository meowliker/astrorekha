create table if not exists public.birth_chart_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  birth_chart_id text,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'complete', 'failed')),
  sections jsonb default '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz default now()
);

alter table public.birth_chart_reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'birth_chart_reports'
      and policyname = 'users_own_birth_chart_reports'
  ) then
    create policy "users_own_birth_chart_reports" on public.birth_chart_reports
      for all using (user_id = auth.uid()::text)
      with check (user_id = auth.uid()::text);
  end if;
end $$;

create index if not exists birth_chart_reports_user_id_idx on public.birth_chart_reports(user_id);
