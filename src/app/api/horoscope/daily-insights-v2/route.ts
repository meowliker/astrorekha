import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

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

  const adminDb = getAdminDb();
  const dateKey = getDateKey();

  try {
    const insightRef = adminDb.collection("daily_insights").doc(userId);
    const insightSnap = await insightRef.get();

    if (insightSnap.exists) {
      const data = insightSnap.data();
      // Check if it's today's data
      if (data?.date === dateKey) {
        return NextResponse.json({
          success: true,
          data,
          cached: true,
          date: dateKey,
        });
      }
    }

    // Not generated yet — trigger on-demand generation for this user
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    try {
      const genRes = await fetch(`${baseUrl}/api/cron/generate-daily-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.ADMIN_SYNC_SECRET || process.env.CRON_SECRET,
          userId,
        }),
      });

      if (genRes.ok) {
        // Re-fetch the newly generated data
        const freshSnap = await insightRef.get();
        if (freshSnap.exists && freshSnap.data()?.date === dateKey) {
          return NextResponse.json({
            success: true,
            data: freshSnap.data(),
            cached: false,
            date: dateKey,
          });
        }
      }
    } catch (genErr) {
      console.error("On-demand insight generation failed:", genErr);
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
