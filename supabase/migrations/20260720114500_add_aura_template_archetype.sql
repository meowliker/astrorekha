-- Store a short user-facing archetype label for each Aura Color template.

alter table public.aura_color_report_templates
  add column if not exists archetype text;

update public.aura_color_report_templates
set archetype = case primary_color
  when 'Red' then 'Activator'
  when 'Orange' then 'Creator'
  when 'Yellow' then 'Optimist'
  when 'Green' then 'Healer'
  when 'Blue' then 'Communicator'
  when 'Indigo' then 'Mystic'
  when 'Violet' then 'Visionary'
  when 'White' then 'Sage'
  else archetype
end
where archetype is null
  and primary_color in ('Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet', 'White');
