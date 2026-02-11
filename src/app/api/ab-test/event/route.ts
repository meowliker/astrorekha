import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Create event record
    await supabase.from("ab_test_events").insert({
      test_id: testId,
      variant,
      event_type: eventType,
      visitor_id: visitorId || null,
      user_id: userId || null,
      metadata: metadata || {},
      created_at: now,
    });

    // Update aggregated stats
    const statsId = `${testId}_${variant}`;
    const { data: currentStats } = await supabase.from("ab_test_stats").select("*").eq("id", statsId).single();

    if (currentStats) {
      const updates: any = { updated_at: now };

      if (eventType === "impression") {
        updates.impressions = (currentStats.impressions || 0) + 1;
      } else if (eventType === "conversion") {
        updates.conversions = (currentStats.conversions || 0) + 1;
        if (metadata?.amount) {
          updates.total_revenue = (currentStats.total_revenue || 0) + metadata.amount;
        }
      } else if (eventType === "bounce") {
        updates.bounces = (currentStats.bounces || 0) + 1;
      } else if (eventType === "checkout_started") {
        updates.checkouts_started = (currentStats.checkouts_started || 0) + 1;
      }

      await supabase.from("ab_test_stats").update(updates).eq("id", statsId);
    } else {
      await supabase.from("ab_test_stats").insert({
        id: statsId,
        test_id: testId,
        variant,
        impressions: eventType === "impression" ? 1 : 0,
        conversions: eventType === "conversion" ? 1 : 0,
        bounces: eventType === "bounce" ? 1 : 0,
        checkouts_started: eventType === "checkout_started" ? 1 : 0,
        total_revenue: eventType === "conversion" && metadata?.amount ? metadata.amount : 0,
        created_at: now,
        updated_at: now,
      });
    }

    return NextResponse.json({ success: true });
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

    const supabase = getSupabaseAdmin();

    const { data: statsA } = await supabase.from("ab_test_stats").select("*").eq("id", `${testId}_A`).single();
    const { data: statsB } = await supabase.from("ab_test_stats").select("*").eq("id", `${testId}_B`).single();

    const defaultStats = { impressions: 0, conversions: 0, bounces: 0, checkouts_started: 0, total_revenue: 0 };
    const variantA = statsA || defaultStats;
    const variantB = statsB || defaultStats;

    const calculateRates = (stats: any) => {
      const impressions = stats.impressions || 0;
      const conversions = stats.conversions || 0;
      const bounces = stats.bounces || 0;
      const checkoutsStarted = stats.checkouts_started || 0;

      return {
        ...stats,
        conversionRate: impressions > 0 ? ((conversions / impressions) * 100).toFixed(2) : "0.00",
        bounceRate: impressions > 0 ? ((bounces / impressions) * 100).toFixed(2) : "0.00",
        checkoutRate: impressions > 0 ? ((checkoutsStarted / impressions) * 100).toFixed(2) : "0.00",
        checkoutToConversionRate: checkoutsStarted > 0 ? ((conversions / checkoutsStarted) * 100).toFixed(2) : "0.00",
        avgRevenuePerUser: conversions > 0 ? ((stats.total_revenue || 0) / conversions).toFixed(2) : "0.00",
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
