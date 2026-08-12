import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeIndianWhatsappNumber } from "@/lib/whatsapp";
import { upsertWhatsappSubscriber } from "@/lib/whatsapp-subscriber";

function cleanText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function cleanEmail(value: unknown): string | null {
  const email = cleanText(value)?.toLowerCase() || null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function signName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return cleanText(record.name);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = cleanEmail(body.email);
    const userId = cleanText(body.userId);
    const whatsappNumber = normalizeIndianWhatsappNumber(body.whatsappNumber);

    if (!email || !userId || !whatsappNumber) {
      return NextResponse.json(
        { success: false, error: "email, userId, and a valid WhatsApp number are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const source = cleanText(body.source) || "onboarding_step_15";
    const zodiacSign = cleanText(body.zodiacSign);
    const sunSign = signName(body.sunSign) || zodiacSign;
    const moonSign = signName(body.moonSign);
    const ascendantSign = signName(body.ascendantSign);
    const age = numberOrNull(body.age);

    const userPayload: Record<string, unknown> = {
      id: userId,
      email,
      whatsapp_number: whatsappNumber,
      whatsapp_opt_in: true,
      whatsapp_opt_in_at: nowIso,
      whatsapp_opt_in_source: source,
      gender: cleanText(body.gender),
      relationship_status: cleanText(body.relationshipStatus),
      birth_month: cleanText(body.birthMonth),
      birth_day: cleanText(body.birthDay),
      birth_year: cleanText(body.birthYear),
      sun_sign: sunSign,
      moon_sign: moonSign,
      ascendant_sign: ascendantSign,
      updated_at: nowIso,
    };

    Object.keys(userPayload).forEach((key) => {
      if (userPayload[key] === null || userPayload[key] === undefined) {
        delete userPayload[key];
      }
    });

    const { error: userError } = await supabase
      .from("users")
      .upsert(userPayload, { onConflict: "id" });

    if (userError) {
      console.error("[whatsapp/contact] user upsert failed", userError);
      return NextResponse.json({ success: false, error: "failed_to_save_user" }, { status: 500 });
    }

    await supabase.from("leads").upsert(
      {
        id: `lead_${userId}`,
        user_id: userId,
        email,
        gender: cleanText(body.gender) || "not specified",
        age,
        birth_month: cleanText(body.birthMonth),
        birth_day: cleanText(body.birthDay),
        birth_year: cleanText(body.birthYear),
        zodiac_sign: zodiacSign,
        relationship_status: cleanText(body.relationshipStatus) || "not specified",
        goals: Array.isArray(body.goals) ? body.goals : [],
        subscription_status: "no",
        onboarding_flow: cleanText(body.onboardingFlow),
        ab_variant: cleanText(body.abVariant),
        whatsapp_number: whatsappNumber,
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: nowIso,
        whatsapp_opt_in_source: source,
        created_at: nowIso,
      },
      { onConflict: "id" }
    );

    const subscriberResult = await upsertWhatsappSubscriber({
      supabase,
      userId,
      email,
      whatsappNumber,
      source,
      unlockedFeatures: body.unlockedFeatures || {},
      zodiacSign,
      sunSign,
      moonSign,
      ascendantSign,
      birthDay: cleanText(body.birthDay),
      birthMonth: cleanText(body.birthMonth),
      birthYear: cleanText(body.birthYear),
      timezone: cleanText(body.timezone),
    });

    if (!subscriberResult.success) {
      return NextResponse.json(
        { success: false, error: subscriberResult.reason || "failed_to_save_subscriber" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, whatsappNumber });
  } catch (error) {
    console.error("[whatsapp/contact] unexpected error", error);
    return NextResponse.json({ success: false, error: "failed_to_save_contact" }, { status: 500 });
  }
}
