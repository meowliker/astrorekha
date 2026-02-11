import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { password, userId } = await request.json();

    if (!process.env.DEV_TESTER_PASSWORD) {
      return NextResponse.json({ error: "DEV_TESTER_PASSWORD is not configured" }, { status: 500 });
    }

    if (!password || password !== process.env.DEV_TESTER_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    await supabase.from("users").upsert({
      id: String(userId),
      is_dev_tester: true,
      subscription_plan: "yearly",
      subscription_status: "active",
      coins: 999999,
      unlocked_features: {
        palmReading: true,
        prediction2026: true,
        birthChart: true,
        compatibilityTest: true,
      },
      updated_at: now,
    }, { onConflict: "id" });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Activate tester error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to activate tester" },
      { status: 500 }
    );
  }
}
