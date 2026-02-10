/**
 * Generate Reading API Endpoint
 * Combines natal chart + palm analysis + user context to generate personalized readings
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateReading,
  generateCompleteReading,
  fetchNatalData,
  NatalData,
  PalmData,
  UserContext,
} from "@/lib/reading-generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      // Option 1: Pre-fetched natal data
      natalData,
      // Option 2: Birth data to fetch from astro-engine
      birthData,
      // Required: Palm analysis data
      palmData,
      // Required: User context
      userContext,
    } = body;

    // Validate required inputs
    if (!palmData) {
      return NextResponse.json(
        { error: "Missing palmData. Run palm analysis first." },
        { status: 400 }
      );
    }

    if (!userContext) {
      return NextResponse.json(
        { error: "Missing userContext. Provide age, gender, relationship_status, primary_concern." },
        { status: 400 }
      );
    }

    if (!natalData && !birthData) {
      return NextResponse.json(
        { error: "Missing natal data. Provide either 'natalData' or 'birthData' to fetch from astro-engine." },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return NextResponse.json(
        { error: "Reading generation service not configured" },
        { status: 500 }
      );
    }

    let reading: string;
    let finalNatalData: NatalData;

    if (natalData) {
      // Use pre-fetched natal data
      finalNatalData = natalData as NatalData;
      reading = await generateReading(
        finalNatalData,
        palmData as PalmData,
        userContext as UserContext
      );
    } else {
      // Fetch natal data from astro-engine and generate reading
      const result = await generateCompleteReading(
        birthData,
        palmData as PalmData,
        userContext as UserContext
      );
      reading = result.reading;
      finalNatalData = result.natalData;
    }

    return NextResponse.json({
      success: true,
      reading,
      metadata: {
        big_three: finalNatalData.chart.big_three,
        current_dasha: finalNatalData.dasha.current_period,
        primary_concern: userContext.primary_concern || "general life reading",
        word_count: reading.split(/\s+/).length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Reading generation error:", error);

    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes("astro-engine")) {
        return NextResponse.json(
          { error: "Failed to connect to astro-engine. Make sure it's running on port 8000." },
          { status: 503 }
        );
      }
      if (error.message.includes("No text response")) {
        return NextResponse.json(
          { error: "Failed to generate reading. Please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate reading. Please try again." },
      { status: 500 }
    );
  }
}
