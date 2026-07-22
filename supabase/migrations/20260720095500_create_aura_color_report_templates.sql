-- Reusable Aura Color report templates.
-- Quiz submissions store a user's answers/scores separately, then copy the
-- matching user-facing report_data from this table.

create table if not exists public.aura_color_report_templates (
  id text primary key,
  primary_color text not null,
  secondary_color text,
  report_data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aura_color_report_templates_active_idx
  on public.aura_color_report_templates(active);

alter table public.aura_color_report_templates enable row level security;

drop policy if exists "public_read_aura_color_report_templates" on public.aura_color_report_templates;
create policy "public_read_aura_color_report_templates" on public.aura_color_report_templates
  for select using (active = true);
