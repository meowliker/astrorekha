import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { getAdminDb } from "@/lib/firebase-admin";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

const INSIGHTS_PROMPT = `You are an expert Vedic and Western astrologer. Given a user's natal chart and current transits, generate their personalized daily insights.

You MUST respond with ONLY valid JSON (no markdown, no code fences):

{
  "lucky_number": 7,
  "lucky_color": "Blue",
  "lucky_time": "10:00 AM - 12:00 PM",
  "mood": "Optimistic",
  "daily_tip": "One concise, actionable tip for today (1-2 sentences).",
  "dos": ["Short action 1", "Short action 2", "Short action 3"],
  "donts": ["Short avoid 1", "Short avoid 2", "Short avoid 3"]
}

Rules:
- lucky_number: integer 1-99
- lucky_color: single color name (e.g. "Emerald Green", "Gold", "Royal Blue")
- lucky_time: 12-hour time range (e.g. "10:00 AM - 12:00 PM")
- mood: one word max (e.g. "Energized", "Reflective", "Passionate")
- daily_tip: Write in PLAIN SIMPLE ENGLISH. NEVER mention planets, transits, houses, dashas, conjunctions, aspects, or any astrological terms. Just give practical, actionable life advice like "Trust your gut on financial decisions today" or "Take a break from screens and spend time outdoors". The tip should feel like advice from a wise friend, NOT an astrologer.
- dos: exactly 3 items, under 8 words each. Plain English, no astrology jargon.
- donts: exactly 3 items, under 8 words each. Plain English, no astrology jargon.
- Use the planetary data to INFORM your insights, but NEVER expose planetary terms in the output. Translate everything into everyday language.`;

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * POST /api/cron/generate-daily-insights
 * Pre-generates daily insights (luck, dos/donts, tip) for all active users.
 * Stores in Firestore under daily_insights/{userId} with TTL.
 * Should be called once daily via cron.
 */
export async function POST(request: NextRequest) {
  try {
    const { secret, userId: singleUserId } = await request.json();
    if (secret !== process.env.CRON_SECRET && secret !== process.env.ADMIN_SYNC_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    const adminDb = getAdminDb();
    const dateKey = getDateKey();
    const results: Record<string, boolean> = {};

    // Get users to generate for
    let userIds: string[] = [];
    if (singleUserId) {
      userIds = [singleUserId];
    } else {
      // Get all active/trialing users
      const usersSnap = await adminDb.collection("users")
        .where("subscriptionStatus", "in", ["active", "trialing"])
        .get();
      userIds = usersSnap.docs.map((d) => d.id);
    }

    console.log(`Generating daily insights for ${userIds.length} users`);

    for (const userId of userIds) {
      // Check if already generated today
      const insightRef = adminDb.collection("daily_insights").doc(userId);
      const existing = await insightRef.get();
      if (existing.exists && existing.data()?.date === dateKey) {
        results[userId] = true;
        continue;
      }

      try {
        // Get user birth data
        const userDoc = await adminDb.collection("users").doc(userId).get();
        if (!userDoc.exists) {
          results[userId] = false;
          continue;
        }

        const userData = userDoc.data()!;
        const birthYear = userData.birthYear;
        const birthMonth = userData.birthMonth;
        const birthDay = userData.birthDay;

        if (!birthYear || !birthMonth || !birthDay) {
          results[userId] = false;
          continue;
        }

        // Parse birth time
        let hour = parseInt(userData.birthHour) || 12;
        const minute = parseInt(userData.birthMinute) || 0;
        const birthPeriod = userData.birthPeriod || userData.birthAmPm;
        if (birthPeriod) {
          const p = birthPeriod.toUpperCase();
          if (p === "PM" && hour !== 12) hour += 12;
          if (p === "AM" && hour === 12) hour = 0;
        }

        const monthNum = typeof birthMonth === "string" && isNaN(Number(birthMonth))
          ? MONTH_MAP[birthMonth.toLowerCase()] || 1
          : parseInt(birthMonth);

        // Call astro-engine
        let natalData: any;
        try {
          natalData = await fetchFromAstroEngine("/calculate", {
            year: parseInt(birthYear),
            month: monthNum,
            day: parseInt(birthDay),
            hour,
            minute,
            second: 0,
            place: userData.birthPlace || userData.birthCity || "New Delhi, India",
          });
        } catch {
          console.error(`Astro engine failed for user ${userId}`);
          results[userId] = false;
          continue;
        }

        const bigThree = natalData.chart?.big_three || {};
        const currentDasha = natalData.dasha?.current_period || {};
        const transits = natalData.active_transits || [];

        // Generate insights with Claude
        const userMessage = `Generate personalized daily insights for this user.

DATE: ${dateKey}

NATAL CHART:
- Sun: ${bigThree.sun?.sign || "Unknown"} at ${bigThree.sun?.degree || "?"}°
- Moon: ${bigThree.moon?.sign || "Unknown"} at ${bigThree.moon?.degree || "?"}°
- Rising: ${bigThree.rising?.sign || "Unknown"} at ${bigThree.rising?.degree || "?"}°

CURRENT DASHA: ${currentDasha.label || "Unknown"}

ACTIVE TRANSITS:
${JSON.stringify(transits.slice(0, 8), null, 2)}

Generate the daily insights JSON now.`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 512,
          system: INSIGHTS_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        const textContent = response.content.find((b) => b.type === "text");
        if (!textContent || textContent.type !== "text") throw new Error("No response");

        let jsonStr = textContent.text.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        const insightsData = JSON.parse(jsonStr);

        // Add metadata
        insightsData.sun_sign = bigThree.sun?.sign || "Unknown";
        insightsData.moon_sign = bigThree.moon?.sign || "Unknown";
        insightsData.rising_sign = bigThree.rising?.sign || "Unknown";
        insightsData.current_dasha = currentDasha.label || "Unknown";

        // Calculate expiry (end of today UTC)
        const expiresAt = new Date();
        expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
        expiresAt.setUTCHours(0, 0, 0, 0);

        // Store in Firestore
        await insightRef.set({
          ...insightsData,
          userId,
          date: dateKey,
          generatedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          source: "astro-engine+claude",
        });

        results[userId] = true;

        // Rate limit delay
        await new Promise((r) => setTimeout(r, 500));
      } catch (err: any) {
        console.error(`Failed insights for ${userId}:`, err.message);
        results[userId] = false;
      }
    }

    const successCount = Object.values(results).filter(Boolean).length;
    return NextResponse.json({
      success: true,
      message: `Generated insights for ${successCount}/${userIds.length} users`,
      results,
    });
  } catch (error: any) {
    console.error("Cron generate-daily-insights error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed" },
      { status: 500 }
    );
  }
}
