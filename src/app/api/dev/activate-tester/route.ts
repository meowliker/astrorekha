import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { password, userId } = await request.json();

    if (!process.env.DEV_TESTER_PASSWORD) {
      return NextResponse.json({ error: "DEV_TESTER_PASSWORD is not configured" }, { status: 500 });
    }

    if (!password || password !== process.env.DEV_TESTER_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const now = new Date().toISOString();

    await adminDb
      .collection("users")
      .doc(String(userId))
      .set(
        {
          isDevTester: true,
          subscriptionPlan: "yearly",
          subscriptionStatus: "active",
          coins: 999999,
          unlockedFeatures: {
            palmReading: true,
            prediction2026: true,
            birthChart: true,
            compatibilityTest: true,
          },
          updatedAt: now,
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Activate tester error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to activate tester" },
      { status: 500 }
    );
  }
}
