import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INPUT_FILE = path.resolve(process.cwd(), "data/predictions-2026.json");

async function main() {
  console.log("📤 Uploading predictions to Supabase...\n");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error("❌ Predictions file not found:", INPUT_FILE);
    process.exit(1);
  }

  const predictions = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const signs = Object.keys(predictions);

  console.log(`Found ${signs.length} predictions to upload\n`);

  for (const sign of signs) {
    try {
      console.log(`⏳ Uploading ${sign}...`);
      
      await supabase.from("predictions_2026_global").upsert({ id: sign, ...predictions[sign] }, { onConflict: "id" });
      
      console.log(`✅ ${sign} uploaded\n`);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Failed to upload ${sign}:`, error);
    }
  }

  console.log("\n🎉 All predictions uploaded to Supabase!");
  process.exit(0);
}

main();
