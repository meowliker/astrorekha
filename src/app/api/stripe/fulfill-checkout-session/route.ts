import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  trackEvent,
  upsertContact,
  addContactToList,
  removeContactFromList,
  BREVO_LISTS,
} from "@/lib/brevo";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function offersToUnlockedFeatures(offers: string[]) {
  const updates: Record<string, boolean> = {};

  for (const offer of offers) {
    if (offer === "ultra-pack") {
      updates["prediction2026"] = true;
      updates["birthChart"] = true;
      updates["compatibilityTest"] = true;
      continue;
    }
    if (offer === "2026-predictions") updates["prediction2026"] = true;
    if (offer === "birth-chart") updates["birthChart"] = true;
    if (offer === "compatibility") updates["compatibilityTest"] = true;
  }

  return updates;
}

function getPlanCoins(plan?: string | null) {
  // 1-week and 2-week trials give 15 coins each
  if (plan === "weekly" || plan === "monthly" || plan === "1week" || plan === "2week") return 15;
  // 4-week trial (monthly) gives 30 coins
  if (plan === "yearly" || plan === "4week") return 30;
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, userId } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const resolvedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!resolvedSessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(resolvedSessionId);
    const meta: any = (session as any).metadata || {};

    const resolvedUserId = (String(meta.userId || userId || "")).trim();
    if (!resolvedUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const paymentStatus = (session.payment_status || "").toLowerCase();
    if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
      return NextResponse.json(
        { error: `Checkout not paid (status=${session.payment_status})` },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(resolvedUserId);

    // Idempotency: don't apply the same session twice.
    const userPaymentRef = userRef.collection("payments").doc(resolvedSessionId);
    const existing = await userPaymentRef.get();
    if (existing.exists && (existing.data() as any)?.fulfilledAt) {
      return NextResponse.json({ success: true, alreadyFulfilled: true });
    }

    const now = new Date().toISOString();

    // Persist payment record (and mark as fulfilled).
    const paymentRecord = {
      eventType: "fulfill.checkout.session",
      sessionId: session.id,
      userId: resolvedUserId,
      type: meta.type || null,
      plan: meta.plan || null,
      offers: meta.offers || null,
      feature: meta.feature || null,
      coins: meta.coins || null,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency || null,
      paymentStatus: session.payment_status || null,
      createdAt: now,
      fulfilledAt: now,
    };

    await userPaymentRef.set(paymentRecord, { merge: true });
    await adminDb.collection("payments").doc(resolvedSessionId).set(paymentRecord, { merge: true });

    // Apply entitlements.
    const type = String(meta.type || "").trim();
    
    console.log("Fulfill checkout - type:", type, "meta:", JSON.stringify(meta));

    await userRef.set(
      {
        email: (session.customer_details?.email || session.customer_email || "").toLowerCase() || null,
        updatedAt: now,
      },
      { merge: true }
    );

    if (type === "bundle_payment") {
      // Flow B: One-time bundle payment
      const bundleId = meta.bundleId || "";
      const flow = meta.flow || "flow-b";
      const featuresJson = meta.features || "[]";
      const features = JSON.parse(featuresJson);
      
      console.log("Fulfilling bundle payment - bundleId:", bundleId, "features:", features);
      
      // Build unlocked features object
      const unlockedFeatures: Record<string, boolean> = {};
      for (const feature of features) {
        unlockedFeatures[feature] = true;
      }
      
      // All bundles give 15 coins
      const coinsToAdd = 15;
      
      const updateData: any = {
        onboardingFlow: flow,
        purchaseType: "one-time",
        bundlePurchased: bundleId,
        unlockedFeatures,
        palmReading: features.includes("palmReading"),
        birthChart: features.includes("birthChart"),
        compatibilityTest: features.includes("compatibilityTest"),
        scansUsed: 0,
        scansAllowed: 1, // Bundle users get 1 scan only
        coins: FieldValue.increment(coinsToAdd),
        updatedAt: now,
      };
      
      // Start 24-hour timer if birth chart is included
      if (features.includes("birthChart")) {
        updateData.birthChartTimerActive = true;
        updateData.birthChartTimerStartedAt = now;
      }
      
      await userRef.set(updateData, { merge: true });
      console.log("Bundle payment fulfilled for user:", resolvedUserId);
    } else if (type === "upsell") {
      const offerList = String(meta.offers || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const unlockUpdates = offersToUnlockedFeatures(offerList);
      
      const updateData: any = {
        unlockedFeatures: unlockUpdates,
        updatedAt: now,
      };
      
      // Start 24-hour timer if birth chart is included in upsell
      if (unlockUpdates.birthChart) {
        updateData.birthChartTimerActive = true;
        updateData.birthChartTimerStartedAt = now;
      }
      
      await userRef.set(updateData, { merge: true });
    } else if (type === "report") {
      const feature = String(meta.feature || "").trim();
      if (feature) {
        const updateData: any = {
          unlockedFeatures: {
            [feature]: true,
          },
          updatedAt: now,
        };
        
        // Start 24-hour timer for birth chart
        if (feature === "birthChart") {
          updateData.birthChartTimerActive = true;
          updateData.birthChartTimerStartedAt = now;
        }
        
        await userRef.set(updateData, { merge: true });
      }
    } else if (type === "coins") {
      const coinsToAdd = parseInt(String(meta.coins || "0"), 10) || 0;
      if (coinsToAdd > 0) {
        await userRef.set(
          {
            coins: FieldValue.increment(coinsToAdd),
            updatedAt: now,
          },
          { merge: true }
        );
      }
    } else if (type === "subscription" || type === "" || !type) {
      // Only treat as subscription if explicitly marked or no type (legacy)
      // Skip if session mode is "payment" (one-time) to avoid overwriting bundle data
      if (session.mode === "subscription") {
        const plan = String(meta.plan || "").trim() || null;
        const coinsToAdd = getPlanCoins(plan);
        await userRef.set(
          {
            subscriptionPlan: plan,
            subscriptionStatus: "active",
            subscriptionStartedAt: now,
            subscriptionCancelled: false,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
            stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
            updatedAt: now,
          },
          { merge: true }
        );
        if (coinsToAdd > 0) {
          await userRef.set(
            {
              coins: FieldValue.increment(coinsToAdd),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } else {
        console.log("Skipping subscription fulfillment for non-subscription session mode:", session.mode, "type:", type);
      }
    }

    // ── Brevo: Track checkout_completed & manage lists ──────────────
    const customerEmail = (
      session.customer_details?.email ||
      session.customer_email ||
      ""
    ).toLowerCase().trim();

    if (customerEmail) {
      try {
        // Read user's sun sign from Firestore for personalized daily emails
        let sunSign = "Aries";
        const userData = (await userRef.get()).data();
        if (userData) {
          const raw = userData.sunSign;
          if (typeof raw === "string") sunSign = raw;
          else if (raw?.name) sunSign = raw.name;
        }

        // If sun sign still default, check user_profiles collection
        if (sunSign === "Aries") {
          try {
            const profileSnap = await adminDb.collection("user_profiles").doc(resolvedUserId).get();
            if (profileSnap.exists) {
              const pData = profileSnap.data();
              const raw = pData?.sunSign;
              if (typeof raw === "string") sunSign = raw;
              else if (raw?.name) sunSign = raw.name;
            }
          } catch (_) {}
        }

        const plan = String(meta.plan || meta.bundleId || type || "").trim();

        // Upsert contact with attributes for personalized emails
        await upsertContact(customerEmail, {
          SUN_SIGN: sunSign,
          PLAN: plan,
          FIRSTNAME: userData?.name || "",
        });

        // Remove from abandoned checkout list (they converted!)
        await removeContactFromList(customerEmail, BREVO_LISTS.ABANDONED_CHECKOUT);

        // Add to active subscribers list for daily horoscope emails
        await addContactToList(customerEmail, BREVO_LISTS.ACTIVE_SUBSCRIBERS);

        // Fire checkout_completed event (cancels the 30-min abandoned cart automation)
        await trackEvent(customerEmail, "checkout_completed", {
          plan,
          amount: session.amount_total ? session.amount_total / 100 : 0,
          sunSign,
        });

        console.log("[Brevo] checkout_completed tracked for:", customerEmail, "sunSign:", sunSign);
      } catch (brevoErr: any) {
        // Non-critical: don't fail the fulfillment if Brevo errors
        console.error("[Brevo] Error in fulfill-checkout:", brevoErr?.message || brevoErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fulfill checkout session error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fulfill checkout session" },
      { status: 500 }
    );
  }
}
