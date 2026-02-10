import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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

export async function POST(request: NextRequest) {
  try {
    const { zodiacSign } = await request.json();

    if (!zodiacSign) {
      return NextResponse.json(
        { success: false, error: "Zodiac sign is required" },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    let prediction;
    try {
      let jsonText = textContent.text.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      prediction = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse prediction:", textContent.text);
      return NextResponse.json(
        { success: false, error: "Failed to parse prediction" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      prediction,
      zodiacSign,
    });
  } catch (error) {
    console.error("Prediction API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate prediction" },
      { status: 500 }
    );
  }
}
