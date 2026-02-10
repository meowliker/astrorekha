import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// Admin API for managing A/B tests

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId");

    const adminDb = getAdminDb();

    if (testId) {
      // Get specific test with detailed stats
      const testDoc = await adminDb.collection("abTests").doc(testId).get();
      
      // Get stats for both variants
      const statsA = await adminDb.collection("abTestStats").doc(`${testId}_A`).get();
      const statsB = await adminDb.collection("abTestStats").doc(`${testId}_B`).get();

      // Simplified: Skip complex queries that require indexes
      let recentEvents: any[] = [];
      let dailyBreakdown: any[] = [];
      
      try {
        // Try to get recent events (may fail if no index)
        const eventsSnapshot = await adminDb
          .collection("abTestEvents")
          .where("testId", "==", testId)
          .limit(50)
          .get();
        
        recentEvents = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        // Aggregate daily data from events
        const dailyData: Record<string, { A: any; B: any }> = {};
        eventsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!data.timestamp) return;
          const date = data.timestamp.split("T")[0];
          const variant = data.variant;

          if (!dailyData[date]) {
            dailyData[date] = {
              A: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
              B: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
            };
          }

          if (variant === "A" || variant === "B") {
            const v = variant as "A" | "B";
            if (data.eventType === "impression") {
              dailyData[date][v].impressions++;
            } else if (data.eventType === "conversion") {
              dailyData[date][v].conversions++;
              dailyData[date][v].revenue += data.metadata?.amount || 0;
            } else if (data.eventType === "bounce") {
              dailyData[date][v].bounces++;
            }
          }
        });
        
        dailyBreakdown = Object.entries(dailyData)
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date));
      } catch (eventsErr) {
        console.error("Failed to fetch events (index may be missing):", eventsErr);
      }

      const calculateRates = (statsDoc: any) => {
        const stats = statsDoc?.exists ? statsDoc.data() : {};
        const impressions = stats?.impressions || 0;
        const conversions = stats?.conversions || 0;
        const bounces = stats?.bounces || 0;
        const checkoutsStarted = stats?.checkoutsStarted || 0;
        const totalRevenue = stats?.totalRevenue || 0;

        return {
          impressions,
          conversions,
          bounces,
          checkoutsStarted,
          totalRevenue,
          conversionRate: impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : "0.00",
          bounceRate: impressions > 0 ? ((bounces / impressions) * 100).toFixed(2) : "0.00",
          checkoutRate: impressions > 0 ? ((checkoutsStarted / impressions) * 100).toFixed(2) : "0.00",
          checkoutToConversionRate: checkoutsStarted > 0 ? ((conversions / checkoutsStarted) * 100).toFixed(2) : "0.00",
          avgRevenuePerUser: conversions > 0 ? (totalRevenue / conversions).toFixed(2) : "0.00",
          avgRevenuePerImpression: impressions > 0 ? (totalRevenue / impressions).toFixed(2) : "0.00",
        };
      };

      const testData = testDoc.exists ? testDoc.data() : {
        id: testId,
        name: "Pricing Page A/B Test",
        status: "active",
        variants: {
          A: { weight: 50, page: "step-17" },
          B: { weight: 50, page: "a-step-17" },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      return NextResponse.json({
        test: { id: testId, ...testData },
        stats: {
          A: calculateRates(statsA),
          B: calculateRates(statsB),
        },
        dailyBreakdown,
        recentEvents,
      });
    }

    // Get all tests
    const testsSnapshot = await adminDb.collection("abTests").get();
    const tests = [];

    for (const doc of testsSnapshot.docs) {
      const testData = doc.data();
      
      // Get quick stats for each test
      const statsA = await adminDb.collection("abTestStats").doc(`${doc.id}_A`).get();
      const statsB = await adminDb.collection("abTestStats").doc(`${doc.id}_B`).get();

      const aData = statsA.data() || { impressions: 0, conversions: 0 };
      const bData = statsB.data() || { impressions: 0, conversions: 0 };

      tests.push({
        id: doc.id,
        ...testData,
        quickStats: {
          totalImpressions: (aData.impressions || 0) + (bData.impressions || 0),
          totalConversions: (aData.conversions || 0) + (bData.conversions || 0),
          variantAConversionRate: aData.impressions > 0 
            ? ((aData.conversions / aData.impressions) * 100).toFixed(2) 
            : "0.00",
          variantBConversionRate: bData.impressions > 0 
            ? ((bData.conversions / bData.impressions) * 100).toFixed(2) 
            : "0.00",
        },
      });
    }

    return NextResponse.json({ tests });
  } catch (error) {
    console.error("Admin A/B tests error:", error);
    return NextResponse.json(
      { error: "Failed to get A/B tests" },
      { status: 500 }
    );
  }
}

