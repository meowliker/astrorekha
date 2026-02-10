import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Bundle pricing configuration (USD prices matching frontend)
const BUNDLE_CONFIG: Record<string, {
  name: string;
  price: number; // in cents (fallback if no priceId)
  priceId?: string; // Stripe Price ID
  features: string[];
  description: string;
}> = {
  "bundle-palm": {
    name: "Palm Reading",
    price: 1399, // $13.99
    priceId: process.env.STRIPE_PRICE_BUNDLE_PALM || "",
    features: ["palmReading"],
    description: "Personalized palm reading report delivered instantly.",
  },
  "bundle-palm-birth": {
    name: "Palm + Birth Chart",
    price: 1899, // $18.99
    priceId: process.env.STRIPE_PRICE_BUNDLE_PALM_BIRTH || "",
    features: ["palmReading", "birthChart"],
    description: "Deep palm insights plus your full zodiac reading.",
  },
  "bundle-full": {
    name: "Full Bundle",
    price: 3799, // $37.99
    priceId: process.env.STRIPE_PRICE_BUNDLE_FULL || "",
    features: ["palmReading", "birthChart", "compatibilityTest"],
    description: "Complete cosmic package with all reports included.",
  },
};

export async function POST(request: NextRequest) {
  try {
    const { bundleId, userId, email, flow } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured - skipping checkout");
      return NextResponse.json({ skip: true, message: "Stripe not configured" });
    }

    const bundle = BUNDLE_CONFIG[bundleId];
    if (!bundle) {
      return NextResponse.json(
        { error: `Invalid bundle: ${bundleId}` },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";

    // Create one-time payment checkout session
    // Use Stripe Price ID if available, otherwise use inline price_data
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = bundle.priceId
      ? { price: bundle.priceId, quantity: 1 }
      : {
          price_data: {
            currency: "usd",
            product_data: {
              name: bundle.name,
              description: bundle.description,
            },
            unit_amount: bundle.price,
          },
          quantity: 1,
        };

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [lineItem],
      success_url: `${baseUrl}/onboarding/bundle-upsell?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/onboarding/bundle-pricing`,
      allow_promotion_codes: true,
      metadata: {
        userId: userId || "",
        bundleId,
        type: "bundle_payment",
        flow: flow || "flow-b",
        features: JSON.stringify(bundle.features),
      },
    };

    // Add customer email if valid
    if (email && email.includes("@")) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("Bundle checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
