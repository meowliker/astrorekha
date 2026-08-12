import { anthropic } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { logClaudeUsage } from "@/lib/ai-usage-logger";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  CHAT_UNLIMITED_PASS_ID,
  CHAT_UNLIMITED_PASS_TYPE,
  getChatUnlimitedPassEndsAt,
  getChatUnlimitedRemainingSeconds,
} from "@/lib/chat-unlimited-pass";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const COINS_PER_QUESTION = 3;
const SUCCESS_STATUSES = ["paid", "success", "captured"];

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

function isCareerIntent(text: string): boolean {
  const lower = (text || "").toLowerCase();
  return (
    lower.includes("career") ||
    lower.includes("job") ||
    lower.includes("profession") ||
    lower.includes("work field") ||
    lower.includes("what should i do") ||
    lower.includes("what role")
  );
}

const FOLLOW_UP_BLOCK_PATTERN = /<follow_up_questions>([\s\S]*?)<\/follow_up_questions>/i;

const FOLLOW_UP_DIRECTIVE = `

=== FOLLOW-UP BUTTONS RULE (MANDATORY) ===
At the very end of every answer, after the visible user-facing response, append this hidden metadata block:
<follow_up_questions>{"questions":["question 1","question 2","question 3"]}</follow_up_questions>

Rules for the questions:
- Provide 2 or 3 natural next questions the user might ask.
- Phrase each as the user's direct next message to Elysia.
- Keep each question short, specific, and under 90 characters.
- Make them relevant to the user's latest message and your reply.
- Avoid follow-up questions about already-past dates or elapsed windows.
- Do not mention payments, coins, question packs, or the metadata block.
- Do not show these questions in the visible answer outside the metadata block.
- Do not ask a visible follow-up question in the normal answer text. The app will show follow-up buttons from the metadata block.`;

function getCurrentDateContext(): string {
  const now = new Date();
  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  const year = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);

  return `

=== CURRENT DATE AND TIMING RULES (MANDATORY) ===
Current date: ${formattedDate} (Asia/Kolkata). Current year: ${year}.

When giving timing:
- Treat this current date as "now".
- Never describe a date or window that already ended before today as a future prediction.
- If a timing window started in the past but is still active, say it is active now and focus on the remaining window.
- If a timing window has already passed, acknowledge that and move to the next upcoming supported window.
- For 2026 questions, do not say "early 2026" as a future event after mid-2026. Use "rest of 2026", "late 2026", or the next future year if supported by the data.
- Follow-up button questions must also be current-date aware.`;
}

function cleanFollowUpQuestion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const question = value.replace(/\s+/g, " ").trim();
  if (!question) return null;
  return question.length > 90 ? `${question.slice(0, 87).trim()}...` : question;
}

function getFallbackFollowUps(userMessage: string): string[] {
  const lower = (userMessage || "").toLowerCase();

  if (isCareerIntent(userMessage)) {
    return [
      "Which career path suits me best?",
      "When will my career improve?",
      "What should I focus on next?",
    ];
  }

  if (
    lower.includes("love") ||
    lower.includes("marriage") ||
    lower.includes("relationship") ||
    lower.includes("partner")
  ) {
    return [
      "When will my love life improve?",
      "What kind of partner suits me?",
      "What should I know about this relationship?",
    ];
  }

  if (
    lower.includes("money") ||
    lower.includes("finance") ||
    lower.includes("wealth") ||
    lower.includes("income")
  ) {
    return [
      "When will my finances improve?",
      "What blocks my money growth?",
      "How can I attract better opportunities?",
    ];
  }

  return [
    "What should I focus on next?",
    "What timing should I watch for?",
    "What does my chart say about this?",
  ];
}

function extractFollowUpQuestions(rawReply: string, userMessage: string) {
  const match = rawReply.match(FOLLOW_UP_BLOCK_PATTERN);
  const visibleReply = rawReply.replace(FOLLOW_UP_BLOCK_PATTERN, "").trim();
  const questions: string[] = [];

  if (match?.[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const rawQuestions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.questions)
          ? parsed.questions
          : [];

      rawQuestions.forEach((question: unknown) => {
        const cleaned = cleanFollowUpQuestion(question);
        if (cleaned && !questions.includes(cleaned)) {
          questions.push(cleaned);
        }
      });
    } catch (error) {
      console.warn("[chat] Failed to parse follow-up questions:", error);
    }
  }

  for (const fallback of getFallbackFollowUps(userMessage)) {
    if (questions.length >= 3) break;
    if (!questions.includes(fallback)) questions.push(fallback);
  }

  return {
    reply: visibleReply || rawReply.trim(),
    followUpQuestions: questions.slice(0, 3),
  };
}

