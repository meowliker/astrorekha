import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendVastuGuideEmail } from "@/lib/vastu-guide-email";
import { type PaymentAttributionPayload } from "@/lib/attribution";
import { recordMarketingEvent } from "@/lib/marketing-events";
import { normalizeIndianWhatsappNumber } from "@/lib/whatsapp";
import { upsertWhatsappSubscriber } from "@/lib/whatsapp-subscriber";
import {
  birthSnapshotToDbFields,
  birthSnapshotToUserDbFields,
  isDefaultBirthDate,
  normalizeBirthDetailsSnapshot,
} from "@/lib/birth-details";
import {
  CHAT_UNLIMITED_OFFER_EVENT_NAMES,
  CHAT_UNLIMITED_PASS_ID,
  CHAT_UNLIMITED_PASS_TYPE,
} from "@/lib/chat-unlimited-pass";

const BUNDLE_FEATURES: Record<string, string[]> = {
  "palm-reading": ["palmReading"],
  "palm-birth": ["palmReading", "birthChart"],
  "palm-birth-compat": ["palmReading", "birthChart", "compatibilityTest", "futurePartnerReport"],
  "palm-birth-sketch": ["palmReading", "birthChart", "soulmateSketch", "futurePartnerReport"],
  "palm-birth-sketch-aura-astro": [
    "palmReading",
    "birthChart",
    "soulmateSketch",
    "futurePartnerReport",
    "auraColorReport",
    "astrocartographyReport",
    "pastLifeReport",
  ],
};

const BUNDLE_COIN_BONUS: Record<string, number> = {
  "palm-reading": 15,
  "palm-birth": 15,
  "palm-birth-compat": 30,
  "palm-birth-sketch": 30,
  "palm-birth-sketch-aura-astro": 60,
};

const OFFER_ID_TO_FEATURE: Record<string, string> = {
  "2026-predictions": "prediction2026",
  "birth-chart": "birthChart",
  compatibility: "compatibilityTest",
  "soulmate-sketch": "soulmateSketch",
  "future-partner": "futurePartnerReport",
  "report-future-partner": "futurePartnerReport",
  "aura-color": "auraColorReport",
  "report-aura-color": "auraColorReport",
  astrocartography: "astrocartographyReport",
  "report-astrocartography": "astrocartographyReport",
  "past-life": "pastLifeReport",
  "report-past-life": "pastLifeReport",
  "vastu-shastra-guide": "vastuShastraGuide",
  "report-vastu-shastra-guide": "vastuShastraGuide",
};

const SUCCESS_STATUSES = new Set(["success", "paid", "captured"]);

export interface PayUCallbackPayload {
  txnid?: string;
  mihpayid?: string;
  status?: string;
  hash?: string;
  amount?: string;
  productinfo?: string;
  firstname?: string;
  email?: string;
  phone?: string;
  udf1?: string; // userId
  udf2?: string; // type
  udf3?: string; // bundleId/packageId
  udf4?: string; // feature
  udf5?: string; // coins
  key?: string;
}

function normalizeStatus(status?: string): string {
  return (status || "").toLowerCase().trim();
}

