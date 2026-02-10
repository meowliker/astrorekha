/**
 * Reading Generator - Claude API Integration
 * Combines natal chart + palm analysis + user context to generate personalized readings
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fetchFromAstroEngine } from "@/lib/astro-client";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface UserContext {
  age?: number | string;
  gender?: string;
  relationship_status?: string;
  primary_concern?: string;
}

export interface NatalData {
  success: boolean;
  chart: {
    birth_data: any;
    big_three: any;
    planets: any;
    houses: any;
    ascendant: any;
    midheaven: any;
    aspects: any[];
    stelliums: any[];
    elements: any;
    modalities: any;
  };
  dasha: {
    starting_ruler: string;
    balance_at_birth: number;
    current_period: {
      mahadasha: string;
      antardasha: string;
      label: string;
    };
    mahadashas: any[];
  };
  active_transits: any[];
}

export interface PalmData {
  image_quality: any;
  hand_identification: any;
  hand_shape: any;
  fingers: any;
  heart_line: any;
  head_line: any;
  life_line: any;
  fate_line: any;
  minor_lines: any;
  mounts: any;
  special_markings: any;
  bracelet_lines: any;
  overall_assessment: any;
}

/**
 * Generates a personalized reading by combining natal chart, palm analysis, and user context
 * @param natalData - Response from astro-engine /calculate endpoint
 * @param palmData - Response from palm analysis (Claude Vision)
 * @param userContext - User's age, gender, relationship status, primary concern
 * @returns The full reading text (800-1500 words)
 */
export async function generateReading(
  natalData: NatalData,
  palmData: PalmData,
  userContext: UserContext
): Promise<string> {
  // Read the master reading prompt
  const promptPath = path.join(process.cwd(), "prompts", "master_reading_prompt.txt");
  const systemPrompt = fs.readFileSync(promptPath, "utf-8");

  // Construct the user message with all data
  const userMessage = `
USER CONTEXT:
Age: ${userContext.age || "unknown"}
Gender: ${userContext.gender || "unknown"}
Relationship Status: ${userContext.relationship_status || "not specified"}
Primary Concern: ${userContext.primary_concern || "general life reading"}

NATAL CHART DATA (Swiss Ephemeris, 0.0001° precision):
${JSON.stringify(natalData.chart, null, 2)}

VIMSHOTTARI DASHA PERIODS:
Current: ${natalData.dasha.current_period.label}
Full periods: ${JSON.stringify(natalData.dasha.mahadashas.slice(0, 8), null, 2)}

ACTIVE TRANSITS (Hitting natal chart today):
${JSON.stringify(natalData.active_transits.slice(0, 10), null, 2)}

PALM ANALYSIS (Claude Vision, 50+ data points):
${JSON.stringify(palmData, null, 2)}

GENERATE THE COMPLETE READING NOW.
Follow the structure in your system instructions exactly.
Cross-reference palm + chart at least 3 times.
Include specific timing from Dasha + transits.
Minimum 800 words.
`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text from response
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  return textContent.text;
}

/**
 * Fetches natal data from the astro-engine microservice
 * @param birthData - User's birth data
 * @returns Natal chart, dasha, and transit data
 */
export async function fetchNatalData(birthData: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  place: string;
}): Promise<NatalData> {
  return fetchFromAstroEngine('/calculate', {
    year: birthData.year,
    month: birthData.month,
    day: birthData.day,
    hour: birthData.hour,
    minute: birthData.minute,
    second: birthData.second || 0,
    place: birthData.place,
  });
}

/**
 * Complete reading generation flow - fetches natal data and generates reading
 * Use this when you have birth data but haven't called astro-engine yet
 */
export async function generateCompleteReading(
  birthData: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
    place: string;
  },
  palmData: PalmData,
  userContext: UserContext
): Promise<{ reading: string; natalData: NatalData }> {
  // Fetch natal data from astro-engine
  const natalData = await fetchNatalData(birthData);
  
  // Generate the reading
  const reading = await generateReading(natalData, palmData, userContext);
  
  return { reading, natalData };
}
