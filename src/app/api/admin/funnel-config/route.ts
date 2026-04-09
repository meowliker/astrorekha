import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

const SETTINGS_KEY = "funnel_layout_b_config";

async function loadConfig() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  return normalizeLayoutBConfig(data?.value);
}

async function saveConfig(config: any) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeLayoutBConfig(config);

  await supabase.from("settings").upsert(
    {
      key: SETTINGS_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  return normalized;
}

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("funnel-config GET error:", error);
    return NextResponse.json({ success: true, config: DEFAULT_LAYOUT_B_CONFIG });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config = await saveConfig(body?.config ?? body ?? DEFAULT_LAYOUT_B_CONFIG);
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("funnel-config PUT error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update funnel config" },
      { status: 500 }
    );
  }
}
