-- Give blended Aura Color templates archetypes that reflect both colors.

with primary_archetypes(color, archetype) as (
  values
    ('Red', 'Activator'),
    ('Orange', 'Creator'),
    ('Yellow', 'Optimist'),
    ('Green', 'Healer'),
    ('Blue', 'Communicator'),
    ('Indigo', 'Mystic'),
    ('Violet', 'Visionary'),
    ('White', 'Sage')
)
update public.aura_color_report_templates templates
set
  archetype = primary_archetypes.archetype,
  report_data = jsonb_set(
    coalesce(templates.report_data, '{}'::jsonb),
    '{auraArchetype}',
    to_jsonb(primary_archetypes.archetype),
    true
  ),
  updated_at = now()
from primary_archetypes
where templates.primary_color = primary_archetypes.color
  and templates.secondary_color is null;

with primary_archetypes(color, archetype) as (
  values
    ('Red', 'Activator'),
    ('Orange', 'Creator'),
    ('Yellow', 'Optimist'),
    ('Green', 'Healer'),
    ('Blue', 'Communicator'),
    ('Indigo', 'Mystic'),
    ('Violet', 'Visionary'),
    ('White', 'Sage')
),
secondary_adjectives(color, adjective) as (
  values
    ('Red', 'Grounded'),
    ('Orange', 'Creative'),
    ('Yellow', 'Radiant'),
    ('Green', 'Heart-Led'),
    ('Blue', 'Truthful'),
    ('Indigo', 'Intuitive'),
    ('Violet', 'Visionary'),
    ('White', 'Luminous')
)
update public.aura_color_report_templates templates
set
  archetype = secondary_adjectives.adjective || ' ' || primary_archetypes.archetype,
  report_data = jsonb_set(
    coalesce(templates.report_data, '{}'::jsonb),
    '{auraArchetype}',
    to_jsonb(secondary_adjectives.adjective || ' ' || primary_archetypes.archetype),
    true
  ),
  updated_at = now()
from primary_archetypes
join secondary_adjectives
  on true
where templates.primary_color = primary_archetypes.color
  and templates.secondary_color = secondary_adjectives.color;