async function getActiveUnlimitedChatPass(userId: string | null) {
  if (!userId) return null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("payments")
      .select("id, fulfilled_at, created_at")
      .eq("user_id", userId)
      .eq("type", CHAT_UNLIMITED_PASS_TYPE)
      .eq("bundle_id", CHAT_UNLIMITED_PASS_ID)
      .in("payment_status", SUCCESS_STATUSES)
      .order("fulfilled_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      console.warn("[chat] unlimited pass lookup failed:", error.message);
      return null;
    }

    for (const row of data || []) {
      const startedAt = row.fulfilled_at || row.created_at || null;
      const endsAt = getChatUnlimitedPassEndsAt(startedAt);
      const remainingSeconds = getChatUnlimitedRemainingSeconds(endsAt);
      if (endsAt && remainingSeconds > 0) {
        return {
          id: row.id,
          startedAt,
          endsAt: endsAt.toISOString(),
          remainingSeconds,
        };
      }
    }
  } catch (error) {
    console.warn("[chat] unlimited pass lookup failed:", error);
  }

  return null;
}

async function getUserCoins(userId: string | null): Promise<number> {
  if (!userId) return 0;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select("coins")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[chat] coin lookup failed:", error.message);
      return 0;
    }

    const coins = Number(data?.coins || 0);
    return Number.isFinite(coins) ? coins : 0;
  } catch (error) {
    console.warn("[chat] coin lookup failed:", error);
    return 0;
  }
}

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  try {
    const { message, userId: requestUserId, userProfile, palmImageBase64, palmReading, natalChart, context } = await request.json();
    userId = requestUserId || null;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const activeUnlimitedPass = await getActiveUnlimitedChatPass(userId);
    if (!activeUnlimitedPass) {
      const coins = await getUserCoins(userId);
      if (coins < COINS_PER_QUESTION) {
        return NextResponse.json(
          {
            error: "NO_QUESTIONS_LEFT",
            message: "No questions left",
            unlimitedPassActive: false,
          },
          { status: 402 }
        );
      }
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

    const careerDirective = isCareerIntent(String(message || ""))
      ? `\n\n=== CAREER RESPONSE RULE (MANDATORY FOR THIS MESSAGE) ===
If the user's question is about job/career/profession:
1) First identify the strongest suitable career field from the chart + palm evidence.
2) Then provide exactly 2-3 probable job roles in that field (specific role titles).
3) For each role, add one short reason tied to the user's data.
4) Keep the tone practical and concise.`
      : "";

    // Build full system prompt with loaded prompts + user data
    const fullSystemPrompt = `${elysiaSystemPrompt}\n\n${interpretationRules}${careerDirective}${getCurrentDateContext()}${FOLLOW_UP_DIRECTIVE}\n\n=== THIS USER'S PERSONAL DATA ===\n${structuredContext}`;

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
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: fullSystemPrompt,
      messages,
    });

    await logClaudeUsage({
      feature: "chat",
      operation: "reply",
      model: CLAUDE_MODEL,
      userId,
      requestId: response.id,
      usage: response.usage,
      metadata: {
        previousMessagesCount: context?.previousMessages?.length || 0,
        hasPalmReading: !!palmReading,
        hasNatalChart: !!natalChart,
        hasPalmImage: !!palmImageBase64,
        careerIntent: isCareerIntent(String(message || "")),
      },
    });

    const textContent = response.content.find((block) => block.type === "text");
    const rawReply = textContent && "text" in textContent ? textContent.text : "";
    const { reply, followUpQuestions } = extractFollowUpQuestions(rawReply, String(message || ""));

    return NextResponse.json({
      reply,
      followUpQuestions,
      usage: response.usage,
      unlimitedPassActive: !!activeUnlimitedPass,
      unlimitedPassEndsAt: activeUnlimitedPass?.endsAt || null,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    await logClaudeUsage({
      feature: "chat",
      operation: "reply",
      model: CLAUDE_MODEL,
      userId,
      status: "failed",
      error,
    });
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
