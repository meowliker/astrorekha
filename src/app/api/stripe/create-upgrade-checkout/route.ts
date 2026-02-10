import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs for subscription plans
const PRICE_IDS: Record<string, string> = {
  // New manage subscription plans
  "2week-plan": process.env.STRIPE_PRICE_2WEEK_PLAN!,  // $19.99 every 2 weeks
  "monthly-plan": process.env.STRIPE_PRICE_MONTHLY_PLAN!, // $29.99 monthly
  // Legacy plans (for backward compatibility)
  weekly: process.env.STRIPE_PRICE_WEEKLY!,
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!,
  // Trial plan mappings (if user somehow tries to upgrade to these)
  "1week": process.env.STRIPE_PRICE_2WEEK_PLAN!,
  "2week": process.env.STRIPE_PRICE_2WEEK_PLAN!,
  "4week": process.env.STRIPE_PRICE_MONTHLY_PLAN!,
};

// Change subscription plan - updates existing subscription instead of creating new checkout
// During trial: no immediate charge, new plan takes effect at trial end
// After trial: prorated or at next billing cycle based on proration_behavior
export async function POST(request: NextRequest) {
  try {
    const { plan, userId, email } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured - skipping");
      return NextResponse.json({ skip: true, message: "Stripe not configured" });
    }

    const newPriceId = PRICE_IDS[plan];
    
    if (!plan || !newPriceId) {
      return NextResponse.json(
        { error: `Price ID not configured for plan: ${plan}` },
        { status: 400 }
      );
    }

    // Try to find existing subscription
    let subscriptionId: string | null = null;
    let isTrialing = false;

    if (userId) {
      const adminDb = getAdminDb();
      const userDoc = await adminDb.collection("users").doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data() as any;
        subscriptionId = userData?.stripeSubscriptionId || null;
        isTrialing = userData?.subscriptionStatus === "trialing";
      }
    }

    // If no subscription found by userId, try to find by email
    if (!subscriptionId && email) {
      const customers = await stripe.customers.list({
        email: email.toLowerCase(),
        limit: 1,
      });
      
      if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
        });
        
        const activeSub = subscriptions.data.find(
          (s) => ["active", "trialing", "past_due"].includes(s.status)
        );
        
        if (activeSub) {
          subscriptionId = activeSub.id;
          isTrialing = activeSub.status === "trialing";
        }
      }
    }

    // If we have an existing subscription, update it instead of creating new checkout
    if (subscriptionId) {
      try {
        // Get the current subscription to find the item ID
        const currentSub = await stripe.subscriptions.retrieve(subscriptionId);
        
        if (!currentSub.items.data.length) {
          throw new Error("No subscription items found");
        }

        const subscriptionItemId = currentSub.items.data[0].id;
        
        // Update the subscription with the new price
        // proration_behavior: 'none' means no immediate charge during trial
        // The new price will take effect at the next billing cycle (trial end or renewal)
        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          // During trial: no proration (charge happens at trial end with new price)
          // After trial: also no proration (change takes effect at next renewal)
          proration_behavior: "none",
          metadata: {
            userId: userId || "",
            plan,
            updatedAt: new Date().toISOString(),
          },
        });

        // Update Firebase with new plan info
        if (userId) {
          const adminDb = getAdminDb();
          const now = new Date().toISOString();
          await adminDb.collection("users").doc(userId).set(
            {
              subscriptionPlan: plan,
              stripeSubscriptionId: updatedSubscription.id,
              planChangedAt: now,
              planChangeEffectiveAt: isTrialing && updatedSubscription.trial_end
                ? new Date(updatedSubscription.trial_end * 1000).toISOString()
                : updatedSubscription.current_period_end
                  ? new Date(updatedSubscription.current_period_end * 1000).toISOString()
                  : null,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        return NextResponse.json({
          success: true,
          message: isTrialing
            ? "Plan updated! New pricing will take effect when your trial ends."
            : "Plan updated! New pricing will take effect at your next billing cycle.",
          subscription: {
            id: updatedSubscription.id,
            status: updatedSubscription.status,
            plan,
          },
        });
      } catch (updateError: any) {
        console.error("Failed to update existing subscription:", updateError);
        // Fall through to create new checkout as fallback
      }
    }

    // Fallback: Create new checkout session if no existing subscription
    // This handles edge cases where user somehow doesn't have a subscription
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: [
        {
          price: newPriceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/manage-subscription?upgraded=true&plan=${plan}`,
      cancel_url: `${baseUrl}/manage-subscription`,
      metadata: {
        userId: userId || "",
        plan,
        isUpgrade: "true",
      },
      customer_creation: "always",
      subscription_data: {
        metadata: {
          userId: userId || "",
          plan,
          isUpgrade: "true",
        },
      },
    };

    if (email && email.includes("@")) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("Stripe upgrade/change plan error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to change subscription plan" },
      { status: 500 }
    );
  }
}
