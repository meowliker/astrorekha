/**
 * Palm Vision - Claude Vision API Integration
 * Analyzes palm images using Claude claude-sonnet-4-5-20250929 model
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface PalmAnalysisResult {
  image_quality: {
    overall: string;
    lighting: string;
    focus: string;
    palm_visible_percentage: number;
  };
  hand_identification: {
    which_hand: string;
    confidence: number;
  };
  hand_shape: {
    type: string;
    palm_shape: string;
    finger_length_relative: string;
    skin_texture: string;
    confidence: number;
  };
  fingers: {
    index_vs_ring_length: string;
    finger_gaps: string;
    thumb_angle: string;
    thumb_flexibility: string;
    confidence: number;
  };
  heart_line: {
    present: boolean;
    start_position: string;
    length: string;
    depth: string;
    clarity: string;
    curvature: string;
    fork_at_end: boolean;
    islands: string;
    breaks: string;
    chains: string;
    confidence: number;
  };
  head_line: {
    present: boolean;
    origin: string;
    direction: string;
    length: string;
    depth: string;
    clarity: string;
    writers_fork: boolean;
    islands: string;
    breaks: string;
    confidence: number;
  };
  life_line: {
    present: boolean;
    start_position: string;
    arc: string;
    length: string;
    depth: string;
    clarity: string;
    breaks: { count: number; overlap: boolean };
    sister_line_present: boolean;
    islands: string;
    confidence: number;
  };
  fate_line: {
    present: boolean;
    start_point: string;
    end_point: string;
    continuity: string;
    depth: string;
    confidence: number;
  };
  minor_lines: {
    sun_line: { present: boolean; quality: string; confidence: number };
    mercury_line: { present: boolean; quality: string; confidence: number };
    marriage_lines: { count: number; confidence: number };
    girdle_of_venus: { present: boolean; confidence: number };
    intuition_line: { present: boolean; confidence: number };
    travel_lines: { count: number; confidence: number };
  };
  mounts: {
    jupiter: { prominence: string };
    saturn: { prominence: string };
    apollo: { prominence: string };
    mercury: { prominence: string };
    venus: { prominence: string };
    luna: { prominence: string };
    upper_mars: { prominence: string };
    lower_mars: { prominence: string };
    confidence: number;
  };
  special_markings: {
    mystic_cross: boolean;
    stars: string[];
    crosses: string[];
    triangles: string[];
    squares: string[];
    grilles: string[];
    confidence: number;
  };
  bracelet_lines: { count: number; confidence: number };
  overall_assessment: {
    most_notable_features: string[];
    dominant_element: string;
    overall_confidence: number;
    notes: string;
  };
}

/**
 * Analyzes a palm image using Claude Vision API
 * @param imageBase64 - Base64 encoded image data (without data URL prefix)
 * @param mediaType - MIME type of the image
 * @returns Structured palm analysis data
 */
export async function analyzePalm(
  imageBase64: string,
  mediaType: MediaType = "image/jpeg"
): Promise<PalmAnalysisResult> {
  // Read the prompt from the prompts folder
  const promptPath = path.join(process.cwd(), "prompts", "palm_extraction_prompt.txt");
  const prompt = fs.readFileSync(promptPath, "utf-8");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
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

  // Extract text from response
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude Vision API");
  }

  const text = textContent.text;

  // Parse JSON from response (handle markdown code blocks)
  const jsonStr = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(jsonStr) as PalmAnalysisResult;
  } catch (error) {
    console.error("Failed to parse palm analysis JSON:", text);
    throw new Error("Failed to parse palm analysis response as JSON");
  }
}

/**
 * Extracts base64 data from a data URL
 * @param dataUrl - Data URL (e.g., "data:image/jpeg;base64,...")
 * @returns Object with base64 data and media type
 */
export function parseDataUrl(dataUrl: string): { base64: string; mediaType: MediaType } {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  return {
    mediaType: matches[1] as MediaType,
    base64: matches[2],
  };
}

/**
 * Analyzes a palm image from a data URL
 * @param dataUrl - Data URL containing the image
 * @returns Structured palm analysis data
 */
export async function analyzePalmFromDataUrl(dataUrl: string): Promise<PalmAnalysisResult> {
  const { base64, mediaType } = parseDataUrl(dataUrl);
  return analyzePalm(base64, mediaType);
}
