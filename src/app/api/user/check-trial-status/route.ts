import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const email = searchParams.get("email");

    if (!userId && !email) {
      return NextResponse.json(
        { error: "User ID or email is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    let userData: any = null;

    if (userId) {
      const snap = await adminDb.collection("users").doc(userId).get();
      if (snap.exists) userData = snap.data();
    }

    if (!userData && email) {
      const qs = await adminDb
        .collection("users")
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();
      if (!qs.empty) userData = qs.docs[0].data();
    }

    if (!userData) {
      return NextResponse.json({
        trialCompleted: false,
        hasSubscription: false,
        subscriptionStatus: null,
      });
    }

    return NextResponse.json({
      trialCompleted: userData.trialCompleted || false,
      trialEndedAt: userData.trialEndedAt || null,
      hasSubscription: !!userData.subscriptionPlan,
      subscriptionStatus: userData.subscriptionStatus || null,
      subscriptionCancelled: userData.subscriptionCancelled || false,
      paymentStatus: userData.paymentStatus || null,
    });
  } catch (error: any) {
    console.error("Check trial status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check trial status" },
      { status: 500 }
    );
  }
}
