import { anthropic } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Load prompt files from prompts/ directory
function loadPrompt(filename: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", filename), "utf-8");
  } catch (error) {
    console.error(`Failed to load prompt file: ${filename}`, error);
    return "";
  }
}

// Build structured user context from palm + chart data so Claude can cite specific data points
function buildUserContext(userProfile: any, palmReading: any): string {
  // Handle cases where data might be missing
  const chart = palmReading?.natal_chart || palmReading?.chart || {};
  const dasha = palmReading?.dasha_data || palmReading?.dasha || {};
  const palm = palmReading?.palm_analysis || palmReading?.palm || palmReading || {};
  const transits = palmReading?.active_transits || [];
  const bigThree = chart?.big_three || {};

  let context = `\n=== USER'S NATAL CHART DATA ===\n`;

  // Big Three
  if (bigThree.sun) {
    context += `Sun: ${bigThree.sun.degree || ""} (${bigThree.sun.sign || userProfile?.sunSign || "unknown"}, House ${bigThree.sun.house || "unknown"})\n`;
  } else if (userProfile?.sunSign) {
    context += `Sun Sign: ${userProfile.sunSign}\n`;
  }

  if (bigThree.moon) {
    context += `Moon: ${bigThree.moon.degree || ""} (${bigThree.moon.sign || userProfile?.moonSign || "unknown"}, House ${bigThree.moon.house || "unknown"}${bigThree.moon.nakshatra ? ", Nakshatra: " + bigThree.moon.nakshatra : ""})\n`;
  } else if (userProfile?.moonSign) {
    context += `Moon Sign: ${userProfile.moonSign}\n`;
  }

  if (bigThree.rising) {
    context += `Rising: ${bigThree.rising.degree || ""} (${bigThree.rising.sign || userProfile?.risingSign || "unknown"})\n`;
  } else if (userProfile?.ascendantSign) {
    context += `Rising Sign: ${userProfile.ascendantSign}\n`;
  }

  // Planets
  if (chart.planets && typeof chart.planets === "object") {
    context += `\nPlanets:\n`;
    for (const [name, data] of Object.entries(chart.planets) as [string, any][]) {
      const tropical = data.tropical || {};
      context += `- ${name}: ${tropical.formatted || data.formatted || ""} (House ${data.house_western || data.house || "unknown"}, ${data.retrograde ? "RETROGRADE" : "direct"}, Dignity: ${data.dignity || "neutral"})\n`;
    }
  }

  // Key Aspects
  if (chart.aspects && Array.isArray(chart.aspects)) {
    context += `\nKey Aspects:\n`;
    chart.aspects.slice(0, 15).forEach((a: any) => {
      context += `- ${a.planet1} ${a.aspect} ${a.planet2} (orb: ${a.orb}°, ${a.harmony})\n`;
    });
  }

  // Houses
  if (chart.houses && typeof chart.houses === "object") {
    context += `\nHouses:\n`;
    for (const [num, data] of Object.entries(chart.houses) as [string, any][]) {
      const sign = data.sign?.formatted || data.sign || "unknown";
      context += `- House ${num}: ${sign}\n`;
    }
  }

  // Stelliums, Elements, Modalities
  if (chart.stelliums) context += `\nStelliums: ${JSON.stringify(chart.stelliums)}\n`;
  if (chart.elements?.dominant) context += `Dominant Element: ${chart.elements.dominant}\n`;
  if (chart.modalities?.dominant) context += `Dominant Modality: ${chart.modalities.dominant}\n`;

  // Dasha Periods
  if (dasha.current_period) {
    context += `\n=== DASHA PERIODS ===\n`;
    context += `Current: ${dasha.current_period.label || `${dasha.current_period.mahadasha}/${dasha.current_period.antardasha}`}\n`;

    if (dasha.mahadashas && Array.isArray(dasha.mahadashas)) {
      context += `Mahadasha periods:\n`;
      dasha.mahadashas.slice(0, 5).forEach((md: any) => {
        context += `- ${md.ruler}: ${md.start_date} to ${md.end_date} (ages ${md.age_start}-${md.age_end})\n`;
        if (md.sub_periods && Array.isArray(md.sub_periods)) {
          context += `  Sub-periods: ${md.sub_periods.map((sp: any) => `${sp.label} (${sp.start_date} to ${sp.end_date})`).join(", ")}\n`;
        }
      });
    }
  }

  // Active Transits
  if (transits && Array.isArray(transits) && transits.length > 0) {
    context += `\n=== ACTIVE TRANSITS (TODAY) ===\n`;
    transits.slice(0, 10).forEach((t: any) => {
      context += `- ${t.transit_planet} in ${t.transit_sign} ${t.aspect} natal ${t.natal_planet} in ${t.natal_sign} (House ${t.natal_house}, orb: ${t.orb}°) [${t.significance}]\n`;
    });
  }

  // Palm Analysis
  context += `\n=== PALM ANALYSIS ===\n`;

  if (palm.image_quality) context += `Image Quality: ${palm.image_quality.overall || "unknown"}\n`;
  if (palm.hand_identification) context += `Hand: ${palm.hand_identification.which_hand || "unknown"}\n`;
  if (palm.hand_shape) context += `Hand Shape: ${palm.hand_shape.type || "unknown"}\n`;

  // Heart Line
  if (palm.heart_line) {
    context += `\nHeart Line:\n`;
    context += `- Present: ${palm.heart_line.present}\n`;
    context += `- Length: ${palm.heart_line.length || "unknown"}\n`;
    context += `- Depth: ${palm.heart_line.depth || "unknown"}\n`;
    context += `- Curvature: ${palm.heart_line.curvature || "unknown"}\n`;
    context += `- Start: ${palm.heart_line.start_position || "unknown"}\n`;
    context += `- Breaks: ${palm.heart_line.breaks || "none"}\n`;
    context += `- Islands: ${palm.heart_line.islands || "none"}\n`;
    context += `- Fork at end: ${palm.heart_line.fork_at_end || false}\n`;
  }

  // Head Line
  if (palm.head_line) {
    context += `\nHead Line:\n`;
    context += `- Present: ${palm.head_line.present}\n`;
    context += `- Length: ${palm.head_line.length || "unknown"}\n`;
    context += `- Depth: ${palm.head_line.depth || "unknown"}\n`;
    context += `- Origin: ${palm.head_line.origin || "unknown"}\n`;
    context += `- Direction: ${palm.head_line.direction || "unknown"}\n`;
    context += `- Writer's fork: ${palm.head_line.writers_fork || false}\n`;
    context += `- Breaks: ${palm.head_line.breaks || "none"}\n`;
  }

  // Life Line
  if (palm.life_line) {
    context += `\nLife Line:\n`;
    context += `- Present: ${palm.life_line.present}\n`;
    context += `- Length: ${palm.life_line.length || "unknown"}\n`;
    context += `- Depth: ${palm.life_line.depth || "unknown"}\n`;
    context += `- Arc: ${palm.life_line.arc || "unknown"}\n`;
    context += `- Breaks: ${JSON.stringify(palm.life_line.breaks || {})}\n`;
    context += `- Sister line: ${palm.life_line.sister_line_present || false}\n`;
    context += `- Islands: ${palm.life_line.islands || "none"}\n`;
  }

  // Fate Line
  if (palm.fate_line) {
    context += `\nFate Line:\n`;
    context += `- Present: ${palm.fate_line.present || false}\n`;
    context += `- Start point: ${palm.fate_line.start_point || "none"}\n`;
    context += `- End point: ${palm.fate_line.end_point || "none"}\n`;
    context += `- Continuity: ${palm.fate_line.continuity || "none"}\n`;
    context += `- Depth: ${palm.fate_line.depth || "none"}\n`;
  }

  // Minor Lines
  if (palm.minor_lines) {
    context += `\nMinor Lines:\n`;
    context += `- Sun line: ${palm.minor_lines.sun_line?.present || false} (${palm.minor_lines.sun_line?.quality || "none"})\n`;
    context += `- Mercury line: ${palm.minor_lines.mercury_line?.present || false}\n`;
    context += `- Marriage lines count: ${palm.minor_lines.marriage_lines?.count || 0}\n`;
    context += `- Travel lines count: ${palm.minor_lines.travel_lines?.count || 0}\n`;
  }

  // Mounts
  if (palm.mounts && typeof palm.mounts === "object") {
    context += `\nMounts:\n`;
    for (const [name, data] of Object.entries(palm.mounts) as [string, any][]) {
      if (name !== "confidence") {
        context += `- ${name}: ${data.prominence || data || "unknown"}\n`;
      }
    }
  }

  // Special Markings
  if (palm.special_markings) {
    context += `\nSpecial Markings:\n`;
    context += `- Mystic cross: ${palm.special_markings.mystic_cross || false}\n`;
    if (palm.special_markings.stars?.length) context += `- Stars: ${JSON.stringify(palm.special_markings.stars)}\n`;
    if (palm.special_markings.triangles?.length) context += `- Triangles: ${JSON.stringify(palm.special_markings.triangles)}\n`;
  }

  // Bracelet lines and overall
  if (palm.bracelet_lines) context += `\nBracelet lines: ${palm.bracelet_lines.count || 0}\n`;
  if (palm.overall_assessment) {
    context += `Overall confidence: ${palm.overall_assessment.overall_confidence || 0}\n`;
    if (palm.overall_assessment.most_notable_features) {
      context += `Notable features: ${JSON.stringify(palm.overall_assessment.most_notable_features)}\n`;
    }
  }

  // User profile basics
  context += `\n=== USER PROFILE ===\n`;
  if (userProfile?.birthDate) context += `Birth Date: ${userProfile.birthDate}\n`;
  if (userProfile?.birthTime) context += `Birth Time: ${userProfile.birthTime}\n`;
  if (userProfile?.birthPlace) context += `Birth Place: ${userProfile.birthPlace}\n`;
  if (userProfile?.gender) context += `Gender: ${userProfile.gender}\n`;
  if (userProfile?.relationshipStatus) context += `Relationship Status: ${userProfile.relationshipStatus}\n`;
  if (userProfile?.goals?.length) context += `Life Goals: ${userProfile.goals.join(", ")}\n`;

  return context;
}

