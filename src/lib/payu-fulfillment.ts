import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendVastuGuideEmail } from "@/lib/vastu-guide-email";
import { type PaymentAttributionPayload } from "@/lib/attribution";
import { recordMarketingEvent } from "@/lib/marketing-events";

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
  email: string | null;
}): Promise<string | null> {
  const normalizedUserId = String(params.userId || "").trim();
  if (!normalizedUserId) return null;

  const { supabase, email } = params;
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

  const { error: insertWithEmailError } = await supabase.from("users").insert({
    ...baseUserRow,
    email,
  });

  if (!insertWithEmailError) return normalizedUserId;

  const { error: insertWithoutEmailError } = await supabase.from("users").insert(baseUserRow);
  if (insertWithoutEmailError) {
    console.error("[payu-fulfillment] Failed to create user before fulfillment", {
      userId: normalizedUserId,
      error: insertWithoutEmailError,
      firstError: insertWithEmailError,
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
    .select(
      "id, user_id, payment_status, type, bundle_id, feature, coins, amount, customer_email, fbclid, fbc, fbp, utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id, click_id, meta_campaign_id, meta_adset_id, meta_ad_id, landing_path, landing_url, referrer_url, attribution_captured_at"
    )
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

  let resolvedUserId =
    payload.udf1?.trim() ||
    existingPayment?.user_id ||
    (await resolveUserIdFromEmail(payload.email));
  resolvedUserId = await ensureFulfillmentUser({
    supabase,
    userId: resolvedUserId,
    email: normalizedEmail,
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
  }

  if (!resolvedUserId || alreadyPaid) {
    return { success: true, alreadyPaid, userId: resolvedUserId || null };
  }

  const { data: user } = await supabase
    .from("users")
    .select("unlocked_features, coins")
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
  };
  let updatedFeatures = { ...currentFeatures } as Record<string, boolean>;
  let updatedCoins = typeof user?.coins === "number" ? user.coins : 0;

  const featuresToUnlock = parseFeaturesFromMetadata(type, bundleId, feature);
  for (const f of featuresToUnlock) {
    updatedFeatures[f] = true;
  }

  updatedCoins += parseCoins(type, coins, bundleId);

  const userUpdate: Record<string, any> = {
    id: resolvedUserId,
    unlocked_features: updatedFeatures,
    coins: updatedCoins,
    payment_status: "paid",
    purchase_type: type === "bundle" ? "one-time" : type,
    updated_at: nowIso,
    payu_payment_id: mihpayid || null,
    payu_txn_id: txnid,
  };

  if (type === "bundle" || type === "bundle_payment") {
    userUpdate.bundle_purchased = bundleId || null;
  }

  await supabase.from("users").upsert(userUpdate, { onConflict: "id" });

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

  return { success: true, alreadyPaid: false, userId: resolvedUserId };
}
