import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { getAdminDb } from "@/lib/firebase-admin";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

// Representative birth dates for each sign (midpoint of each sign period, year 2000)
const SIGN_BIRTH_DATA: Record<string, { month: number; day: number }> = {
  Aries: { month: 4, day: 5 },
  Taurus: { month: 5, day: 5 },
  Gemini: { month: 6, day: 5 },
  Cancer: { month: 7, day: 7 },
  Leo: { month: 8, day: 7 },
  Virgo: { month: 9, day: 7 },
  Libra: { month: 10, day: 7 },
  Scorpio: { month: 11, day: 7 },
  Sagittarius: { month: 12, day: 7 },
  Capricorn: { month: 1, day: 5 },
  Aquarius: { month: 2, day: 4 },
  Pisces: { month: 3, day: 5 },
};

function getDateKey(offset: number = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offset);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function getWeekKey(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const weekNum = Math.floor(diff / oneWeek);
  return `${now.getUTCFullYear()}-W${weekNum}`;
}

function getMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// TTL in days for each period type
const TTL_DAYS: Record<string, number> = {
  daily: 1,
  tomorrow: 2,
  weekly: 7,
  monthly: 31,
};

function getSystemPrompt(period: string): string {
  const periodLabel = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "daily";
  const wordCount = period === "weekly" ? "250-400" : period === "monthly" ? "300-500" : "150-250";
  const timeRef = period === "weekly" ? "this week" : period === "monthly" ? "this month" : "today";

  return `You are an expert astrologer writing horoscopes for a general audience. Given current planetary transits and a zodiac sign's characteristics, generate a ${periodLabel} horoscope.

You MUST respond with ONLY valid JSON (no markdown, no code fences):

{
  "horoscope": "Structured ${periodLabel} horoscope with labeled sections (${wordCount} words total).",
  "daily_tip": "One actionable tip for ${timeRef} in plain English (1-2 sentences).",
  "dos": ["Short action item 1", "Short action item 2", "Short action item 3"],
  "donts": ["Short avoid item 1", "Short avoid item 2", "Short avoid item 3"],
  "lucky_number": 7,
  "lucky_color": "Blue",
  "mood": "Optimistic",
  "lucky_time": "10:00 AM - 12:00 PM",
  "focus_areas": ["Career", "Health"],
  "challenges": ["Impatience", "Overthinking"]
}

Rules for the "horoscope" field:
- Structure it with EXACTLY these section headers, each on its own line followed by a newline and the paragraph:
  **Overview**\\n\\n[General overview paragraph]\\n\\n**Love & Relationships**\\n\\n[Relationships paragraph]\\n\\n**Career & Finance**\\n\\n[Career paragraph]\\n\\n**Health & Wellness**\\n\\n[Health paragraph]
- Each section should be 2-4 sentences.
- Write in PLAIN ENGLISH. Do NOT mention planets, transits, houses, conjunctions, aspects, dashas, or any astrological jargon. The reader should NOT feel like they're reading a technical astrology report.
- NEVER start with "Dear" or any greeting.
- Use the planetary data to INFORM the content, but translate everything into everyday life advice and predictions.

Other rules:
- lucky_number: integer 1-99
- lucky_color: single color name
- mood: one word max
- lucky_time: 12-hour time range
- dos/donts: exactly 3 items each, under 8 words each, plain English
- focus_areas: 2-3 single words
- challenges: 2-3 single words
- daily_tip: plain English, no astrology terms`;
}

