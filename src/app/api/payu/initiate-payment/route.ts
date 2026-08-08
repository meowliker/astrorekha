import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";
import { sanitizePaymentAttribution, type PaymentAttributionPayload } from "@/lib/attribution";
import { recordMarketingEvent } from "@/lib/marketing-events";
import {
  birthSnapshotToDbFields,
  birthSnapshotToUserDbFields,
  normalizeBirthDetailsSnapshot,
  type BirthDetailsInput,
} from "@/lib/birth-details";

const GST_RATE_PERCENT = 18;

// Fetch dynamic pricing from database
async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "pricing")
      .maybeSingle();
    
    return normalizePricing(data?.value) || DEFAULT_PRICING;
  } catch {
    return DEFAULT_PRICING;
  }
}

function generateHash(params: Record<string, string>, salt: string): string {
  // PayU hash sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
  const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${params.udf1 || ""}|${params.udf2 || ""}|${params.udf3 || ""}|${params.udf4 || ""}|${params.udf5 || ""}||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPaise(value: number): number {
  return Math.round(value * 100);
}

function coinsToQuestionCount(coins: number): number {
  return Math.floor(Math.max(0, coins) / 3);
}

async function ensurePaymentUser(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  userId?: string;
  email: string;
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
    console.error("[payu/initiate-payment] Failed to check user before payment", {
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
    email: email || null,
  });

  if (!insertWithEmailError) return normalizedUserId;

  const { error: insertWithoutEmailError } = await supabase.from("users").insert(baseUserRow);
  if (insertWithoutEmailError) {
    console.error("[payu/initiate-payment] Failed to create user before payment", {
      userId: normalizedUserId,
      error: insertWithoutEmailError,
      firstError: insertWithEmailError,
    });
    return null;
  }

  return normalizedUserId;
}

function extractAttributionFromReferer(referer: string | undefined): PaymentAttributionPayload {
  if (!referer) return {};
  try {
    const url = new URL(referer);
    const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;
    return sanitizePaymentAttribution({
      fbclid: get("fbclid"),
      utm_source: get("utm_source"),
      utm_medium: get("utm_medium"),
      utm_campaign: get("utm_campaign"),
      utm_term: get("utm_term"),
      utm_content: get("utm_content"),
      utm_id: get("utm_id"),
      meta_campaign_id:
        get("meta_campaign_id") ||
        get("campaign_id") ||
        get("campaignid") ||
        get("utm_campaign_id") ||
        get("cid"),
      meta_adset_id: get("meta_adset_id") || get("adset_id") || get("adsetid"),
      meta_ad_id: get("meta_ad_id") || get("ad_id") || get("adid"),
      click_id: get("gclid") || get("gbraid") || get("wbraid"),
      landing_path: `${url.pathname}${url.search}`,
      landing_url: url.toString(),
      referrer_url: referer,
      captured_at: new Date().toISOString(),
    });
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      type?: string;
      bundleId?: string;
      packageId?: string;
      userId?: string;
      email?: string;
        firstName?: string;
        paywallTestId?: string;
        paywallVariant?: "A" | "B";
        attribution?: PaymentAttributionPayload;
        birthDetails?: BirthDetailsInput;
      };
      const { type, bundleId, packageId, userId, email, firstName, paywallTestId, paywallVariant, attribution, birthDetails } = body;
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const normalizedPaywallTestId = typeof paywallTestId === "string" ? paywallTestId.trim() || null : null;
      const normalizedPaywallVariant = paywallVariant === "B" ? "B" : paywallVariant === "A" ? "A" : null;
      const shouldApplyExclusiveGst = type === "bundle";
      const sanitizedAttribution = sanitizePaymentAttribution(attribution);
      const birthDetailsSnapshot = normalizeBirthDetailsSnapshot(birthDetails, "payu_initiate");
    const requestReferrer = request.headers.get("referer") || undefined;
    const refererAttribution = extractAttributionFromReferer(requestReferrer);
    const finalAttribution: PaymentAttributionPayload = {
      ...refererAttribution,
      ...sanitizedAttribution,
    };

    const merchantKey = process.env.PAYU_MERCHANT_KEY;
    const merchantSalt = process.env.PAYU_MERCHANT_SALT;

    if (!merchantKey || !merchantSalt) {
      return NextResponse.json(
        { error: "PayU not configured" },
        { status: 500 }
      );
    }

    // Fetch dynamic pricing from database
    const pricing = await getPricingConfig();

      let amount: number;
      let baseAmount: number | null = null;
      let gstAmount: number | null = null;
      let gstRate: number | null = null;
      let taxMode: "inclusive" | "exclusive_gst" = "inclusive";
      let productInfo: string;
      const metadata: Record<string, string> = {
        userId: userId || "",
        type: type || "",
    };
    if (normalizedPaywallTestId) metadata.paywallTestId = normalizedPaywallTestId;
    if (normalizedPaywallVariant) metadata.paywallVariant = normalizedPaywallVariant;

    if (type === "bundle") {
      const bundle = pricing.bundles.find(b => b.id === bundleId);
      if (!bundle) {
        return NextResponse.json({ error: `Invalid bundle: ${bundleId}` }, { status: 400 });
      }
        baseAmount = bundle.displayPrice || bundle.price;
        if (shouldApplyExclusiveGst) {
          gstRate = GST_RATE_PERCENT;
          gstAmount = roundMoney(baseAmount * (GST_RATE_PERCENT / 100));
          amount = roundMoney(baseAmount + gstAmount);
          taxMode = "exclusive_gst";
          metadata.taxMode = taxMode;
          metadata.baseAmountInr = baseAmount.toFixed(2);
          metadata.gstRatePercent = String(GST_RATE_PERCENT);
          metadata.gstAmountInr = gstAmount.toFixed(2);
          metadata.totalAmountInr = amount.toFixed(2);
        } else {
          amount = bundle.price;
          baseAmount = bundle.price;
        }
        productInfo = bundle.name;
        metadata.bundleId = bundle.id;
        metadata.features = JSON.stringify(bundle.features);
    } else if (type === "upsell") {
      const selectedUpsellIds = (bundleId || packageId || "")
        .split(",")
        .map((id: string) => id.trim())
        .filter(Boolean);

      if (selectedUpsellIds.length === 0) {
        return NextResponse.json({ error: "Invalid upsell selection" }, { status: 400 });
      }

      const selectedUpsells = selectedUpsellIds
        .map((id: string) => pricing.upsells.find((u) => u.id === id))
        .filter(Boolean) as PricingConfig["upsells"];

      if (selectedUpsells.length !== selectedUpsellIds.length) {
        return NextResponse.json({ error: "Invalid upsell" }, { status: 400 });
      }

      amount = selectedUpsells.reduce((sum, upsell) => sum + upsell.price, 0);
      productInfo =
        selectedUpsells.length === 1
          ? selectedUpsells[0].name
          : `Upsells: ${selectedUpsells.map((u) => u.name).join(" + ")}`;

      metadata.feature =
        selectedUpsells.length === 1
          ? selectedUpsells[0].feature
          : selectedUpsells.map((u) => u.feature).join(",");
    } else if (type === "coins") {
      const coinPkg = pricing.coinPackages.find(c => c.id === packageId);
      if (!coinPkg) {
        return NextResponse.json({ error: "Invalid coin package" }, { status: 400 });
      }
      amount = coinPkg.price;
      productInfo = `${coinsToQuestionCount(coinPkg.coins)} Questions`;
      metadata.coins = coinPkg.coins.toString();
    } else if (type === "report") {
      const report = pricing.reports.find(r => r.id === packageId);
      if (!report) {
        return NextResponse.json({ error: "Invalid report" }, { status: 400 });
      }
      amount = report.price;
      productInfo = report.name;
      metadata.feature = report.feature;
      metadata.reportId = report.id;
    } else {
      return NextResponse.json({ error: "Invalid purchase type" }, { status: 400 });
    }

    // Generate unique transaction ID
    const txnId = `TXN_${Date.now()}_${(userId || "anon").slice(-6)}`;

    // Prepare PayU parameters
    const payuParams = {
      key: merchantKey,
      txnid: txnId,
      amount: amount.toFixed(2),
      productinfo: productInfo,
      firstname: firstName || "Customer",
      email: normalizedEmail || "customer@astrorekha.com",
      phone: "",
      udf1: userId || "",
      udf2: type || "",
      udf3: bundleId || packageId || "",
      udf4: metadata.feature || "",
      udf5: metadata.coins || "",
    };

    // Generate hash
    const hash = generateHash(payuParams, merchantSalt);

    const supabase = getSupabaseAdmin();
    const resolvedPaymentUserId = await ensurePaymentUser({
      supabase,
      userId,
      email: normalizedEmail,
    });

    if (resolvedPaymentUserId && birthDetailsSnapshot) {
      const nowIso = new Date().toISOString();
      const birthFields = birthSnapshotToDbFields(birthDetailsSnapshot);
      const userBirthFields = birthSnapshotToUserDbFields(birthDetailsSnapshot);

      if (Object.keys(birthFields).length > 0) {
        await supabase.from("user_profiles").upsert(
          {
            id: resolvedPaymentUserId,
            email: normalizedEmail || null,
            ...birthFields,
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
      }

      if (Object.keys(userBirthFields).length > 0) {
        await supabase
          .from("users")
          .update({
            ...userBirthFields,
            updated_at: nowIso,
          })
          .eq("id", resolvedPaymentUserId);
      }
    }

    // Save payment record (await to ensure it's created before returning)
    const { error: paymentError } = await supabase.from("payments").insert({
      id: `pay_${txnId}`,
      payu_txn_id: txnId,
      user_id: resolvedPaymentUserId,
      type,
      bundle_id: (bundleId || packageId || null),
      feature: metadata.feature || null,
      coins: metadata.coins ? parseInt(metadata.coins, 10) : null,
      customer_email: normalizedEmail || null,
        amount: toPaise(amount), // Store in paise for consistency
        paywall_test_id: normalizedPaywallTestId,
        paywall_variant: normalizedPaywallVariant,
        tax_mode: taxMode,
        base_amount: baseAmount !== null ? toPaise(baseAmount) : null,
        gst_rate: gstRate,
        gst_amount: gstAmount !== null ? toPaise(gstAmount) : null,
        total_amount: toPaise(amount),
        currency: "INR",
      payment_status: "created",
      birth_details_snapshot: birthDetailsSnapshot,
      birth_details_complete: birthDetailsSnapshot?.completeForBirthChart || false,
      fbclid: finalAttribution.fbclid || null,
      fbc: finalAttribution.fbc || null,
      fbp: finalAttribution.fbp || null,
      utm_source: finalAttribution.utm_source || null,
      utm_medium: finalAttribution.utm_medium || null,
      utm_campaign: finalAttribution.utm_campaign || null,
      utm_term: finalAttribution.utm_term || null,
      utm_content: finalAttribution.utm_content || null,
      utm_id: finalAttribution.utm_id || null,
      click_id: finalAttribution.click_id || null,
      meta_campaign_id: finalAttribution.meta_campaign_id || null,
      meta_adset_id: finalAttribution.meta_adset_id || null,
      meta_ad_id: finalAttribution.meta_ad_id || null,
      landing_path: finalAttribution.landing_path || null,
      landing_url: finalAttribution.landing_url || null,
      referrer_url: finalAttribution.referrer_url || requestReferrer || null,
      attribution_captured_at: finalAttribution.captured_at || new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    
    if (paymentError) {
      console.error("Failed to save payment record:", paymentError);
      return NextResponse.json(
        { error: "Unable to create payment record. Please try again." },
        { status: 500 }
      );
    }

    await recordMarketingEvent({
      eventName: "checkout_started",
      userId: resolvedPaymentUserId,
      email: normalizedEmail || null,
      productType: type || null,
      productId: bundleId || packageId || null,
      productName: productInfo,
      paymentId: `pay_${txnId}`,
      payuTxnId: txnId,
        amount: toPaise(amount),
      currency: "INR",
      route: finalAttribution.landing_path || null,
      url: finalAttribution.landing_url || null,
      referrerUrl: finalAttribution.referrer_url || requestReferrer || null,
      attribution: finalAttribution,
      metadata,
    });

    return NextResponse.json({
      txnId,
      amount: payuParams.amount,
      productInfo,
      hash,
      key: merchantKey,
      firstName: payuParams.firstname,
      email: payuParams.email,
      udf1: payuParams.udf1,
      udf2: payuParams.udf2,
      udf3: payuParams.udf3,
      udf4: payuParams.udf4,
      udf5: payuParams.udf5,
    });
  } catch (error: unknown) {
    console.error("PayU initiate payment error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to initiate payment";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