// Update test configuration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, status, variants, name, resetAnalytics } = body;

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    // Handle reset analytics request
    if (resetAnalytics) {
      // Delete all stats for this test
      await adminDb.collection("abTestStats").doc(`${testId}_A`).delete();
      await adminDb.collection("abTestStats").doc(`${testId}_B`).delete();
      
      // Delete all events for this test
      const eventsSnapshot = await adminDb
        .collection("abTestEvents")
        .where("testId", "==", testId)
        .get();
      
      const batch = adminDb.batch();
      eventsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      // Delete all assignments for this test (so users get re-assigned)
      const assignmentsSnapshot = await adminDb
        .collection("abTestAssignments")
        .where("testId", "==", testId)
        .get();
      
      const assignmentBatch = adminDb.batch();
      assignmentsSnapshot.docs.forEach((doc) => {
        assignmentBatch.delete(doc.ref);
      });
      await assignmentBatch.commit();
      
      // Update test with reset timestamp
      await adminDb.collection("abTests").doc(testId).update({
        lastResetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      return NextResponse.json({
        success: true,
        message: "Analytics reset successfully. All stats, events, and user assignments have been cleared.",
      });
    }

    // Validate weights sum to 100
    if (variants) {
      const totalWeight = Object.values(variants).reduce(
        (sum: number, v: any) => sum + (v.weight || 0),
        0
      );
      
      if (totalWeight !== 100) {
        return NextResponse.json(
          { error: "Variant weights must sum to 100" },
          { status: 400 }
        );
      }
    }

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (variants) updateData.variants = variants;
    if (status) updateData.status = status;
    if (name) updateData.name = name;

    await adminDb.collection("abTests").doc(testId).set(updateData, { merge: true });

    const updatedDoc = await adminDb.collection("abTests").doc(testId).get();

    return NextResponse.json({
      success: true,
      test: updatedDoc.data(),
    });
  } catch (error) {
    console.error("Admin A/B test update error:", error);
    return NextResponse.json(
      { error: "Failed to update A/B test" },
      { status: 500 }
    );
  }
}

// Create new test
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, name, variants } = body;

    if (!testId || !name) {
      return NextResponse.json(
        { error: "testId and name are required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // Check if test already exists
    const existingTest = await adminDb.collection("abTests").doc(testId).get();
    if (existingTest.exists) {
      return NextResponse.json(
        { error: "Test with this ID already exists" },
        { status: 400 }
      );
    }

    const testData = {
      id: testId,
      name,
      status: "active",
      variants: variants || {
        A: { weight: 50, page: "step-17" },
        B: { weight: 50, page: "a-step-17" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("abTests").doc(testId).set(testData);

    return NextResponse.json({
      success: true,
      test: testData,
    });
  } catch (error) {
    console.error("Admin A/B test create error:", error);
    return NextResponse.json(
      { error: "Failed to create A/B test" },
      { status: 500 }
    );
  }
}

// Delete test
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId");

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // Delete test document
    await adminDb.collection("abTests").doc(testId).delete();

    // Delete stats documents
    await adminDb.collection("abTestStats").doc(`${testId}_A`).delete();
    await adminDb.collection("abTestStats").doc(`${testId}_B`).delete();

    // Note: We don't delete events for historical purposes

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin A/B test delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete A/B test" },
      { status: 500 }
    );
  }
}
