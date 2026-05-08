import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

export const dynamic = "force-dynamic";

const SETTINGS_KEY = "funnel_layout_b_config";

async function getInitialWelcomeRoute() {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const config = normalizeLayoutBConfig(data?.value || DEFAULT_LAYOUT_B_CONFIG);
    return config.enabled !== false && config.layoutBEnabled !== false ? "/welcome-b" : "/welcome";
  } catch (error) {
    console.error("Failed to resolve initial welcome route:", error);
    return DEFAULT_LAYOUT_B_CONFIG.enabled !== false && DEFAULT_LAYOUT_B_CONFIG.layoutBEnabled !== false
      ? "/welcome-b"
      : "/welcome";
  }
}

export default async function Home() {
  redirect(await getInitialWelcomeRoute());
}
