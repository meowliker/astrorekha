import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// We'll save to a JSON file first, then you can import to Firebase
const OUTPUT_DIR = path.resolve(process.cwd(), "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "predictions-2026.json");

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
    "february": { "title": "February 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "march": { "title": "March 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "april": { "title": "April 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "may": { "title": "May 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "june": { "title": "June 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "july": { "title": "July 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "august": { "title": "August 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "september": { "title": "September 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "october": { "title": "October 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "november": { "title": "November 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... },
    "december": { "title": "December 2026", "overview": "...", "love": "...", "career": "...", "health": "...", "luckyDays": [...], "rating": ... }
  }
}

Make each month unique and specific. Include planetary influences, retrogrades, and astrological events relevant to {zodiacSign}. Be mystical yet practical. Ratings should be between 6.0 and 9.5.`;

async function generatePredictionForSign(zodiacSign: string): Promise<any> {
  const prompt = PREDICTION_PROMPT.replace(/{zodiacSign}/g, zodiacSign);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No response from AI");
  }

  let jsonText = textContent.text.trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(jsonText);
}

async function main() {
  console.log("🔮 Starting 2026 Predictions Generation...\n");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load existing predictions if any
  let allPredictions: Record<string, any> = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    allPredictions = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    console.log(`📂 Loaded ${Object.keys(allPredictions).length} existing predictions\n`);
  }

  for (const sign of ZODIAC_SIGNS) {
    // Skip if already generated
    if (allPredictions[sign.toLowerCase()]) {
      console.log(`⏭️  ${sign} already exists, skipping...\n`);
      continue;
    }

    try {
      console.log(`⏳ Generating prediction for ${sign}...`);
      
      const prediction = await generatePredictionForSign(sign);
      
      allPredictions[sign.toLowerCase()] = {
        prediction,
        zodiacSign: sign,
        createdAt: new Date().toISOString(),
        version: "1.0",
      };

      // Save after each successful generation
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPredictions, null, 2));
      console.log(`✅ ${sign} prediction saved to ${OUTPUT_FILE}\n`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to generate for ${sign}:`, error);
    }
  }

  console.log(`\n🎉 All predictions generated! File: ${OUTPUT_FILE}`);
  console.log("\nRun the upload script to save to Firebase.");
  process.exit(0);
}

main();
