-- Store only the selected Aura template/color ids on user reports.
-- Detailed report copy lives in aura_color_report_templates.

alter table public.aura_color_reports
  add column if not exists template_id text,
  add column if not exists dominant_color_id text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text;

create index if not exists aura_color_reports_template_id_idx
  on public.aura_color_reports(template_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'aura_color_reports_template_id_fkey'
  ) then
    alter table public.aura_color_reports
      add constraint aura_color_reports_template_id_fkey
      foreign key (template_id)
      references public.aura_color_report_templates(id);
  end if;
end $$;

update public.aura_color_reports
set
  primary_color = coalesce(primary_color, result_data->>'primaryColor'),
  secondary_color = coalesce(secondary_color, nullif(result_data->>'secondaryColor', 'null')),
  template_id = coalesce(
    template_id,
    case
      when result_data->>'primaryColor' is null then null
      when nullif(result_data->>'secondaryColor', 'null') is null then result_data->>'primaryColor'
      else (result_data->>'primaryColor') || '-' || nullif(result_data->>'secondaryColor', 'null')
    end
  ),
  dominant_color_id = coalesce(dominant_color_id, lower(result_data->>'primaryColor'))
where result_data ? 'primaryColor';

update public.aura_color_reports
set result_data = '{}'::jsonb
where template_id is not null;
