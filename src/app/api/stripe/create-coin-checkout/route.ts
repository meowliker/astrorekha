import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Coin packages available for purchase (matching app UI)
const COIN_PACKAGES: Record<string, { coins: number; amount: number; name: string }> = {
  "coins-50": { coins: 50, amount: 499, name: "50 Coins" },      // $4.99
  "coins-150": { coins: 150, amount: 1299, name: "150 Coins" },  // $12.99
  "coins-300": { coins: 300, amount: 1999, name: "300 Coins" },  // $19.99
  "coins-500": { coins: 500, amount: 2999, name: "500 Coins" },  // $29.99
};

// Individual reports available for purchase
const REPORTS: Record<string, { amount: number; name: string; feature: string }> = {
  "report-2026": { amount: 699, name: "2026 Future Predictions", feature: "prediction2026" },
  "report-birth-chart": { amount: 699, name: "Birth Chart Report", feature: "birthChart" },
  "report-compatibility": { amount: 699, name: "Compatibility Report", feature: "compatibilityTest" },
};

export async function POST(request: NextRequest) {
  try {
    const { type, packageId, userId, email, successPath, cancelPath } = await request.json();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 500 }
      );
    }

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let metadata: Record<string, string> = {
      userId: userId || "",
    };
    // Get the base URL - use request origin as fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "https://palmcosmic-web-app.vercel.app";
    let successUrl = `${baseUrl}/dashboard?purchase_success=true`;
    let cancelUrl = `${baseUrl}/chat?cancelled=true`;

    if (type === "coins") {
      const coinPackage = COIN_PACKAGES[packageId];
      if (!coinPackage) {
        return NextResponse.json(
          { error: "Invalid coin package" },
          { status: 400 }
        );
      }

      lineItems = [{
        price_data: {
          currency: "usd",
          product_data: {
            name: coinPackage.name,
            description: `${coinPackage.coins} coins for PalmCosmic chat`,
          },
          unit_amount: coinPackage.amount,
        },
        quantity: 1,
      }];

      metadata.type = "coins";
      metadata.coins = coinPackage.coins.toString();
      successUrl = `${baseUrl}/chat?coins_purchased=${coinPackage.coins}&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${baseUrl}/chat?cancelled=true`;

    } else if (type === "report") {
      const report = REPORTS[packageId];
      if (!report) {
        return NextResponse.json(
          { error: "Invalid report" },
          { status: 400 }
        );
      }

      lineItems = [{
        price_data: {
          currency: "usd",
          product_data: {
            name: report.name,
            description: "Unlock this report permanently",
          },
          unit_amount: report.amount,
        },
        quantity: 1,
      }];

      metadata.type = "report";
      metadata.feature = report.feature;
      metadata.reportId = packageId;
      successUrl = `${baseUrl}/dashboard?report_unlocked=${report.feature}&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${baseUrl}/reports?cancelled=true`;

    } else {
      return NextResponse.json(
        { error: "Invalid purchase type" },
        { status: 400 }
      );
    }

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
      mode: "payment",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    };

    if (email && email.includes("@")) {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Coin/Report checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
