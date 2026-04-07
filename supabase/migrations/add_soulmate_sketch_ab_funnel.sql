-- Soulmate sketch + Layout B funnel configuration

create table if not exists public.settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.soulmate_sketches (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'complete', 'failed')),
  question_answers jsonb not null default '{}'::jsonb,
  provider text,
  provider_job_id text,
  prompt text,
  sketch_image_url text,
  generation_count integer not null default 0
    check (generation_count >= 0 and generation_count <= 1),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists soulmate_sketches_user_id_idx on public.soulmate_sketches(user_id);

alter table public.soulmate_sketches enable row level security;

drop policy if exists "users_own_soulmate_sketches" on public.soulmate_sketches;
create policy "users_own_soulmate_sketches" on public.soulmate_sketches
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

insert into public.settings (key, value, updated_at)
values (
  'funnel_layout_b_config',
  '{
    "testId": "onboarding-layout-qa",
    "enabled": true,
    "variantAWeight": 50,
    "variantBWeight": 50,
    "maxSketchPerUser": 1,
    "layoutBEnabled": true,
    "questionOrder": [
      "attracted_to",
      "age_group",
      "connection_type",
      "love_signal",
      "main_worry",
      "future_goal"
    ],
    "questions": {
      "attracted_to": true,
      "appearance": false,
      "age_group": true,
      "connection_type": true,
      "energy_type": false,
      "love_signal": true,
      "relationship_feel": false,
      "main_worry": true,
      "future_goal": true
    }
  }'::jsonb,
  now()
)
on conflict (key) do nothing;
