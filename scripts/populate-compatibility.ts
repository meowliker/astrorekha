/**
 * Pre-populate Supabase with all 78 unique zodiac compatibility combinations.
 *
 * Run with:
 * DOTENV_CONFIG_PATH=.env.local TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}' node -r dotenv/config -r ts-node/register scripts/populate-compatibility.ts
 */

import { createClient } from "@supabase/supabase-js";
import {
  getInstantCompatibility,
  toCompatibilityRow,
  ZODIAC_SIGNS,
} from "../src/lib/compatibility-data";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateSupabase() {
  console.log("Starting compatibility seed...");

  const rows = [];

  for (let i = 0; i < ZODIAC_SIGNS.length; i++) {
    for (let j = i; j < ZODIAC_SIGNS.length; j++) {
      const sign1 = ZODIAC_SIGNS[i];
      const sign2 = ZODIAC_SIGNS[j];
      const [s1, s2] = [sign1, sign2].sort();
      const result = getInstantCompatibility(s1, s2);

      rows.push({
        id: `${s1.toLowerCase()}_${s2.toLowerCase()}`,
        ...toCompatibilityRow({
          ...result,
          sign1: s1,
          sign2: s2,
          createdAt: new Date().toISOString(),
        }),
      });
    }
  }

  const { error } = await supabase
    .from("compatibility")
    .upsert(rows, { onConflict: "id" });

  if (error) throw error;

  console.log(`Seeded ${rows.length} compatibility combinations.`);
}

populateSupabase().catch((error) => {
  console.error("Compatibility seed failed:", error);
  process.exit(1);
});
