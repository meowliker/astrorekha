/**
 * Palm Analysis API Endpoint
 * Receives palm images and returns structured analysis using Claude Vision API
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePalm, analyzePalmFromDataUrl, MediaType } from "@/lib/palm-vision";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, imageBase64, mediaType = "image/jpeg" } = body;

    // Validate input - accept either data URL or raw base64
    if (!image && !imageBase64) {
      return NextResponse.json(
        { error: "Missing image data. Provide 'image' (data URL) or 'imageBase64' (raw base64)" },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return NextResponse.json(
        { error: "Palm analysis service not configured" },
        { status: 500 }
      );
    }

    let result;

    if (image) {
      // Handle data URL format (e.g., from camera capture or file input)
      result = await analyzePalmFromDataUrl(image);
    } else {
      // Handle raw base64 format
      result = await analyzePalm(imageBase64, mediaType as MediaType);
    }

    return NextResponse.json({
      success: true,
      analysis: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Palm analysis error:", error);

    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes("Invalid data URL")) {
        return NextResponse.json(
          { error: "Invalid image format. Please provide a valid image." },
          { status: 400 }
        );
      }
      if (error.message.includes("Failed to parse")) {
        return NextResponse.json(
          { error: "Failed to analyze palm image. Please try with a clearer image." },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to analyze palm image. Please try again." },
      { status: 500 }
    );
  }
}