function parseAmountToPaise(amount?: string): number {
  const parsed = parseFloat(amount || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function parseFeaturesFromMetadata(type: string, bundleId: string, feature: string): string[] {
  if (type === "bundle" || type === "bundle_payment") {
    return BUNDLE_FEATURES[bundleId] || [];
  }

  if (feature) {
    return feature
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (bundleId.includes(",")) {
    return bundleId
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((offer) => OFFER_ID_TO_FEATURE[offer])
      .filter(Boolean);
  }

  const mapped = OFFER_ID_TO_FEATURE[bundleId];
  return mapped ? [mapped] : [];
}

function parseCoins(type: string, coins: string, bundleId: string): number {
  if (type === "coins") {
    const parsed = parseInt(coins || "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (type === "bundle" || type === "bundle_payment") {
    return BUNDLE_COIN_BONUS[bundleId] || 0;
  }

  return 0;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "--";
}

function pickMissingBirthFields(snapshotFields: Record<string, unknown>, existing: Record<string, any> | null | undefined) {
  const picked: Record<string, unknown> = {};
  const existingHasDefaultBirthDate = isDefaultBirthDate({
    birthMonth: existing?.birth_month,
    birthDay: existing?.birth_day,
    birthYear: existing?.birth_year,
  });

  for (const [key, value] of Object.entries(snapshotFields)) {
    if (value === null || value === undefined || value === "") continue;

    if (key === "birth_month" || key === "birth_day" || key === "birth_year") {
      if (existingHasDefaultBirthDate || isBlank(existing?.[key])) picked[key] = value;
      continue;
    }

    if (isBlank(existing?.[key])) {
      picked[key] = value;
    }
  }

  return picked;
}

function attributionFromPayment(payment: any): PaymentAttributionPayload {
  if (!payment) return {};

  return {
    fbclid: payment.fbclid || undefined,
    fbc: payment.fbc || undefined,
    fbp: payment.fbp || undefined,
    utm_source: payment.utm_source || undefined,
    utm_medium: payment.utm_medium || undefined,
    utm_campaign: payment.utm_campaign || undefined,
    utm_term: payment.utm_term || undefined,
    utm_content: payment.utm_content || undefined,
    utm_id: payment.utm_id || undefined,
    click_id: payment.click_id || undefined,
    meta_campaign_id: payment.meta_campaign_id || undefined,
    meta_adset_id: payment.meta_adset_id || undefined,
    meta_ad_id: payment.meta_ad_id || undefined,
    landing_path: payment.landing_path || undefined,
    landing_url: payment.landing_url || undefined,
    referrer_url: payment.referrer_url || undefined,
    captured_at: payment.attribution_captured_at || undefined,
  };
}

async function resolveUserIdFromEmail(email?: string): Promise<string | null> {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return null;

  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  return user?.id || null;
}

async function ensureFulfillmentUser(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  userId: string | null;
}): Promise<string | null> {
  const normalizedUserId = String(params.userId || "").trim();
  if (!normalizedUserId) return null;

  const { supabase } = params;
  const { data: existingUser, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (lookupError && lookupError.code !== "PGRST116") {
    console.error("[payu-fulfillment] Failed to check user before fulfillment", {
      userId: normalizedUserId,
      error: lookupError,
    });
  }

  if (existingUser?.id) return existingUser.id;

  const nowIso = new Date().toISOString();
  const baseUserRow = {
    id: normalizedUserId,
    payment_status: "pending",
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error: insertError } = await supabase.from("users").insert(baseUserRow);
  if (insertError) {
    console.error("[payu-fulfillment] Failed to create user before fulfillment", {
      userId: normalizedUserId,
      error: insertError,
    });
    return null;
  }

  return normalizedUserId;
}

export async function fulfillPayUPayment(payload: PayUCallbackPayload): Promise<{
  success: boolean;
  alreadyPaid: boolean;
  userId: string | null;
  reason?: string;
}> {
  const status = normalizeStatus(payload.status);
  const txnid = payload.txnid?.trim() || "";
  const mihpayid = payload.mihpayid?.trim() || "";

  if (!txnid) {
    return { success: false, alreadyPaid: false, userId: null, reason: "Missing txnid" };
  }

  const supabase = getSupabaseAdmin();

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("*")
    .eq("payu_txn_id", txnid)
    .maybeSingle();

  const alreadyPaid = SUCCESS_STATUSES.has(normalizeStatus(existingPayment?.payment_status || ""));

  if (!SUCCESS_STATUSES.has(status)) {
    await supabase
      .from("payments")
      .update({
        payment_status: "failed",
        payu_payment_id: mihpayid || null,
      })
      .eq("payu_txn_id", txnid);

    await recordMarketingEvent({
      eventName: "payment_failed",
      userId: existingPayment?.user_id || payload.udf1 || null,
      email: existingPayment?.customer_email || payload.email || null,
      productType: payload.udf2 || existingPayment?.type || null,
      productId: payload.udf3 || existingPayment?.bundle_id || null,
      productName: payload.productinfo || null,
      paymentId: existingPayment?.id || `pay_${txnid}`,
      payuTxnId: txnid,
      amount: parseAmountToPaise(payload.amount) || existingPayment?.amount || null,
      currency: "INR",
      attribution: attributionFromPayment(existingPayment),
      metadata: {
        payuStatus: payload.status || null,
        mihpayid: mihpayid || null,
      },
    });

    return { success: false, alreadyPaid: false, userId: existingPayment?.user_id || null, reason: "Payment not successful" };
  }

  const amountInPaise = parseAmountToPaise(payload.amount);
  const nowIso = new Date().toISOString();
  const normalizedEmail = payload.email?.toLowerCase().trim() || null;
  const normalizedWhatsappNumber = normalizeIndianWhatsappNumber(payload.phone);

  let resolvedUserId =
    payload.udf1?.trim() ||
    existingPayment?.user_id ||
    (await resolveUserIdFromEmail(payload.email));
  resolvedUserId = await ensureFulfillmentUser({
    supabase,
    userId: resolvedUserId,
  });

  const type = (payload.udf2 || existingPayment?.type || "bundle").trim();
  const bundleId = (payload.udf3 || existingPayment?.bundle_id || "").trim();
  const feature = (payload.udf4 || existingPayment?.feature || "").trim();
  const coins = (payload.udf5 || String(existingPayment?.coins || "")).trim();

  if (existingPayment) {
    const updatePayload: Record<string, any> = {
      payu_payment_id: mihpayid || null,
      user_id: resolvedUserId || null,
      type,
      bundle_id: bundleId || null,
      feature: feature || null,
      coins: coins ? parseInt(coins, 10) : null,
      customer_email: normalizedEmail,
      payment_status: "paid",
      fulfilled_at: nowIso,
    };

    if (amountInPaise > 0) {
      updatePayload.amount = amountInPaise;
    }

    await supabase
      .from("payments")
      .update(updatePayload)
      .eq("payu_txn_id", txnid);
  } else {
    await supabase.from("payments").insert({
      id: `pay_${txnid}`,
      payu_txn_id: txnid,
      payu_payment_id: mihpayid || null,
      user_id: resolvedUserId || null,
      type,
      bundle_id: bundleId || null,
      feature: feature || null,
      coins: coins ? parseInt(coins, 10) : null,
      customer_email: normalizedEmail,
      amount: amountInPaise,
      currency: "INR",
      payment_status: "paid",
      fulfilled_at: nowIso,
      created_at: nowIso,
    });
  }

  if (!alreadyPaid) {
    await recordMarketingEvent({
      eventName: "purchase_success",
      userId: resolvedUserId || null,
      email: normalizedEmail || existingPayment?.customer_email || null,
      productType: type || null,
      productId: bundleId || null,
      productName: payload.productinfo || bundleId || feature || type || null,
      paymentId: existingPayment?.id || `pay_${txnid}`,
      payuTxnId: txnid,
      amount: amountInPaise || existingPayment?.amount || null,
      currency: "INR",
      attribution: attributionFromPayment(existingPayment),
      metadata: {
        payuStatus: payload.status || null,
        mihpayid: mihpayid || null,
        feature: feature || null,
        coins: coins || null,
      },
    });

    if (type === CHAT_UNLIMITED_PASS_TYPE && bundleId === CHAT_UNLIMITED_PASS_ID) {
      await recordMarketingEvent({
        eventName: CHAT_UNLIMITED_OFFER_EVENT_NAMES.purchaseSuccess,
        userId: resolvedUserId || null,
        email: normalizedEmail || existingPayment?.customer_email || null,
        productType: type,
        productId: bundleId,
        productName: payload.productinfo || "Unlimited Elysia Chat",
        paymentId: existingPayment?.id || `pay_${txnid}`,
        payuTxnId: txnid,
        amount: amountInPaise || existingPayment?.amount || null,
        currency: "INR",
        attribution: attributionFromPayment(existingPayment),
        metadata: {
          payuStatus: payload.status || null,
          mihpayid: mihpayid || null,
          durationMinutes: 20,
        },
      });
    }
  }

  if (!resolvedUserId) {
    return { success: true, alreadyPaid, userId: resolvedUserId || null };
  }

  const { data: user } = await supabase
    .from("users")
    .select(
      "email, unlocked_features, coins, purchase_type, whatsapp_number, gender, relationship_status, sun_sign, moon_sign, ascendant_sign, birth_day, birth_month, birth_year, birth_hour, birth_minute, birth_period, birth_place, timezone"
    )
    .eq("id", resolvedUserId)
    .maybeSingle();

  const { data: userProfile } = await supabase
    .from("user_profiles")
    .select("gender, relationship_status, birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, birth_place, knows_birth_time, timezone, sun_sign, moon_sign, ascendant_sign")
    .eq("id", resolvedUserId)
    .maybeSingle();

  const currentFeatures = user?.unlocked_features || {
    palmReading: false,
    prediction2026: false,
    birthChart: false,
    compatibilityTest: false,
    soulmateSketch: false,
    futurePartnerReport: false,
    vastuShastraGuide: false,
    auraColorReport: false,
    astrocartographyReport: false,
    pastLifeReport: false,
  };
  let updatedFeatures = { ...currentFeatures } as Record<string, boolean>;
  let updatedCoins = typeof user?.coins === "number" ? user.coins : 0;

  const featuresToUnlock = parseFeaturesFromMetadata(type, bundleId, feature);
  for (const f of featuresToUnlock) {
    updatedFeatures[f] = true;
  }

  const coinBonus = parseCoins(type, coins, bundleId);
  updatedCoins = alreadyPaid ? Math.max(updatedCoins, coinBonus) : updatedCoins + coinBonus;

  const birthDetailsSnapshot = normalizeBirthDetailsSnapshot(
    (existingPayment as any)?.birth_details_snapshot,
    "payu_fulfillment"
  );
  const snapshotDbFields = birthSnapshotToDbFields(birthDetailsSnapshot);
  const profileBirthFields = pickMissingBirthFields(snapshotDbFields, userProfile);
  const snapshotUserFields = birthSnapshotToUserDbFields(birthDetailsSnapshot);
  const userBirthFields = pickMissingBirthFields(snapshotUserFields, user);

  const userUpdate: Record<string, any> = {
    id: resolvedUserId,
    unlocked_features: updatedFeatures,
    coins: updatedCoins,
    payment_status: "paid",
    purchase_type:
      type === CHAT_UNLIMITED_PASS_TYPE
        ? user?.purchase_type || "one-time"
        : type === "bundle"
          ? "one-time"
          : type,
    updated_at: nowIso,
    payu_payment_id: mihpayid || null,
    payu_txn_id: txnid,
    ...userBirthFields,
  };

  if (type === "bundle" || type === "bundle_payment") {
    userUpdate.bundle_purchased = bundleId || null;
  }

  if (normalizedWhatsappNumber) {
    userUpdate.whatsapp_number = normalizedWhatsappNumber;
    userUpdate.whatsapp_opt_in = true;
    userUpdate.whatsapp_opt_in_at = nowIso;
    userUpdate.whatsapp_opt_in_source = "payu_fulfillment";
  }

  await supabase.from("users").upsert(userUpdate, { onConflict: "id" });

  if (Object.keys(profileBirthFields).length > 0) {
    await supabase.from("user_profiles").upsert(
      {
        id: resolvedUserId,
        email: normalizedEmail || user?.email || existingPayment?.customer_email || null,
        ...profileBirthFields,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    );
  }

  const subscriberWhatsappNumber =
    normalizedWhatsappNumber || normalizeIndianWhatsappNumber(user?.whatsapp_number);
  if (subscriberWhatsappNumber) {
    await upsertWhatsappSubscriber({
      supabase,
      userId: resolvedUserId,
      email: normalizedEmail || user?.email || existingPayment?.customer_email || null,
      whatsappNumber: subscriberWhatsappNumber,
      source: "payu_fulfillment",
      unlockedFeatures: updatedFeatures,
      sunSign: user?.sun_sign || null,
      moonSign: user?.moon_sign || null,
      ascendantSign: user?.ascendant_sign || null,
      birthDay: user?.birth_day || null,
      birthMonth: user?.birth_month || null,
      birthYear: user?.birth_year || null,
      timezone: user?.timezone || null,
    });
  }

  if (featuresToUnlock.includes("vastuShastraGuide") && normalizedEmail) {
    try {
      await sendVastuGuideEmail({
        email: normalizedEmail,
        name: payload.firstname || null,
      });
    } catch (error) {
      console.error("[PayU] Failed to send Vastu guide email:", error);
    }
  }

  return { success: true, alreadyPaid, userId: resolvedUserId };
}
