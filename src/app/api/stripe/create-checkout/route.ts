import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// New trial-based pricing structure
// Trial prices (one-time upfront payment)
const TRIAL_PRICE_IDS: Record<string, string> = {
  "1week": process.env.STRIPE_PRICE_1WEEK_TRIAL!, // $1 trial
  "2week": process.env.STRIPE_PRICE_2WEEK_TRIAL!, // $5.49 trial
  "4week": process.env.STRIPE_PRICE_4WEEK_TRIAL!, // $9.99 trial
  // A/B Test Variant B - Trial Prices
  "1week-v2": process.env.STRIPE_PRICE_1WEEK_TRIAL_V2!, // $2.99 trial
  "4week-v2": process.env.STRIPE_PRICE_4WEEK_TRIAL_V2!, // $7.99 trial
  "12week-v2": process.env.STRIPE_PRICE_12WEEK_TRIAL_V2!, // $14.99 trial
};

// Recurring subscription prices (after trial ends)
const SUBSCRIPTION_PRICE_IDS: Record<string, string> = {
  "1week": process.env.STRIPE_PRICE_2WEEK_PLAN!,  // $19.99 every 2 weeks
  "2week": process.env.STRIPE_PRICE_2WEEK_PLAN!,  // $19.99 every 2 weeks
  "4week": process.env.STRIPE_PRICE_MONTHLY_PLAN!, // $29.99 every month
  "yearly": process.env.STRIPE_PRICE_YEARLY2!,    // $49.99 yearly (no trial)
  // A/B Test Variant B - All convert to $49.99/month
  "1week-v2": process.env.STRIPE_PRICE_MONTHLY_V2!,  // $49.99/month
  "4week-v2": process.env.STRIPE_PRICE_MONTHLY_V2!,  // $49.99/month
  "12week-v2": process.env.STRIPE_PRICE_MONTHLY_V2!, // $49.99/month
};

// Trial periods in days for each plan
const TRIAL_DAYS: Record<string, number> = {
  "1week": 7,   // 1-week trial
  "2week": 14,  // 2-week trial
  "4week": 28,  // 4-week trial
  "yearly": 0,  // No trial for yearly
  // A/B Test Variant B - Trial periods
  "1week-v2": 7,   // 1-week trial
  "4week-v2": 28,  // 4-week trial
  "12week-v2": 84, // 12-week trial
};

// Legacy price IDs for backward compatibility
const LEGACY_PRICE_IDS: Record<string, string> = {
  weekly: process.env.STRIPE_PRICE_WEEKLY!,
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!,
};

export async function POST(request: NextRequest) {
  try {
    const { plan, userId, email } = await request.json();

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured - skipping checkout");
      return NextResponse.json({ skip: true, message: "Stripe not configured" });
    }

    // Check if it's a new trial plan, yearly plan, variant B plan, or legacy plan
    const isNewTrialPlan = ["1week", "2week", "4week"].includes(plan);
    const isVariantBPlan = ["1week-v2", "4week-v2", "12week-v2"].includes(plan);
    const isYearlyPlan = plan === "yearly";
    
    // Get the base URL - use request origin as fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";

    let sessionParams: any;

    if (isYearlyPlan) {
      // Yearly plan: Direct subscription, no trial
      const subscriptionPriceId = SUBSCRIPTION_PRICE_IDS[plan];
      
      if (!subscriptionPriceId) {
        console.log("Missing price ID for yearly plan");
        return NextResponse.json(
          {
            error: `Price ID not configured for yearly plan. Add STRIPE_PRICE_YEARLY2 env var.`,
            debug: { plan, hasSubscriptionPrice: !!subscriptionPriceId },
          },
          { status: 400 }
        );
      }

      // Direct subscription mode - no trial, charged immediately
      // Note: customer_creation is not allowed in subscription mode
      sessionParams = {
        mode: "subscription",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        line_items: [
          {
            price: subscriptionPriceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/onboarding/step-18?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/onboarding/step-17`,
        metadata: {
          userId: userId || "",
          plan: "Yearly2", // Store as Yearly2 in Firebase for differentiation
          type: "subscription",
        },
        subscription_data: {
          metadata: {
            userId: userId || "",
            plan: "Yearly2",
          },
        },
      };
    } else if (isNewTrialPlan || isVariantBPlan) {
      // Trial-based pricing: create subscription with trial period and upfront fee
      const subscriptionPriceId = SUBSCRIPTION_PRICE_IDS[plan];
      const trialPriceId = TRIAL_PRICE_IDS[plan];
      
      if (!subscriptionPriceId || !trialPriceId) {
        console.log("Missing price IDs for plan:", plan);
        return NextResponse.json(
          {
            error: `Price IDs not configured for plan: ${plan}. Add the required STRIPE_PRICE env vars.`,
            debug: {
              plan,
              hasSubscriptionPrice: !!subscriptionPriceId,
              hasTrialPrice: !!trialPriceId,
            },
          },
          { status: 400 }
        );
      }

      // Determine A/B test variant
      const abVariant = isVariantBPlan ? "B" : "A";
      const cancelUrl = isVariantBPlan 
        ? `${baseUrl}/onboarding/a-step-17` 
        : `${baseUrl}/onboarding/step-17`;

      // Use payment mode for the trial fee (one-time charge)
      // After successful payment, we'll create the subscription via webhook
      // This ensures the trial fee is charged immediately
      sessionParams = {
        mode: "payment",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        line_items: [
          {
            // One-time trial fee (charged immediately)
            price: trialPriceId,
            quantity: 1,
          },
        ],
        // Save payment method for future subscription charges
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        // Critical: Force customer creation instead of guest checkout
        customer_creation: "always",
        success_url: `${baseUrl}/onboarding/step-18?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId || "",
          plan,
          type: "trial_payment",
          subscriptionPriceId: subscriptionPriceId,
          trialDays: String(TRIAL_DAYS[plan]),
          abVariant, // Track A/B test variant
        },
      };
    } else {
      // Legacy plan handling
      const priceId = LEGACY_PRICE_IDS[plan];
      if (!plan || !priceId) {
        console.log("Missing price ID for plan:", plan);
        return NextResponse.json(
          {
            error: `Price ID not configured for plan: ${plan}`,
            debug: {
              plan,
              hasWeeklyPrice: !!process.env.STRIPE_PRICE_WEEKLY,
              hasMonthlyPrice: !!process.env.STRIPE_PRICE_MONTHLY,
              hasYearlyPrice: !!process.env.STRIPE_PRICE_YEARLY,
            },
          },
          { status: 400 }
        );
      }

      sessionParams = {
        mode: "subscription",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/onboarding/step-18?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/onboarding/step-17`,
        metadata: {
          userId: userId || "",
          plan,
          type: "subscription",
        },
        subscription_data: {
          trial_period_days: plan === "weekly" ? 3 : plan === "monthly" ? 7 : 14,
          metadata: {
            userId: userId || "",
            plan,
          },
        },
      };
    }

    // Only add customer_email if it's a valid email
    if (email && email.includes("@")) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
