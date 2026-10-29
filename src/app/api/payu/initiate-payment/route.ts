import { initiatePineLabsCheckout, pineLabsConfig } from "@/lib/pinelabs-api";
import { activePaymentGateway } from "@/lib/payment-gateway";
import { initiatePaytmCheckout, paytmConfig } from "@/lib/paytm-api";
import { createPaytmOrderId } from "@/lib/paytm-order-id";
import { quotePaymentOrder } from "@/lib/payment-quote";
import { ensurePaymentUser } from "@/lib/payu-checkout-user";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { readOrderAttribution } from "@/lib/order-attribution";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";
import { sanitizePaymentAttribution, type PaymentAttributionPayload } from "@/lib/attribution";
import { recordMarketingEvent } from "@/lib/marketing-events";
import { normalizeIndianWhatsappNumber, toPayUPhoneNumber } from "@/lib/whatsapp";
import { upsertWhatsappSubscriber } from "@/lib/whatsapp-subscriber";
import {
  birthSnapshotToDbFields,
  birthSnapshotToUserDbFields,
  normalizeBirthDetailsSnapshot,
  type BirthDetailsInput,
} from "@/lib/birth-details";
import {
  CHAT_UNLIMITED_PASS_FEATURE,
  CHAT_UNLIMITED_PASS_ID,
  CHAT_UNLIMITED_PASS_NAME,
  CHAT_UNLIMITED_PASS_PRICE_INR,
  CHAT_UNLIMITED_PASS_TYPE,
} from "@/lib/chat-unlimited-pass";

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

