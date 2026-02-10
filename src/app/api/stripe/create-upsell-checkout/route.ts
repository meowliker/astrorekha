import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs for upsell products - you'll need to create these in Stripe Dashboard
const UPSELL_PRICES: Record<string, { priceId: string; amount: number }> = {
  "2026-predictions": {
    priceId: process.env.STRIPE_PRICE_2026_PREDICTIONS || "",
    amount: 699, // $6.99 in cents
  },
  "birth-chart": {
    priceId: process.env.STRIPE_PRICE_BIRTH_CHART || "",
    amount: 699,
  },
  "compatibility": {
    priceId: process.env.STRIPE_PRICE_COMPATIBILITY || "",
    amount: 699,
  },
  "ultra-pack": {
    priceId: process.env.STRIPE_PRICE_ULTRA_PACK || "",
    amount: 999, // $9.99 in cents
  },
};

export async function POST(request: NextRequest) {
  try {
    const { selectedOffers, offers, userId, email, successPath, cancelPath, flow } = await request.json();
    
    // Support both 'selectedOffers' and 'offers' parameter names
    const offersList = selectedOffers || offers || [];

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 500 }
      );
    }

    if (!offersList || offersList.length === 0) {
      return NextResponse.json(
        { error: "No offers selected" },
        { status: 400 }
      );
    }

    // Build line items based on selected offers
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let totalAmount = 0;

    for (const offerId of offersList) {
      const offer = UPSELL_PRICES[offerId];
      if (!offer) continue;

      // If price ID exists in Stripe, use it; otherwise create a price_data
      if (offer.priceId) {
        lineItems.push({
          price: offer.priceId,
          quantity: 1,
        });
      } else {
        // Create inline price for one-time payment
        const offerNames: Record<string, string> = {
          "2026-predictions": "2026 Future Predictions Report",
          "birth-chart": "Birth Chart Report",
          "compatibility": "Compatibility Report",
          "ultra-pack": "Ultra Pack 3 in 1",
        };

        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: offerNames[offerId] || offerId,
            },
            unit_amount: offer.amount,
          },
          quantity: 1,
        });
      }
      totalAmount += offer.amount;
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "No valid offers selected" },
        { status: 400 }
      );
    }

    // Get the base URL - use request origin as fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";

    // Determine success/cancel URLs based on flow
    const isFlowB = flow === "flow-b";
    let successUrl = isFlowB
      ? `${baseUrl}/onboarding/step-19?upsell_success=true&offers=${offersList.join(",")}&session_id={CHECKOUT_SESSION_ID}`
      : `${baseUrl}/onboarding/step-19?upsell_success=true&offers=${offersList.join(",")}&session_id={CHECKOUT_SESSION_ID}`;
    let cancelUrl = isFlowB
      ? `${baseUrl}/onboarding/bundle-upsell?cancelled=true`
      : `${baseUrl}/onboarding/step-18?cancelled=true`;

    if (typeof successPath === "string" && successPath.startsWith("/")) {
      successUrl = `${baseUrl}${successPath}`;
    }

    if (!successUrl.includes("{CHECKOUT_SESSION_ID}")) {
      successUrl = successUrl.includes("?")
        ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
        : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`;
    }
    if (typeof cancelPath === "string" && cancelPath.startsWith("/")) {
      cancelUrl = `${baseUrl}${cancelPath}`;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment", // One-time payment, not subscription
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId || "",
        type: "upsell",
        offers: offersList.join(","),
        flow: flow || "flow-a",
      },
    };

    // Add customer email if valid
    if (email && email.includes("@")) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      totalAmount: totalAmount / 100, // Return in dollars
    });
  } catch (error: any) {
    console.error("Upsell checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
