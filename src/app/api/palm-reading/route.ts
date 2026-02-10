import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const PALM_READING_PROMPT = `You are an expert palm reader and mystic with decades of experience analyzing palms. Analyze this palm image and provide a comprehensive reading.

User's birth date: {birthDate}
User's zodiac sign: {zodiacSign}

IMPORTANT: You must respond with ONLY valid JSON, no markdown, no code fences, just pure JSON.

Analyze the palm and return this exact JSON structure:
{
  "cosmicInsight": "A 3-4 sentence personalized cosmic insight connecting their palm lines to their zodiac sign and life path. Make it mystical and meaningful.",
  "tabs": {
    "ageTimeline": {
      "title": "Life Timeline Predictions",
      "stages": [
        {"range": "0-20", "label": "Foundation Years", "description": "Description of this life phase based on palm lines"},
        {"range": "21-35", "label": "Growth Period", "description": "Description of this life phase"},
        {"range": "36-50", "label": "Peak Years", "description": "Description of this life phase"},
        {"range": "51-70", "label": "Wisdom Era", "description": "Description of this life phase"},
        {"range": "71+", "label": "Golden Years", "description": "Description of this life phase"}
      ],
      "milestones": {
        "wealthPeaks": "Ages when financial success is indicated",
        "healthEvents": "Health considerations at certain ages",
        "lifeLineAges": "Key ages marked on the life line",
        "careerMilestones": "Career peak ages",
        "relationshipTiming": "Relationship milestones timing"
      }
    },
    "wealth": {
      "title": "Wealth & Financial Analysis",
      "financialPotential": {"level": "High/Medium/Low", "details": "Detailed analysis"},
      "businessAptitude": "Business and entrepreneurship potential",
      "wealthTimeline": "When wealth is likely to accumulate",
      "assetAccumulation": "Types of assets indicated",
      "moneyManagementStyle": "How they handle money"
    },
    "mounts": {
      "title": "Palm Mounts Analysis",
      "mounts": [
        {"name": "Mount of Jupiter", "description": "Analysis of this mount"},
        {"name": "Mount of Saturn", "description": "Analysis"},
        {"name": "Mount of Apollo", "description": "Analysis"},
        {"name": "Mount of Mercury", "description": "Analysis"},
        {"name": "Mount of Venus", "description": "Analysis"},
        {"name": "Mount of Moon", "description": "Analysis"}
      ],
      "specialMarkings": {
        "travelLines": "Travel line analysis",
        "marriageLines": "Marriage line analysis",
        "healthIndicators": "Health markings",
        "headFateIntersection": "Where head and fate lines meet",
        "lifeHeartIntersection": "Where life and heart lines interact"
      }
    },
    "love": {
      "title": "Love & Partnership Predictions",
      "partnerCharacteristics": "Ideal partner traits indicated",
      "marriageTiming": "When marriage is indicated",
      "partnersFinancialStatus": "Partner's financial prospects",
      "relationshipChallenges": "Potential challenges to overcome",
      "familyPredictions": "Family and children indications"
    }
  },
  "meta": {
    "confidence": 0.85,
    "palmQuality": "good/fair/excellent",
    "dominantHand": "right/left/unknown"
  }
}

If the image is NOT a palm or hand, respond with:
{
  "cosmicInsight": null,
  "tabs": null,
  "meta": {
    "errorMessage": "NOT_A_PALM: Please upload a clear photo of your palm. The image provided does not appear to be a human hand."
  }
}

Be specific, personalized, and mystical in your readings. Connect insights to the user's zodiac sign when relevant.`;

export async function POST(request: NextRequest) {
  try {
    const { imageData, birthDate, zodiacSign } = await request.json();

    if (!imageData) {
      return NextResponse.json(
        { success: false, error: "No image provided" },
        { status: 400 }
      );
    }

    // Prepare the prompt with user data
    const prompt = PALM_READING_PROMPT
      .replace("{birthDate}", birthDate || "Not provided")
      .replace("{zodiacSign}", zodiacSign || "Unknown");

    // Extract base64 data from data URL
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse JSON response
    let reading;
    try {
      // Clean up response - remove any markdown code fences
      let jsonText = textContent.text.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      reading = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", textContent.text);
      return NextResponse.json(
        { success: false, error: "Failed to parse reading", raw: textContent.text },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reading,
    });
  } catch (error) {
    console.error("Palm reading API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze palm" },
      { status: 500 }
    );
  }
}