async function getExistingWhatsappNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId?: string
): Promise<string> {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return "";

  const { data } = await supabase
    .from("users")
    .select("whatsapp_number")
    .eq("id", normalizedUserId)
    .maybeSingle();

  return normalizeIndianWhatsappNumber(data?.whatsapp_number);
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
        whatsappNumber?: string;
        phone?: string;
        paywallTestId?: string;
        paywallVariant?: "A" | "B";
        attribution?: PaymentAttributionPayload;
        birthDetails?: BirthDetailsInput;
      };
      const {
        type,
        bundleId,
        packageId,
        userId,
        email,
        firstName,
        whatsappNumber,
        phone,
        paywallTestId,
        paywallVariant,
        attribution,
        birthDetails,
      } = body;
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const requestedWhatsappNumber = normalizeIndianWhatsappNumber(whatsappNumber || phone);
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
    const { firstTouch, lastTouch, gaClientId, gaSessionId } = await readOrderAttribution();
    // The server-side last-touch cookie takes precedence over browser-supplied attribution.
    if (lastTouch) {
      finalAttribution.utm_source = lastTouch.utm_source || undefined;
      finalAttribution.utm_medium = lastTouch.utm_medium || undefined;
      finalAttribution.utm_campaign = lastTouch.utm_campaign || undefined;
      finalAttribution.utm_term = lastTouch.utm_term || undefined;
      finalAttribution.utm_content = lastTouch.utm_content || undefined;
      finalAttribution.meta_campaign_id = lastTouch.campaign_id || undefined;
      finalAttribution.meta_adset_id = lastTouch.adset_id || undefined;
      finalAttribution.meta_ad_id = lastTouch.ad_id || undefined;
      finalAttribution.fbclid = lastTouch.fbclid || undefined;
      finalAttribution.landing_path = lastTouch.landing_path || undefined;
      finalAttribution.captured_at = lastTouch.captured_at || undefined;
    }

    const gateway = await activePaymentGateway();
    const backup = gateway === "pinelabs" ? pineLabsConfig() : gateway === "paytm" ? paytmConfig() : null;
    const merchantKey = process.env.PAYU_MERCHANT_KEY;
    const merchantSalt = process.env.PAYU_MERCHANT_SALT;

    if (gateway === "payu" && (!merchantKey || !merchantSalt)) {
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
    } else if (type === CHAT_UNLIMITED_PASS_TYPE) {
      if (packageId && packageId !== CHAT_UNLIMITED_PASS_ID) {
        return NextResponse.json({ error: "Invalid chat pass" }, { status: 400 });
      }
      amount = CHAT_UNLIMITED_PASS_PRICE_INR;
      productInfo = CHAT_UNLIMITED_PASS_NAME;
      metadata.feature = CHAT_UNLIMITED_PASS_FEATURE;
      metadata.chatPassMinutes = "20";
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

    // Backup gateways store the complete catalog snapshot, with server-side availability checks.
    const quote = gateway !== "payu" ? quotePaymentOrder(pricing, { type: type || "", bundleId, packageId }) : null;
    if (quote) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
      amount = quote.amount / 100; baseAmount = quote.baseAmount === null ? null : quote.baseAmount / 100;
      gstAmount = quote.gstAmount === null ? null : quote.gstAmount / 100;
      productInfo = quote.productName; taxMode = quote.taxMode;
      metadata.feature = type === CHAT_UNLIMITED_PASS_TYPE ? CHAT_UNLIMITED_PASS_FEATURE : quote.features.join(","); metadata.coins = String(quote.coins);
    }
    const supabase = getSupabaseAdmin();
    const checkoutWhatsappNumber =
      requestedWhatsappNumber || (await getExistingWhatsappNumber(supabase, userId));
    const payuPhone = toPayUPhoneNumber(checkoutWhatsappNumber);

    if (type === "bundle" && !payuPhone) {
      return NextResponse.json(
        { error: "WhatsApp number is required to continue checkout." },
        { status: 400 }
      );
    }

    // Generate unique transaction ID
    // PayU v1 limits txnid to 25 characters; the same ID is our payments.id.
    const txnId = gateway === "pinelabs" ? `pnl${crypto.randomBytes(12).toString("hex")}` : gateway === "paytm" ? createPaytmOrderId() : `pay_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;

    // Prepare PayU parameters
    const payuParams = {
      key: merchantKey || "",
      txnid: txnId,
      amount: amount.toFixed(2),
      productinfo: productInfo,
      firstname: firstName || "Customer",
      email: normalizedEmail || "customer@astrorekha.com",
      phone: payuPhone,
      udf1: (finalAttribution.utm_campaign || "").slice(0, 255),
      udf2: (finalAttribution.utm_term || "").slice(0, 255),
      udf3: (finalAttribution.utm_content || "").slice(0, 255),
      udf4: txnId,
      udf5: metadata.coins || "",
    };

    // Generate hash
    const hash = gateway === "payu" ? generateHash(payuParams, merchantSalt!) : "";

    const resolvedPaymentUserId = await ensurePaymentUser({
      supabase,
      userId,
      email: normalizedEmail,
      whatsappNumber: checkoutWhatsappNumber,
    });
    const nowIso = new Date().toISOString();

    if (resolvedPaymentUserId === userId && resolvedPaymentUserId && birthDetailsSnapshot) {
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

    if (checkoutWhatsappNumber && resolvedPaymentUserId === userId) {
      upsertWhatsappSubscriber({
        supabase,
        userId: resolvedPaymentUserId || userId || null,
        email: normalizedEmail || null,
        whatsappNumber: checkoutWhatsappNumber,
        source: "payu_initiate",
      }).catch((error) => {
        console.error("[payu/initiate-payment] WhatsApp subscriber sync failed", error);
      });
    }

    // Save payment record (await to ensure it's created before returning)
    const paymentRecord = {
      id: txnId,
      payu_txn_id: gateway === "payu" ? txnId : null,
      ...(quote && backup ? { gateway, gateway_order_id: gateway === "paytm" ? txnId : null, payment_mode: backup.mode,
        product_name: productInfo, fulfillment_features: quote.features, fulfillment_coins: quote.coins,
        customer_phone: payuPhone, customer_name: firstName || "Customer" } : {}),
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
      meta_client_user_agent: request.headers.get("user-agent")?.slice(0, 1024) || null,
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
      fb_campaign_id: finalAttribution.meta_campaign_id || null,
      fb_adset_id: finalAttribution.meta_adset_id || null,
      fb_ad_id: finalAttribution.meta_ad_id || null,
      first_touch: firstTouch,
      last_touch: lastTouch,
      ga_client_id: gaClientId,
      ga_session_id: gaSessionId,
      landing_path: finalAttribution.landing_path || null,
      landing_url: finalAttribution.landing_url || null,
      referrer_url: finalAttribution.referrer_url || requestReferrer || null,
      attribution_captured_at: finalAttribution.captured_at || nowIso,
      created_at: nowIso,
    };
    let { error: paymentError } = await supabase.from("payments").insert(paymentRecord);
    if (paymentError && /fb_campaign_id|fb_adset_id|fb_ad_id|first_touch|last_touch|ga_client_id|ga_session_id|meta_client_user_agent/i.test(paymentError.message)) {
      // Preserve checkout during a code-before-migration rollout; existing UTM columns still save.
      const legacyRecord = { ...paymentRecord } as Record<string, unknown>;
      for (const column of [
        "fb_campaign_id", "fb_adset_id", "fb_ad_id", "first_touch", "last_touch",
        "ga_client_id", "ga_session_id", "meta_client_user_agent",
      ]) {
        delete legacyRecord[column];
      }
      console.warn("[payu/initiate-payment] New attribution columns unavailable; retrying with existing payment columns");
      ({ error: paymentError } = await supabase.from("payments").insert(legacyRecord));
    }

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
      paymentId: txnId,
      payuTxnId: gateway === "payu" ? txnId : null,
      amount: toPaise(amount),
      currency: "INR",
      route: finalAttribution.landing_path || null,
      url: finalAttribution.landing_url || null,
      referrerUrl: finalAttribution.referrer_url || requestReferrer || null,
      attribution: finalAttribution,
      metadata,
    });

    if (backup) {
      try {
        const checkout = await (gateway === "pinelabs" ? initiatePineLabsCheckout : initiatePaytmCheckout)({ id: txnId, amount: toPaise(amount), customer_email: normalizedEmail,
          customer_name: firstName, customer_phone: payuPhone, payment_mode: backup.mode, ...(gateway === "pinelabs" ? { product_name: productInfo } : {}) });
        return NextResponse.json({ ...checkout, txnId, amount: amount.toFixed(2), productInfo }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        // A timeout does not mean a charge failed. Keep the saved order for reconciliation.
        return NextResponse.json({ error: "Payment checkout could not be opened. Please try again.", orderId: txnId }, { status: 503 });
      }
    }
    return NextResponse.json({
      txnId,
      amount: payuParams.amount,
      productInfo,
      hash,
      key: merchantKey || "",
      firstName: payuParams.firstname,
      email: payuParams.email,
      phone: payuParams.phone,
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
