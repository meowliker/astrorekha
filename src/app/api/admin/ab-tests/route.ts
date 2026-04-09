import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

// Admin API for managing A/B tests
const SETTINGS_KEY = "funnel_layout_b_config";
const DEFAULT_ONBOARDING_TEST_ID = DEFAULT_LAYOUT_B_CONFIG.testId;

async function ensureOnboardingLayoutTest(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  const config = normalizeLayoutBConfig(settingsRow?.value);
  const testId = config.testId || DEFAULT_ONBOARDING_TEST_ID;
  const variants = {
    A: { weight: config.variantAWeight, page: "bundle-pricing" },
    B: { weight: config.variantBWeight, page: "bundle-pricing-b" },
  };

  const { data: existing } = await supabase
    .from("ab_tests")
    .select("id, name, status, variants")
    .eq("id", testId)
    .maybeSingle();

  if (!existing) {
    const row = {
      id: testId,
      name: "Onboarding Layout A/B (QA)",
      status: config.enabled ? "active" : "paused",
      variants,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await supabase.from("ab_tests").upsert(row, { onConflict: "id" });
    return testId;
  }

  // Keep metadata aligned with funnel config, but do not overwrite admin
  // controls such as status or split weights on every read.
  const shouldUpdateName = existing.name !== "Onboarding Layout A/B (QA)";
  const shouldUpdateVariants = !existing.variants;

  if (shouldUpdateName || shouldUpdateVariants) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (shouldUpdateName) patch.name = "Onboarding Layout A/B (QA)";
    if (shouldUpdateVariants) patch.variants = variants;

    await supabase.from("ab_tests").update(patch).eq("id", testId);
  }

  return testId;
}

async function buildDefaultTestData(testId: string) {
  const row = {
    id: testId,
    name: "Onboarding Layout A/B (QA)",
    status: "active",
    variants: {
      A: { weight: 50, page: "bundle-pricing" },
      B: { weight: 50, page: "bundle-pricing-b" },
    },
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  return row;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId");

    const supabase = getSupabaseAdmin();
    const onboardingTestId = await ensureOnboardingLayoutTest(supabase);

    if (testId) {
      // Get specific test with detailed stats
      const { data: testData } = await supabase.from("ab_tests").select("*").eq("id", testId).single();
      
      const { data: statsA } = await supabase.from("ab_test_stats").select("*").eq("id", `${testId}_A`).single();
      const { data: statsB } = await supabase.from("ab_test_stats").select("*").eq("id", `${testId}_B`).single();

      let recentEvents: any[] = [];
      let dailyBreakdown: any[] = [];
      
      try {
        const { data: events } = await supabase
          .from("ab_test_events")
          .select("*")
          .eq("test_id", testId)
          .limit(50);
        
        recentEvents = events || [];
        
        const dailyData: Record<string, { A: any; B: any }> = {};
        (events || []).forEach((evt: any) => {
          if (!evt.created_at) return;
          const date = evt.created_at.split("T")[0];
          const variant = evt.variant;

          if (!dailyData[date]) {
            dailyData[date] = {
              A: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
              B: { impressions: 0, conversions: 0, bounces: 0, revenue: 0 },
            };
          }

          if (variant === "A" || variant === "B") {
            const v = variant as "A" | "B";
            if (evt.event_type === "impression") {
              dailyData[date][v].impressions++;
            } else if (evt.event_type === "conversion") {
              dailyData[date][v].conversions++;
              dailyData[date][v].revenue += evt.metadata?.amount || 0;
            } else if (evt.event_type === "bounce") {
              dailyData[date][v].bounces++;
            }
          }
        });
        
        dailyBreakdown = Object.entries(dailyData)
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date));
      } catch (eventsErr) {
        console.error("Failed to fetch events:", eventsErr);
      }

      const calculateRates = (stats: any) => {
        const impressions = stats?.impressions || 0;
        const conversions = stats?.conversions || 0;
        const bounces = stats?.bounces || 0;
        const checkoutsStarted = stats?.checkouts_started || 0;
        const totalRevenue = stats?.total_revenue || 0;

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

      const resolvedTestData = testData || (
        testId.startsWith("onboarding-layout")
          ? await buildDefaultTestData(testId)
          : {
              id: testId,
              name: "Pricing Page A/B Test",
              status: "active",
              variants: {
                A: { weight: 50, page: "step-17" },
                B: { weight: 50, page: "a-step-17" },
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
      );
      
      return NextResponse.json({
        test: { id: testId, ...resolvedTestData },
        stats: {
          A: calculateRates(statsA),
          B: calculateRates(statsB),
        },
        dailyBreakdown,
        recentEvents,
      });
    }

    // Get all tests
    const { data: allTests } = await supabase.from("ab_tests").select("*");
    const hydratedTests = [...(allTests || [])];
    if (!hydratedTests.some((test) => test.id === onboardingTestId)) {
      const { data: onboardingTest } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("id", onboardingTestId)
        .single();
      if (onboardingTest) hydratedTests.push(onboardingTest);
    }
    const tests = [];

    for (const test of hydratedTests) {
      const { data: sA } = await supabase.from("ab_test_stats").select("*").eq("id", `${test.id}_A`).single();
      const { data: sB } = await supabase.from("ab_test_stats").select("*").eq("id", `${test.id}_B`).single();

      const aData = sA || { impressions: 0, conversions: 0 };
      const bData = sB || { impressions: 0, conversions: 0 };

      tests.push({
        ...test,
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

    const supabase = getSupabaseAdmin();
    
    if (resetAnalytics) {
      await supabase.from("ab_test_stats").delete().eq("id", `${testId}_A`);
      await supabase.from("ab_test_stats").delete().eq("id", `${testId}_B`);
      await supabase.from("ab_test_events").delete().eq("test_id", testId);
      await supabase.from("ab_test_assignments").delete().eq("test_id", testId);
      
      await supabase.from("ab_tests").update({
        last_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", testId);
      
      return NextResponse.json({
        success: true,
        message: "Analytics reset successfully. All stats, events, and user assignments have been cleared.",
      });
    }

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
      updated_at: new Date().toISOString(),
    };

    if (variants) updateData.variants = variants;
    if (status) updateData.status = status;
    if (name) updateData.name = name;

    await supabase.from("ab_tests").upsert({ id: testId, ...updateData }, { onConflict: "id" });

    const { data: updatedTest } = await supabase.from("ab_tests").select("*").eq("id", testId).single();

    return NextResponse.json({
      success: true,
      test: updatedTest,
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

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase.from("ab_tests").select("id").eq("id", testId).single();
    if (existing) {
      return NextResponse.json(
        { error: "Test with this ID already exists" },
        { status: 400 }
      );
    }

    const isOnboardingLayoutTest = testId.startsWith("onboarding-layout");
    const testData = {
      id: testId,
      name,
      status: "active",
      variants: variants || {
        A: { weight: 50, page: isOnboardingLayoutTest ? "bundle-pricing" : "step-17" },
        B: { weight: 50, page: isOnboardingLayoutTest ? "bundle-pricing-b" : "a-step-17" },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase.from("ab_tests").insert(testData);

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

    const supabase = getSupabaseAdmin();

    await supabase.from("ab_tests").delete().eq("id", testId);
    await supabase.from("ab_test_stats").delete().eq("id", `${testId}_A`);
    await supabase.from("ab_test_stats").delete().eq("id", `${testId}_B`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin A/B test delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete A/B test" },
      { status: 500 }
    );
  }
}
