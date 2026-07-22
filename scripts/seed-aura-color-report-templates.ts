import { createClient } from "@supabase/supabase-js";
import {
  AURA_COLOR_ORDER,
  buildAuraReportTemplate,
  getAuraArchetype,
  getAuraTemplateKey,
  type AuraColor,
} from "../src/lib/aura-color-report";

function buildRows() {
  const rows = [];

  for (const primaryColor of AURA_COLOR_ORDER) {
    rows.push({
      id: getAuraTemplateKey(primaryColor, null),
      primary_color: primaryColor,
      secondary_color: null,
      archetype: getAuraArchetype(primaryColor, null),
      report_data: buildAuraReportTemplate(primaryColor, null),
      active: true,
      updated_at: new Date().toISOString(),
    });

    for (const secondaryColor of AURA_COLOR_ORDER) {
      if (secondaryColor === primaryColor) continue;

      rows.push({
        id: getAuraTemplateKey(primaryColor, secondaryColor as AuraColor),
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        archetype: getAuraArchetype(primaryColor, secondaryColor as AuraColor),
        report_data: buildAuraReportTemplate(primaryColor, secondaryColor as AuraColor),
        active: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return rows;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const rows = buildRows();
  const { error } = await supabase
    .from("aura_color_report_templates")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }

  console.log(`Seeded ${rows.length} Aura Color report templates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
