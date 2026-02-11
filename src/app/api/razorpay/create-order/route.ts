import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Bundle pricing configuration (INR — amount in paise)
const BUNDLE_CONFIG: Record<string, {
  name: string;
  amount: number; // in paise (₹1,163 = 116300 paise)
  features: string[];
}> = {
  "palm-reading": {
    name: "Palm Reading Report",
    amount: 116300,
    features: ["palmReading"],
  },
  "palm-birth": {
    name: "Palm + Birth Chart Report",
    amount: 157800,
    features: ["palmReading", "birthChart"],
  },
  "palm-birth-compat": {
    name: "Palm + Birth Chart + Compatibility Report",
    amount: 315800,
    features: ["palmReading", "birthChart", "compatibilityTest"],
  },
};

// Upsell pricing
const UPSELL_CONFIG: Record<string, {
  name: string;
  amount: number;
  feature: string;
}> = {
  "2026-predictions": {
    name: "2026 Future Predictions",
    amount: 58200, // ₹582 in paise (TBD — placeholder)
    feature: "prediction2026",
  },
};

// Coin packages (INR)
const COIN_PACKAGES: Record<string, { coins: number; amount: number; name: string }> = {
  "coins-50": { coins: 50, amount: 41600, name: "50 Coins" },
  "coins-150": { coins: 150, amount: 108200, name: "150 Coins" },
  "coins-300": { coins: 300, amount: 166600, name: "300 Coins" },
  "coins-500": { coins: 500, amount: 249900, name: "500 Coins" },
};

// Individual reports (INR)
const REPORTS: Record<string, { amount: number; name: string; feature: string }> = {
  "report-2026": { amount: 58200, name: "2026 Future Predictions", feature: "prediction2026" },
  "report-birth-chart": { amount: 58200, name: "Birth Chart Report", feature: "birthChart" },
  "report-compatibility": { amount: 58200, name: "Compatibility Report", feature: "compatibilityTest" },
};

export async function POST(request: NextRequest) {
  try {
    const { type, bundleId, packageId, userId, email } = await request.json();

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json(
        { error: "Razorpay not configured" },
        { status: 500 }
      );
    }

    let amount: number;
    let description: string;
    let metadata: Record<string, string> = {
      userId: userId || "",
      type: type || "",
    };

    if (type === "bundle") {
      const bundle = BUNDLE_CONFIG[bundleId];
      if (!bundle) {
        return NextResponse.json({ error: `Invalid bundle: ${bundleId}` }, { status: 400 });
      }
      amount = bundle.amount;
      description = bundle.name;
      metadata.bundleId = bundleId;
      metadata.features = JSON.stringify(bundle.features);
    } else if (type === "upsell") {
      const upsell = UPSELL_CONFIG[bundleId || packageId];
      if (!upsell) {
        return NextResponse.json({ error: "Invalid upsell" }, { status: 400 });
      }
      amount = upsell.amount;
      description = upsell.name;
      metadata.feature = upsell.feature;
    } else if (type === "coins") {
      const coinPkg = COIN_PACKAGES[packageId];
      if (!coinPkg) {
        return NextResponse.json({ error: "Invalid coin package" }, { status: 400 });
      }
      amount = coinPkg.amount;
      description = coinPkg.name;
      metadata.coins = coinPkg.coins.toString();
    } else if (type === "report") {
      const report = REPORTS[packageId];
      if (!report) {
        return NextResponse.json({ error: "Invalid report" }, { status: 400 });
      }
      amount = report.amount;
      description = report.name;
      metadata.feature = report.feature;
      metadata.reportId = packageId;
    } else {
      return NextResponse.json({ error: "Invalid purchase type" }, { status: 400 });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}_${(userId || "anon").slice(-6)}`,
      notes: metadata,
    });

    // Save payment record as "created"
    const supabase = getSupabaseAdmin();
    await supabase.from("payments").insert({
      id: `pay_${order.id}`,
      razorpay_order_id: order.id,
      user_id: userId || null,
      type,
      bundle_id: bundleId || packageId || null,
      feature: metadata.feature || null,
      coins: metadata.coins ? parseInt(metadata.coins) : null,
      customer_email: email || null,
      amount,
      currency: "INR",
      payment_status: "created",
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      description,
    });
  } catch (error: any) {
    console.error("Razorpay create order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
