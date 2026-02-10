import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { getAdminDb } from "@/lib/firebase-admin";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Get today's date key for caching
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

// System prompt for Claude to generate structured horoscope data
function getSystemPrompt(period: string): string {
  const periodLabel = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "daily";
  const wordCount = period === "weekly" ? "250-400" : period === "monthly" ? "300-500" : "150-250";
  const timeRef = period === "weekly" ? "this week" : period === "monthly" ? "this month" : "today";

  return `You are an expert astrologer writing personalized horoscopes for a general audience. Given a user's natal chart data and current planetary transits, generate a personalized ${periodLabel} horoscope.

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code fences, no extra text):

{
  "horoscope": "Structured personalized ${periodLabel} horoscope with labeled sections (${wordCount} words total).",
  "daily_tip": "One concise, actionable tip for ${timeRef} in plain English (1-2 sentences).",
  "dos": ["Plain English action 1", "Plain English action 2", "Plain English action 3"],
  "donts": ["Plain English avoid 1", "Plain English avoid 2", "Plain English avoid 3"],
  "lucky_number": 7,
  "lucky_color": "Blue",
  "mood": "Optimistic",
  "lucky_time": "10:00 AM - 12:00 PM",
  "focus_areas": ["Career", "Relationships", "Health"],
  "challenges": ["Impatience", "Overthinking"]
}

Rules for the "horoscope" field:
- Structure it with EXACTLY these section headers, each on its own line followed by a newline and the paragraph:
  **Overview**\\n\\n[General overview paragraph]\\n\\n**Love & Relationships**\\n\\n[Relationships paragraph]\\n\\n**Career & Finance**\\n\\n[Career paragraph]\\n\\n**Health & Wellness**\\n\\n[Health paragraph]
- Each section should be 2-4 sentences.
- Write in PLAIN ENGLISH. Do NOT mention planets, transits, houses, conjunctions, aspects, dashas, or any astrological jargon. The reader should NOT feel like they're reading a technical astrology report.
- NEVER start with "Dear" or any greeting.
- Use the planetary data to INFORM the content, but translate everything into everyday life advice and predictions.
- Make it feel personal and specific to their chart, but expressed in simple language.

Other rules:
- lucky_number: integer 1-99
- lucky_color: single color name (e.g. "Blue", "Emerald Green", "Gold")
- mood: one word max (e.g. "Optimistic", "Reflective", "Energized")
- lucky_time: time range in 12-hour format
- dos/donts: exactly 3 items each, under 10 words, plain English, no astrology jargon
- focus_areas: 2-3 items, one word each
- challenges: 2-3 items, one word each
- daily_tip: plain English, no astrology terms — like advice from a wise friend`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get("userId");
  const period = searchParams.get("period") || "daily"; // daily, tomorrow, weekly, monthly

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "userId is required" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: "AI service not configured" },
      { status: 500 }
    );
  }

  // Determine cache key based on period
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

  const adminDb = getAdminDb();

  try {
    // 1. Check cache first
    const cacheDocId = `personalized_${period}_${userId}_${cacheTimeKey}`;
    const cacheRef = adminDb.collection("horoscopes").doc(cacheDocId);
    const cacheSnap = await cacheRef.get();

    if (cacheSnap.exists) {
      const cached = cacheSnap.data();
      return NextResponse.json({
        success: true,
        data: cached?.horoscope_data,
        cached: true,
        period,
        date: cacheTimeKey,
      });
    }

    // 2. Get user's birth data from Firestore
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;
    const birthYear = userData.birthYear;
    const birthMonth = userData.birthMonth;
    const birthDay = userData.birthDay;
    const birthHour = userData.birthHour;
    const birthMinute = userData.birthMinute;
    const birthPlace = userData.birthPlace || userData.birthCity;

    if (!birthYear || !birthMonth || !birthDay) {
      return NextResponse.json(
        { success: false, error: "User birth data incomplete" },
        { status: 400 }
      );
    }

    // Convert 12h to 24h if needed
    let hour = parseInt(birthHour) || 12;
    const minute = parseInt(birthMinute) || 0;
    const birthPeriod = userData.birthPeriod || userData.birthAmPm;
    if (birthPeriod) {
      const p = birthPeriod.toUpperCase();
      if (p === "PM" && hour !== 12) hour += 12;
      if (p === "AM" && hour === 12) hour = 0;
    }

    // Parse month name to number if needed
    const MONTH_MAP: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const monthNum = typeof birthMonth === "string" && isNaN(Number(birthMonth))
      ? MONTH_MAP[birthMonth.toLowerCase()] || 1
      : parseInt(birthMonth);

    // 3. Call astro-engine to get natal chart + transits
    let natalData: any;
    try {
      natalData = await fetchFromAstroEngine("/calculate", {
        year: parseInt(birthYear),
        month: monthNum,
        day: parseInt(birthDay),
        hour,
        minute,
        second: 0,
        place: birthPlace || "New Delhi, India",
      });
    } catch (astroErr) {
      console.error("Astro engine error:", astroErr);
      return NextResponse.json(
        { success: false, error: "Astro engine unavailable. Please try again later." },
        { status: 503 }
      );
    }

    // 4. Build the prompt for Claude with real chart data
    const bigThree = natalData.chart?.big_three || {};
    const currentDasha = natalData.dasha?.current_period || {};
    const transits = natalData.active_transits || [];

    const periodLabel = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : period === "tomorrow" ? "tomorrow's daily" : "today's daily";
    const timeRef = period === "weekly" ? "this week" : period === "monthly" ? "this month" : period === "tomorrow" ? "tomorrow" : "today";

    const userMessage = `Generate ${periodLabel} personalized horoscope for this user.

PERIOD: ${period}
DATE: ${cacheTimeKey}

NATAL CHART (Big Three):
- Sun: ${bigThree.sun?.sign || "Unknown"} at ${bigThree.sun?.degree || "?"}°
- Moon: ${bigThree.moon?.sign || "Unknown"} at ${bigThree.moon?.degree || "?"}°
- Rising: ${bigThree.rising?.sign || "Unknown"} at ${bigThree.rising?.degree || "?"}°

PLANETS:
${JSON.stringify(natalData.chart?.planets || {}, null, 2)}

CURRENT VIMSHOTTARI DASHA:
${currentDasha.label || "Unknown"}
Mahadasha: ${currentDasha.mahadasha || "Unknown"}
Antardasha: ${currentDasha.antardasha || "Unknown"}

ACTIVE TRANSITS (planets hitting natal chart ${timeRef}):
${JSON.stringify(transits.slice(0, 12), null, 2)}

ELEMENTS BALANCE:
${JSON.stringify(natalData.chart?.elements || {}, null, 2)}

Generate the personalized ${periodLabel} horoscope JSON now. Remember: DO NOT start with "Dear" or any greeting. Start directly with cosmic insight.`;

    // 5. Call Claude to generate the horoscope
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

    // 6. Parse the JSON response
    let horoscopeData: any;
    try {
      // Strip any markdown code fences if present
      let jsonStr = textContent.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      horoscopeData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Failed to parse Claude response:", textContent.text);
      throw new Error("Failed to parse horoscope data");
    }

    // Add metadata
    horoscopeData.sun_sign = bigThree.sun?.sign || "Unknown";
    horoscopeData.moon_sign = bigThree.moon?.sign || "Unknown";
    horoscopeData.rising_sign = bigThree.rising?.sign || "Unknown";
    horoscopeData.current_dasha = currentDasha.label || "Unknown";
    horoscopeData.date = cacheTimeKey;
    horoscopeData.period = period;

    // 7. Cache in Firestore
    await cacheRef.set({
      horoscope_data: horoscopeData,
      userId,
      period,
      date: cacheTimeKey,
      generatedAt: new Date().toISOString(),
      source: "astro-engine+claude",
    });

    return NextResponse.json({
      success: true,
      data: horoscopeData,
      cached: false,
      period,
      date: cacheTimeKey,
    });
  } catch (error: any) {
    console.error("Personalized horoscope error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate horoscope" },
      { status: 500 }
    );
  }
}