interface UserProfile {
  gender?: string;
  birthDate?: string;
  birthTime?: string | null;
  birthPlace?: string;
  relationshipStatus?: string;
  goals?: string[];
  sunSign?: string;
  moonSign?: string;
  ascendantSign?: string;
  hasPalmImage?: boolean;
  palmReading?: any;
}

export async function POST(request: NextRequest) {
  try {
    const { message, userProfile, palmImageBase64, palmReading, natalChart, context } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Load prompt files
    const elysiaSystemPrompt = loadPrompt("elysia_chatbot_system.txt");
    const interpretationRules = loadPrompt("elysia_interpretation_rules.txt");

    // Merge natalChart data into palmReading so buildUserContext can find chart/dasha/transits
    const mergedData = {
      ...palmReading,
      ...(natalChart || {}),
    };

    // Build structured user context from palm + chart data
    const structuredContext = buildUserContext(userProfile, mergedData);

    // Build full system prompt with loaded prompts + user data
    const fullSystemPrompt = `${elysiaSystemPrompt}\n\n${interpretationRules}\n\n=== THIS USER'S PERSONAL DATA ===\n${structuredContext}`;

    // Build messages array with chat history (last 20 messages for context)
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (context?.previousMessages && Array.isArray(context.previousMessages)) {
      context.previousMessages.slice(-20).forEach((m: any) => {
        if (m.role && m.content) {
          messages.push({
            role: m.role as "user" | "assistant",
            content: m.content,
          });
        }
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: message,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: fullSystemPrompt,
      messages,
    });

    const textContent = response.content.find((block) => block.type === "text");
    const reply = textContent && "text" in textContent ? textContent.text : "";

    return NextResponse.json({
      reply,
      usage: response.usage,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
