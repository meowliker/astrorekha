import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WITCH_PROFILES, type WitchKey } from "../src/lib/witch-archetype";
import { localWitchTemplate } from "../src/lib/witch-archetype-preview";
import { isWitchTemplate, WITCH_TEMPLATE_VERSION } from "../src/lib/witch-archetype-template";

const destination = resolve(__dirname, "../supabase/migrations/20261007150000_create_witch_archetype_templates.sql");
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;
const keys = Object.keys(WITCH_PROFILES) as WitchKey[];
const rows = keys.map((key) => {
  const template = localWitchTemplate(key);
  if (!isWitchTemplate(template, key)) throw new Error(`Invalid template for ${key}`);
  return `  (${sqlString(key)}, ${sqlString(WITCH_TEMPLATE_VERSION)}, ${sqlString(JSON.stringify(template))}::jsonb, true)`;
});

const migration = `-- Six reviewed, reusable witch archetype report templates.
-- Run this migration only in the intended environment; local preview reads the same source constants.
create table if not exists public.witch_archetype_templates (
  id text primary key,
  template_version text not null,
  report_data jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.witch_archetype_templates enable row level security;
-- No client policy: the paid report API reads through the service role after checking access.

insert into public.witch_archetype_templates (id, template_version, report_data, active)
values
${rows.join(",\n")}
on conflict (id) do update set
  template_version = excluded.template_version,
  report_data = excluded.report_data,
  active = excluded.active,
  updated_at = now();
`;

writeFileSync(destination, migration);
console.log(`Wrote ${keys.length} archetype templates to ${destination}`);
