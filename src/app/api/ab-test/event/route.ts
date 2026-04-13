import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

// Track A/B test events (impressions, conversions, bounces)
const SETTINGS_KEY = "funnel_layout_b_config";

async function resolveDefaultTestId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  return normalizeLayoutBConfig(data?.value).testId || DEFAULT_LAYOUT_B_CONFIG.testId;
}

async function ensureTestRowExists(supabase: ReturnType<typeof getSupabaseAdmin>, testId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("ab_tests").upsert(
    {
      id: testId,
      name: "Onboarding Layout A/B (QA)",
      status: "active",
      traffic_split: 0.5,
      updated_at: now,
      created_at: now,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[ab-test/event] failed to ensure test row", { testId, error });
  }
}

function isRetryableSchemaError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function isForeignKeyError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "23503" || message.includes("foreign key");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { testId, variant, eventType, visitorId, userId, metadata } = body;

    const supabase = getSupabaseAdmin();
    if (!testId) {
      testId = await resolveDefaultTestId(supabase);
    }

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

    const now = new Date().toISOString();

    // Create event record. Different environments may have either
    // `metadata` or `event_data` column; try both for compatibility.
    const baseEventRow = {
      test_id: testId,
      variant,
      event_type: eventType,
      visitor_id: visitorId || null,
      created_at: now,
    };

    let eventInsertError: any = null;
    const metadataCandidates: Array<Record<string, unknown>> = [
      { ...baseEventRow, metadata: metadata || {} },
      { ...baseEventRow, event_data: metadata || {} },
      { ...baseEventRow, data: metadata || {} },
    ];

    const tryInsertEvent = async () => {
      eventInsertError = null;
      for (const candidate of metadataCandidates) {
        const { error } = await supabase.from("ab_test_events").insert(candidate);
        if (!error) {
          eventInsertError = null;
          return true;
        }
        eventInsertError = error;
        if (!isRetryableSchemaError(error)) {
          return false;
        }
      }
      return false;
    };

    const inserted = await tryInsertEvent();
    if (!inserted && isForeignKeyError(eventInsertError)) {
      await ensureTestRowExists(supabase, String(testId));
      const retryInserted = await tryInsertEvent();
      if (!retryInserted && eventInsertError) throw eventInsertError;
    } else if (!inserted && eventInsertError) {
      throw eventInsertError;
    }

    // Best effort stats update. Never fail event ingestion if stats write fails.
    let statsUpdated = true;
    try {
      const statsId = `${testId}_${variant}`;
      const { data: currentStats, error: currentStatsError } = await supabase
        .from("ab_test_stats")
        .select("*")
        .eq("id", statsId)
        .maybeSingle();
      if (currentStatsError) throw currentStatsError;

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

        const { error: updateError } = await supabase.from("ab_test_stats").update(updates).eq("id", statsId);
        if (updateError) throw updateError;
      } else {
        const { error: insertStatsError } = await supabase.from("ab_test_stats").insert({
          id: statsId,
          test_id: testId,
          variant,
          impressions: eventType === "impression" ? 1 : 0,
          conversions: eventType === "conversion" ? 1 : 0,
          bounces: eventType === "bounce" ? 1 : 0,
          checkouts_started: eventType === "checkout_started" ? 1 : 0,
          total_revenue: eventType === "conversion" && metadata?.amount ? metadata.amount : 0,
          updated_at: now,
        });
        if (insertStatsError) throw insertStatsError;
      }
    } catch (statsError) {
      statsUpdated = false;
      console.warn("[ab-test/event] stats update failed; event kept", {
        testId,
        variant,
        eventType,
        statsError,
      });
    }

    return NextResponse.json({ success: true, statsUpdated });
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
    const supabase = getSupabaseAdmin();
    const testId = searchParams.get("testId") || await resolveDefaultTestId(supabase);

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
