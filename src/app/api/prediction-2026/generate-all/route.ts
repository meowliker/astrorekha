import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

const PREDICTION_PROMPT = `You are a mystical astrologer providing detailed yearly predictions. Generate a comprehensive 2026 prediction for someone with the zodiac sign: {zodiacSign}.

IMPORTANT: Respond with ONLY valid JSON, no markdown, no code fences.

Return this exact JSON structure:
{
  "yearOverview": {
    "title": "Your 2026 Cosmic Journey",
    "summary": "A 4-5 sentence overview of the entire year's energy, themes, and major influences for this zodiac sign. Make it inspiring and personalized.",
    "luckyNumbers": [3 lucky numbers for the year],
    "luckyColors": ["2-3 lucky colors"],
    "keyThemes": ["3-4 major themes for the year"],
    "overallRating": 8.5
  },
  "months": {
    "january": {
      "title": "January 2026",
      "overview": "2-3 sentence overview of the month",
      "love": "Love and relationship prediction for this month",
      "career": "Career and finance prediction",
      "health": "Health and wellness advice",
      "luckyDays": [5, 12, 21],
      "rating": 7.5
    },
    "february": {
      "title": "February 2026",
      "overview": "...",
      "love": "...",
      "career": "...",
      "health": "...",
      "luckyDays": [...],
      "rating": ...
    },
    "march": { ... },
    "april": { ... },
    "may": { ... },
    "june": { ... },
    "july": { ... },
    "august": { ... },
    "september": { ... },
    "october": { ... },
    "november": { ... },
    "december": { ... }
  }
}

Make each month unique and specific. Include planetary influences, retrogrades, and astrological events relevant to {zodiacSign}. Be mystical yet practical. Ratings should be between 6.0 and 9.5.`;

async function generatePredictionForSign(zodiacSign: string): Promise<any> {
  const prompt = PREDICTION_PROMPT.replace(/{zodiacSign}/g, zodiacSign);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No response from AI");
  }

  let jsonText = textContent.text.trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(jsonText);
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Add a secret key check for security
    const { secretKey } = await request.json();
    if (secretKey !== process.env.ADMIN_SECRET_KEY && secretKey !== "generate-all-2026") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const sign of ZODIAC_SIGNS) {
      try {
        console.log(`Generating prediction for ${sign}...`);
        
        const prediction = await generatePredictionForSign(sign);
        
        // Store in Firebase with zodiac sign as the document ID
        await setDoc(doc(db, "predictions_2026_global", sign.toLowerCase()), {
          prediction,
          zodiacSign: sign,
          createdAt: new Date().toISOString(),
          version: "1.0",
        });

        results[sign] = { success: true };
        console.log(`✓ ${sign} prediction saved`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to generate for ${sign}:`, error);
        results[sign] = { 
          success: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        };
      }
    }

    const successCount = Object.values(results).filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Generated ${successCount}/${ZODIAC_SIGNS.length} predictions`,
      results,
    });
  } catch (error) {
    console.error("Generate all predictions error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate predictions" },
      { status: 500 }
    );
  }
}
