import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface InsightRequest {
  sign1: string;
  sign2: string;
  scores: {
    emotional: number;
    intellectual: number;
    spiritual: number;
    sexual: number;
    toxicity: number;
    overall: number;
  };
  aspects: {
    love: number;
    marriage: number;
    trust: number;
    teamwork: number;
    communication: number;
    humor: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { sign1, sign2, scores, aspects }: InsightRequest = await request.json();

    const prompt = `You are an expert astrologer providing compatibility insights for a ${sign1} and ${sign2} couple. Based on their compatibility scores, generate personalized insights.

Scores:
- Overall Match: ${scores.overall}%
- Emotional: ${scores.emotional}%
- Intellectual: ${scores.intellectual}%
- Spiritual: ${scores.spiritual}%
- Sexual: ${scores.sexual}%
- Toxicity Risk: ${scores.toxicity}%

Aspect Scores:
- Love: ${aspects.love}%
- Marriage: ${aspects.marriage}%
- Trust: ${aspects.trust}%
- Teamwork: ${aspects.teamwork}%
- Communication: ${aspects.communication}%
- Humor: ${aspects.humor}%

Generate a JSON response with the following structure (respond ONLY with valid JSON, no markdown):
{
  "matchLevel": "Excellent match" or "Good match" or "Challenging match" or "Difficult match",
  "matchSubtitle": "A brief 5-8 word subtitle about the match",
  "relationshipGlance": "A 2-3 sentence overview of how ${sign1} and ${sign2} interact in a relationship, mentioning their elements and key dynamics.",
  "wheelDescriptions": {
    "emotional": "2-3 sentences about their emotional compatibility based on the ${scores.emotional}% score. Be specific to ${sign1} and ${sign2} traits.",
    "intellectual": "2-3 sentences about their mental/intellectual connection based on the ${scores.intellectual}% score.",
    "spiritual": "2-3 sentences about their spiritual bond and shared values based on the ${scores.spiritual}% score.",
    "sexual": "2-3 sentences about their physical/intimate chemistry based on the ${scores.sexual}% score."
  },
  "toxicityDescription": "2-3 sentences about potential toxic patterns to watch for based on the ${scores.toxicity}% toxicity score.",
  "aspectDescriptions": {
    "love": "1-2 sentences about their romantic love compatibility.",
    "marriage": "1-2 sentences about long-term partnership potential.",
    "trust": "1-2 sentences about trust dynamics between them.",
    "teamwork": "1-2 sentences about how they work together.",
    "communication": "1-2 sentences about their communication style.",
    "humor": "1-2 sentences about shared humor and fun."
  },
  "challenges": [
    {
      "title": "Challenge title (3-4 words)",
      "description": "2-3 sentences describing this specific challenge for ${sign1} and ${sign2}.",
      "solution": "2-3 sentences with actionable advice to overcome this challenge."
    },
    {
      "title": "Second challenge title",
      "description": "Description of second challenge.",
      "solution": "Solution for second challenge."
    },
    {
      "title": "Third challenge title",
      "description": "Description of third challenge.",
      "solution": "Solution for third challenge."
    }
  ]
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      system: "You are an expert astrologer who provides insightful, personalized compatibility readings. Always respond with valid JSON only, no markdown formatting or code blocks.",
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    
    // Parse JSON response
    let insights;
    try {
      insights = JSON.parse(responseText);
    } catch {
      // If parsing fails, return a structured fallback
      console.error("Failed to parse AI response:", responseText);
      return NextResponse.json({
        success: false,
        error: "Failed to parse AI response",
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error("Compatibility insights error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
