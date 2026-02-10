import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { userId, subscriptionId } = await request.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 }
      );
    }

    // Resume the subscription (remove cancel_at_period_end)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    // Update Firebase
    if (userId) {
      await updateDoc(doc(db, "users", userId), {
        subscriptionCancelled: false,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Subscription resumed successfully",
    });
  } catch (error: any) {
    console.error("Resume subscription error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to resume subscription" },
      { status: 500 }
    );
  }
}
