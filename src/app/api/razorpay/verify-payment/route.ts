import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Bundle feature mapping
const BUNDLE_FEATURES: Record<string, string[]> = {
  "palm-reading": ["palmReading"],
  "palm-birth": ["palmReading", "birthChart"],
  "palm-birth-compat": ["palmReading", "birthChart", "compatibilityTest"],
};

export async function POST(request: NextRequest) {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      userId,
      bundleId,
      type,
      feature,
      coins,
    } = await request.json();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: "Missing payment details" },
        { status: 400 }
      );
    }

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Razorpay signature mismatch");
      return NextResponse.json(
        { success: false, error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Update payment record
    await supabase
      .from("payments")
      .update({
        razorpay_payment_id,
        razorpay_signature,
        payment_status: "paid",
        fulfilled_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", razorpay_order_id);

    // Fulfill the purchase — unlock features for user
    if (userId) {
      const { data: existingUser } = await supabase
        .from("users")
        .select("unlocked_features, coins")
        .eq("id", userId)
        .single();

      const currentFeatures = existingUser?.unlocked_features || {
        palmReading: false,
        prediction2026: false,
        birthChart: false,
        compatibilityTest: false,
      };
      const currentCoins = existingUser?.coins || 0;

      let updatedFeatures = { ...currentFeatures };
      let updatedCoins = currentCoins;

      if (type === "bundle" && bundleId) {
        // Unlock bundle features
        const featuresToUnlock = BUNDLE_FEATURES[bundleId] || [];
        for (const f of featuresToUnlock) {
          updatedFeatures[f] = true;
        }
        // Give 15 starter coins with every bundle purchase
        updatedCoins += 15;
      } else if (type === "upsell" && feature) {
        // Unlock single feature (upsell)
        updatedFeatures[feature] = true;
      } else if (type === "report" && feature) {
        // Unlock single report feature
        updatedFeatures[feature] = true;
      } else if (type === "coins" && coins) {
        // Add coins
        updatedCoins += parseInt(coins);
      }

      await supabase
        .from("users")
        .upsert(
          {
            id: userId,
            unlocked_features: updatedFeatures,
            coins: updatedCoins,
            purchase_type: type === "bundle" ? "one-time" : type,
            bundle_purchased: bundleId || null,
            payment_status: "paid",
            razorpay_payment_id,
            razorpay_order_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Razorpay verify error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
