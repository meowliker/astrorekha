-- Paid report quiz results are saved once per user.
-- Do not apply this migration to the live database during local review.
create table if not exists public.witch_archetype_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  answers jsonb not null,
  result jsonb not null,
  scoring_version text not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists witch_archetype_results_user_id_idx on public.witch_archetype_results(user_id);
alter table public.witch_archetype_results enable row level security;
drop policy if exists "users_own_witch_archetype_results" on public.witch_archetype_results;
create policy "users_own_witch_archetype_results" on public.witch_archetype_results
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