async function generateForSign(
  sign: string,
  period: string,
  transitsData: any,
  natalData: any
): Promise<any> {
  const periodLabel = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : period === "tomorrow" ? "tomorrow's" : "today's";
  const timeRef = period === "weekly" ? "this week" : period === "monthly" ? "this month" : period === "tomorrow" ? "tomorrow" : "today";

  const bigThree = natalData.chart?.big_three || {};
  const transits = natalData.active_transits || [];

  const userMessage = `Generate a ${periodLabel} horoscope for ${sign}.

CURRENT PLANETARY POSITIONS:
${JSON.stringify(transitsData.planets || {}, null, 2)}

SIGN: ${sign}
Sun position: ${bigThree.sun?.sign || sign} at ${bigThree.sun?.degree || "15"}°

ACTIVE TRANSITS affecting ${sign}:
${JSON.stringify(transits.slice(0, 10), null, 2)}

ELEMENTS: ${JSON.stringify(natalData.chart?.elements || {}, null, 2)}

Generate the ${periodLabel} horoscope JSON for ${sign} now. Do NOT start with "Dear" or greetings.`;

  const maxTokens = period === "weekly" || period === "monthly" ? 1500 : 1024;
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    system: getSystemPrompt(period === "tomorrow" ? "daily" : period),
    messages: [{ role: "user", content: userMessage }],
  });

  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const data = JSON.parse(jsonStr);
  data.sign = sign;
  data.period = period;
  return data;
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const { secret, periods } = await request.json();
    if (secret !== process.env.CRON_SECRET && secret !== process.env.ADMIN_SYNC_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    const adminDb = getAdminDb();
    const periodsToGenerate = periods || ["daily", "tomorrow", "weekly", "monthly"];
    const results: Record<string, Record<string, boolean>> = {};

    // Get current transits from astro-engine
    let currentTransits: any;
    try {
      currentTransits = await fetchFromAstroEngine("/transits/now", {});
    } catch (err) {
      // Fallback: use GET request for /transits/now
      const astroUrl = process.env.ASTRO_ENGINE_URL || "http://localhost:8000";
      const res = await fetch(`${astroUrl}/transits/now`);
      if (!res.ok) throw new Error("Astro engine unavailable");
      currentTransits = await res.json();
    }

    for (const period of periodsToGenerate) {
      results[period] = {};

      // Determine cache key
      let cacheTimeKey: string;
      if (period === "tomorrow") {
        cacheTimeKey = getDateKey(1);
      } else if (period === "weekly") {
        cacheTimeKey = getWeekKey();
      } else if (period === "monthly") {
        cacheTimeKey = getMonthKey();
      } else {
        cacheTimeKey = getDateKey();
      }

      for (const sign of ZODIAC_SIGNS) {
        const cacheDocId = `sign_${period}_${sign.toLowerCase()}_${cacheTimeKey}`;
        const cacheRef = adminDb.collection("horoscopes").doc(cacheDocId);

        // Skip if already generated
        const existing = await cacheRef.get();
        if (existing.exists) {
          results[period][sign] = true;
          continue;
        }

        try {
          // Get natal data for this sign's representative birth date
          const birthInfo = SIGN_BIRTH_DATA[sign];
          let natalData: any;
          try {
            natalData = await fetchFromAstroEngine("/calculate", {
              year: 2000,
              month: birthInfo.month,
              day: birthInfo.day,
              hour: 12,
              minute: 0,
              second: 0,
              place: "New York, USA",
            });
          } catch {
            // If astro-engine fails for natal, create minimal data
            natalData = {
              chart: { big_three: { sun: { sign, degree: 15 } }, elements: {}, planets: {} },
              dasha: { current_period: {} },
              active_transits: [],
            };
          }

          // Generate horoscope
          const horoscopeData = await generateForSign(sign, period, currentTransits, natalData);

          // Calculate expiry
          const expiresAt = new Date();
          expiresAt.setUTCDate(expiresAt.getUTCDate() + (TTL_DAYS[period] || 1));

          // Store in Firestore
          await cacheRef.set({
            horoscope_data: horoscopeData,
            sign,
            period,
            date: cacheTimeKey,
            generatedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            source: "astro-engine+claude",
          });

          results[period][sign] = true;

          // Small delay to avoid rate limiting
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`Failed to generate ${period} horoscope for ${sign}:`, err.message);
          results[period][sign] = false;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Horoscopes generated",
      results,
    });
  } catch (error: any) {
    console.error("Cron generate-horoscopes error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate horoscopes" },
      { status: 500 }
    );
  }
}
