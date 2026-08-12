import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeIndianWhatsappNumber } from "@/lib/whatsapp";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export interface WhatsappSubscriberInput {
  supabase?: SupabaseAdmin;
  userId?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  source?: string | null;
  unlockedFeatures?: unknown;
  zodiacSign?: string | null;
  sunSign?: string | null;
  moonSign?: string | null;
  ascendantSign?: string | null;
  birthDay?: string | null;
  birthMonth?: string | null;
  birthYear?: string | null;
  timezone?: string | null;
  status?: string | null;
}

function cleanText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function upsertWhatsappSubscriber(input: WhatsappSubscriberInput) {
  const whatsappE164 = normalizeIndianWhatsappNumber(input.whatsappNumber);
  if (!whatsappE164) return { success: false, reason: "invalid_whatsapp_number" };

  const supabase = input.supabase || getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const normalizedEmail = cleanText(input.email)?.toLowerCase() || null;
  const normalizedUserId = cleanText(input.userId);
  const source = cleanText(input.source) || "app";

  const row = {
    user_id: normalizedUserId,
    email: normalizedEmail,
    whatsapp_number: whatsappE164,
    whatsapp_e164: whatsappE164,
    whatsapp_opt_in: true,
    whatsapp_opt_in_at: nowIso,
    whatsapp_opt_in_source: source,
    unlocked_features: input.unlockedFeatures || {},
    zodiac_sign: cleanText(input.zodiacSign),
    sun_sign: cleanText(input.sunSign),
    moon_sign: cleanText(input.moonSign),
    ascendant_sign: cleanText(input.ascendantSign),
    birth_day: cleanText(input.birthDay),
    birth_month: cleanText(input.birthMonth),
    birth_year: cleanText(input.birthYear),
    timezone: cleanText(input.timezone),
    status: cleanText(input.status) || "active",
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("whatsapp_subscribers")
    .upsert(row, { onConflict: "whatsapp_e164" });

  if (error) {
    console.error("[whatsapp-subscriber] upsert failed", error);
    return { success: false, reason: error.message };
  }

  return { success: true, whatsappNumber: whatsappE164 };
}
