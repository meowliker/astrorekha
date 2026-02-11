import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/**
 * GET /api/horoscope/daily-insights-v2?userId=xxx
 * Returns pre-generated daily insights (luck, dos/donts, tip) for a user.
 * If not yet generated, triggers on-demand generation.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "userId is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const dateKey = getDateKey();

  try {
    const { data: insight } = await supabase.from("daily_insights").select("*").eq("id", userId).single();

    if (insight && insight.date === dateKey) {
      // Return the insights JSONB data (contains lucky_number, dos, donts, daily_tip, etc.)
      const insightsData = insight.insights || insight;
      return NextResponse.json({
        success: true,
        data: insightsData,
        cached: true,
        date: dateKey,
      });
    }

    // Not generated yet — trigger on-demand generation for this user
    // Use request origin (actual server URL) to avoid localhost issues on Vercel
    const baseUrl = request.nextUrl.origin;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout
      const genRes = await fetch(`${baseUrl}/api/cron/generate-daily-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.ADMIN_SYNC_SECRET || process.env.CRON_SECRET,
          userId,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (genRes.ok) {
        // Re-fetch the newly generated data
        const { data: fresh } = await supabase.from("daily_insights").select("*").eq("id", userId).single();
        if (fresh && fresh.date === dateKey) {
          const freshData = fresh.insights || fresh;
          return NextResponse.json({
            success: true,
            data: freshData,
            cached: false,
            date: dateKey,
          });
        }
      }
    } catch (genErr: any) {
      console.error("On-demand insight generation failed:", genErr?.message || genErr);
    }

    return NextResponse.json(
      { success: false, error: "Daily insights not yet available. Please try again later." },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("Daily insights fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch daily insights" },
      { status: 500 }
    );
  }
}
