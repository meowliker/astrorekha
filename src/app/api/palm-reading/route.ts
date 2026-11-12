import { NextRequest, NextResponse } from "next/server";
import { reportSessionUser } from "@/lib/report-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateZodiacSign } from "@/lib/user-profile";
import Anthropic from "@anthropic-ai/sdk";
import { logClaudeUsage } from "@/lib/ai-usage-logger";
import { getBirthDateIso, normalizeBirthDetailsSnapshot } from "@/lib/birth-details";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  timeout: 120000,
  maxRetries: 0,
});

export const maxDuration = 180;

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

const PALM_READING_PROMPT = `You are an expert palm reader and mystic with decades of experience analyzing palms. Analyze this palm image and provide a comprehensive reading.

User's birth date: {birthDate}
User's zodiac sign: {zodiacSign}
User's gender: {gender}

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
      "familyPredictions": "Family and children indications",
      "pregnancyWindow": {
        "title": "Pregnancy Window",
        "primaryYear": "Most likely year, for example 2027",
        "secondaryWindow": "Optional secondary timing window, for example late 2028 or empty string",
        "description": "2-3 sentences explaining the pregnancy or parenthood timing in a warm, reflective palm reading tone"
      }
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

const PREGNANCY_WINDOW_GUIDANCE = `
Pregnancy/parenthood guidance rules:
- Always include love.pregnancyWindow.
- Choose the most likely year or year range based on the visible palm indicators, birth date, and zodiac context. Do not hardcode one year for everyone.
- If gender is female, use title "Pregnancy Window" and describe pregnancy-related timing.
- If gender is male, use title "Parenthood Window" and describe pregnancy news through a partner, planning for fatherhood, or becoming a father. Do not say he may get pregnant.
- If gender is non-binary or unspecified, use title "Parenthood Window" and keep the wording neutral.
- Do not assume this is their first child or that they have no children already. Use neutral wording like "pregnancy news", "a child-related chapter", "parenthood responsibilities", or "expanding the family" when appropriate.
- Do not predict baby sex/gender such as boy or girl.
- Do not give an exact birth date or exact conception date.
- Do not make medical claims or guarantees. Use language like "suggests", "may", and "supportive window".`;

async function palmAccount(request: NextRequest) {
  const userId = reportSessionUser(request);
  if (!userId) return null;
  const db = getSupabaseAdmin();
  const {data, error} = await db.from("users").select("unlocked_features,is_dev_tester").eq("id",userId).maybeSingle();
  if(error) throw error;
  return data && (data.is_dev_tester === true || data.unlocked_features?.palmReading === true) ? userId : null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await palmAccount(request);
    if(!userId) return NextResponse.json({success:false,error:"Sign in to your purchased account."},{status:403});
    const db=getSupabaseAdmin();
    const [saved,profile]=await Promise.all([
      db.from("palm_readings").select("reading,palm_image_url,birth_date,deleted_at").eq("id",userId).maybeSingle(),
      db.from("user_profiles").select("palm_image,birth_year,birth_month,birth_day,gender").eq("id",userId).maybeSingle()
    ]);
    if(saved.error || profile.error) throw saved.error || profile.error;
    return NextResponse.json({success:true,reading:!saved.data?.deleted_at && saved.data?.reading?.tabs ? saved.data.reading : null,
      image:profile.data?.palm_image || saved.data?.palm_image_url || null}, {headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({success:false,error:"Unable to load your saved palm. Please try again."},{status:503}); }
}

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  try {
    if(request.headers.get("sec-fetch-site")==="cross-site" || (request.headers.get("origin") && new URL(request.headers.get("origin")!).host!==request.headers.get("host"))) {
      return NextResponse.json({success:false,error:"Invalid origin"},{status:403});
    }
    userId = await palmAccount(request);
    if(!userId) return NextResponse.json({success:false,error:"Sign in to your purchased account."},{status:403});
    const body = await request.json();
    const db=getSupabaseAdmin();
    const {data:profile,error:profileError}=await db.from("user_profiles").select("palm_image,birth_year,birth_month,birth_day,gender").eq("id",userId).maybeSingle();
    if(profileError) throw profileError;
    const imageData = body.imageData || profile?.palm_image;
    const birthDate = body.birthDate || (profile ? getBirthDateIso({birthYear:profile.birth_year,birthMonth:profile.birth_month,birthDay:profile.birth_day}) : "");
    const gender = body.gender || profile?.gender;
    const parts=String(birthDate).split("-");
    const zodiacSign = body.zodiacSign || calculateZodiacSign(parts[1],parts[2]);
    if(typeof imageData!=="string" || imageData.length>8000000 || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imageData)) {
      return NextResponse.json({success:false,error:"Please use a supported palm photo under 6 MB."},{status:400});
    }
    const {data:existing,error:existingError}=await db.from("palm_readings").select("reading,birth_date,palm_image_url,zodiac_sign,deleted_at").eq("id",userId).maybeSingle();
    if(existingError) throw existingError;
    if(!existing?.deleted_at && existing?.reading?.tabs && existing.birth_date===birthDate && existing.zodiac_sign===zodiacSign && existing.palm_image_url===imageData) {
      return NextResponse.json({success:true,reading:existing.reading,cached:true});
    }

    if (!imageData) {
      return NextResponse.json(
        { success: false, error: "No image provided" },
        { status: 400 }
      );
    }

    const [birthYear, birthMonth, birthDay] = String(birthDate || "").split("-");
    const birthSnapshot = normalizeBirthDetailsSnapshot(
      { birthYear, birthMonth, birthDay, gender },
      "palm_reading_api"
    );

    if (!birthSnapshot?.completeForPalm || !zodiacSign || String(zodiacSign).trim().toLowerCase() === "unknown") {
      return NextResponse.json(
        {
          success: false,
          error: "Please complete your birth details before generating an accurate palm reading.",
          code: "BIRTH_DETAILS_REQUIRED",
        },
        { status: 400 }
      );
    }

    // Keep the input even if generation is interrupted, so another device can retry.
    if(profile?.palm_image !== imageData) {
      const {error:inputError}=await db.from("user_profiles").upsert({id:userId,palm_image:imageData,birth_year:birthYear,birth_month:birthMonth,birth_day:birthDay,gender,updated_at:new Date().toISOString()},{onConflict:"id"});
      if(inputError) throw inputError;
    }

    // Prepare the prompt with user data
    const prompt = PALM_READING_PROMPT
      .replace("{birthDate}", birthDate)
      .replace("{zodiacSign}", zodiacSign)
      .replace("{gender}", gender || "Not specified")
      + PREGNANCY_WINDOW_GUIDANCE;

    // Extract base64 data from data URL
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || "image/jpeg";

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
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

    await logClaudeUsage({
      feature: "palm_reading",
      operation: "generate",
      model: CLAUDE_MODEL,
      userId,
      requestId: response.id,
      usage: response.usage,
      metadata: {
        hasImage: true,
        mediaType,
        zodiacSign: zodiacSign || null,
        gender: gender || null,
      },
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

    if (reading?.tabs && !reading?.meta?.errorMessage) {
      const {error:saveError}=await db.from("palm_readings").upsert({id:userId,reading,palm_image_url:imageData,birth_date:birthDate,zodiac_sign:zodiacSign,deleted_at:null,created_at:new Date().toISOString()},{onConflict:"id"});
      if(saveError) throw saveError;
    }
    return NextResponse.json({
      success: true,
      reading,
    });
  } catch (error) {
    console.error("Palm reading API error:", error);
    await logClaudeUsage({
      feature: "palm_reading",
      operation: "generate",
      model: CLAUDE_MODEL,
      userId,
      status: "failed",
      error,
    });
    return NextResponse.json(
      { success: false, error: "Failed to analyze palm" },
      { status: 500 }
    );
  }
}
