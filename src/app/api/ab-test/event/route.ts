import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// Track A/B test events (impressions, conversions, bounces)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, variant, eventType, visitorId, userId, metadata } = body;

    if (!testId || !variant || !eventType) {
      return NextResponse.json(
        { error: "testId, variant, and eventType are required" },
        { status: 400 }
      );
    }

    const validEventTypes = ["impression", "conversion", "bounce", "checkout_started"];
    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${validEventTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // Create event document
    const eventData = {
      testId,
      variant,
      eventType,
      visitorId: visitorId || null,
      userId: userId || null,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await adminDb.collection("abTestEvents").add(eventData);

    // Update aggregated stats for the test
    const statsRef = adminDb.collection("abTestStats").doc(`${testId}_${variant}`);
    const statsDoc = await statsRef.get();

    if (statsDoc.exists) {
      const currentStats = statsDoc.data() || {};
      const updates: any = {
        updatedAt: new Date().toISOString(),
      };

      if (eventType === "impression") {
        updates.impressions = (currentStats.impressions || 0) + 1;
      } else if (eventType === "conversion") {
        updates.conversions = (currentStats.conversions || 0) + 1;
        if (metadata?.amount) {
          updates.totalRevenue = (currentStats.totalRevenue || 0) + metadata.amount;
        }
      } else if (eventType === "bounce") {
        updates.bounces = (currentStats.bounces || 0) + 1;
      } else if (eventType === "checkout_started") {
        updates.checkoutsStarted = (currentStats.checkoutsStarted || 0) + 1;
      }

      await statsRef.set(updates, { merge: true });
    } else {
      // Create new stats document
      const newStats: any = {
        testId,
        variant,
        impressions: eventType === "impression" ? 1 : 0,
        conversions: eventType === "conversion" ? 1 : 0,
        bounces: eventType === "bounce" ? 1 : 0,
        checkoutsStarted: eventType === "checkout_started" ? 1 : 0,
        totalRevenue: eventType === "conversion" && metadata?.amount ? metadata.amount : 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await statsRef.set(newStats);
    }

    return NextResponse.json({ success: true, eventId: eventData.timestamp });
  } catch (error) {
    console.error("A/B test event tracking error:", error);
    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 }
    );
  }
}

// Get aggregated stats for a test
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId") || "pricing-test-1";

    const adminDb = getAdminDb();

    // Get stats for both variants
    const statsA = await adminDb.collection("abTestStats").doc(`${testId}_A`).get();
    const statsB = await adminDb.collection("abTestStats").doc(`${testId}_B`).get();

    const variantA = statsA.exists ? statsA.data() : {
      impressions: 0,
      conversions: 0,
      bounces: 0,
      checkoutsStarted: 0,
      totalRevenue: 0,
    };

    const variantB = statsB.exists ? statsB.data() : {
      impressions: 0,
      conversions: 0,
      bounces: 0,
      checkoutsStarted: 0,
      totalRevenue: 0,
    };

    // Calculate rates
    const calculateRates = (stats: any) => {
      const impressions = stats.impressions || 0;
      const conversions = stats.conversions || 0;
      const bounces = stats.bounces || 0;
      const checkoutsStarted = stats.checkoutsStarted || 0;

      return {
        ...stats,
        conversionRate: impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : "0.00",
        bounceRate: impressions > 0 ? ((bounces / impressions) * 100).toFixed(2) : "0.00",
        checkoutRate: impressions > 0 ? ((checkoutsStarted / impressions) * 100).toFixed(2) : "0.00",
        checkoutToConversionRate: checkoutsStarted > 0 ? ((conversions / checkoutsStarted) * 100).toFixed(2) : "0.00",
        avgRevenuePerUser: conversions > 0 ? ((stats.totalRevenue || 0) / conversions).toFixed(2) : "0.00",
      };
    };

    return NextResponse.json({
      testId,
      variantA: calculateRates(variantA),
      variantB: calculateRates(variantB),
    });
  } catch (error) {
    console.error("A/B test stats error:", error);
    return NextResponse.json(
      { error: "Failed to get A/B test stats" },
      { status: 500 }
    );
  }
}
