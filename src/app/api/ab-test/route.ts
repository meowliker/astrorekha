import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

// A/B Test configuration API
// Handles getting assigned variant for a user and managing test configs
const SETTINGS_KEY = "funnel_layout_b_config";
const PAYWALL_DEFAULT_PLAN_TEST_ID_PREFIX = "paywall-default-plan";
const PAYWALL_GST_TEST_ID_PREFIX = "paywall-gst-exclusive";
const PAYWALL_COSMIC_BUNDLE_TEST_ID = "paywall-cosmic-bundle-v1";
const PAYWALL_COSMIC_BUNDLE_TEST_ID_PREFIX = "paywall-cosmic-bundle";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNormalizedVariants(
  testData: any,
	  isOnboardingLayoutTest: boolean,
	  isPaywallDefaultPlanTest: boolean,
	  isPaywallGstTest: boolean
	) {
	  const defaults = isOnboardingLayoutTest
	    ? { pageA: "bundle-pricing", pageB: "bundle-pricing" }
	    : isPaywallDefaultPlanTest
	    ? { pageA: "default-839", pageB: "default-1599" }
	    : isPaywallGstTest
	    ? { pageA: "tax-inclusive", pageB: "exclusive-gst" }
	    : testData?.id?.startsWith?.(PAYWALL_COSMIC_BUNDLE_TEST_ID_PREFIX)
	    ? { pageA: "current-bundles", pageB: "cosmic-bundle" }
	    : { pageA: "step-17", pageB: "a-step-17" };

  const configA = Number(testData?.variants?.A?.weight);
  const configB = Number(testData?.variants?.B?.weight);
  let aWeight = Number.isFinite(configA) ? clampPercent(configA) : NaN;
  let bWeight = Number.isFinite(configB) ? clampPercent(configB) : NaN;

  if (!Number.isFinite(aWeight) || !Number.isFinite(bWeight) || aWeight + bWeight !== 100) {
    const rawSplit = Number(testData?.traffic_split);
    if (Number.isFinite(rawSplit)) {
      const b = rawSplit <= 1 ? rawSplit * 100 : rawSplit;
      bWeight = clampPercent(b);
      aWeight = 100 - bWeight;
    } else {
      aWeight = 50;
      bWeight = 50;
    }
  }

  return {
    A: { weight: aWeight, page: testData?.variants?.A?.page || defaults.pageA },
    B: { weight: bWeight, page: testData?.variants?.B?.page || defaults.pageB },
  };
}

function getCompletedCosmicBundleTest(testData: any = {}) {
  const now = new Date().toISOString();
  return {
    ...testData,
    id: testData?.id || PAYWALL_COSMIC_BUNDLE_TEST_ID,
    name: testData?.name || "Paywall Cosmic Bundle Test",
    status: "completed",
    traffic_split: 0,
    variants: {
      A: { weight: 100, page: "current-bundles" },
      B: { weight: 0, page: "cosmic-bundle" },
    },
    created_at: testData?.created_at || now,
    updated_at: now,
  };
}

async function completeCosmicBundleTest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  testData: any
) {
  const completedTest = getCompletedCosmicBundleTest(testData);
  const { error } = await supabase.from("ab_tests").upsert(
    {
      id: completedTest.id,
      name: completedTest.name,
      status: completedTest.status,
      traffic_split: completedTest.traffic_split,
      variants: completedTest.variants,
      created_at: completedTest.created_at,
      updated_at: completedTest.updated_at,
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[ab-test] failed to complete cosmic bundle test", { error });
  }

  return completedTest;
}

function normalizeVariant(variant: unknown, isOnboardingLayoutTest: boolean): "A" | "B" {
  if (isOnboardingLayoutTest) return "B";
  return variant === "B" ? "B" : "A";
}

function chooseWeightedVariant(variants: ReturnType<typeof getNormalizedVariants>): "A" | "B" {
  const entries = Object.entries(variants) as Array<["A" | "B", { weight: number; page: string }]>;
  const positiveEntries = entries.filter(([, value]) => value.weight > 0);

  if (positiveEntries.length === 1) {
    return positiveEntries[0][0];
  }

  const totalWeight = positiveEntries.reduce((sum, [, value]) => sum + value.weight, 0);
  if (totalWeight <= 0) return "A";

  let random = Math.random() * totalWeight;
  for (const [key, value] of positiveEntries) {
    random -= value.weight;
    if (random <= 0) return key;
  }

  return positiveEntries[positiveEntries.length - 1]?.[0] || "A";
}

async function resolveDefaultTestId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  return normalizeLayoutBConfig(data?.value).testId || DEFAULT_LAYOUT_B_CONFIG.testId;
}

async function persistUserFlowVariant(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  userId: string | null;
  variant: string;
  isOnboardingLayoutTest: boolean;
}) {
  const { supabase, userId, variant, isOnboardingLayoutTest } = params;
  if (!userId) return;
  if (!isOnboardingLayoutTest) return;

  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: userId,
    ab_variant: variant,
    updated_at: nowIso,
  };

  if (isOnboardingLayoutTest) {
    payload.onboarding_flow = variant === "B" ? "flow-b" : "flow-a";
  }

  const { error } = await supabase.from("users").upsert(payload, { onConflict: "id" });
  if (error) {
    console.error("[ab-test] failed to persist user variant", {
      userId,
      variant,
      isOnboardingLayoutTest,
      error,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTestId = searchParams.get("testId");
    const visitorId = searchParams.get("visitorId");
    const userIdFromQuery = searchParams.get("userId")?.trim() || null;

    const supabase = getSupabaseAdmin();
    const testId = requestedTestId || await resolveDefaultTestId(supabase);
	    const isOnboardingLayoutTest = testId.startsWith("onboarding-layout");
	    const isPaywallDefaultPlanTest = testId.startsWith(PAYWALL_DEFAULT_PLAN_TEST_ID_PREFIX);
	    const isPaywallGstTest = testId.startsWith(PAYWALL_GST_TEST_ID_PREFIX);
	    const isPaywallCosmicBundleTest = testId.startsWith(PAYWALL_COSMIC_BUNDLE_TEST_ID_PREFIX);

    const defaultTest = {
      id: testId,
      name: isOnboardingLayoutTest
        ? "Onboarding Layout A/B (QA)"
	        : isPaywallDefaultPlanTest
	        ? "Paywall Default Plan A/B (₹839 vs ₹1599)"
	        : isPaywallGstTest
	        ? "Paywall GST Exclusive Price Test"
	        : isPaywallCosmicBundleTest
	        ? "Paywall Cosmic Bundle Test"
	        : "Pricing Page A/B Test",
	      status: isPaywallDefaultPlanTest || isPaywallGstTest || isPaywallCosmicBundleTest ? "completed" : "active",
      traffic_split: isPaywallDefaultPlanTest || isPaywallGstTest ? 1 : isPaywallCosmicBundleTest ? 0 : 0.5,
      variants: isOnboardingLayoutTest
        ? {
            A: { weight: 0, page: "bundle-pricing" },
            B: { weight: 100, page: "bundle-pricing" },
          }
	        : isPaywallDefaultPlanTest
	        ? {
	            A: { weight: 0, page: "default-839" },
	            B: { weight: 100, page: "default-1599" },
	          }
	        : isPaywallGstTest
	        ? {
	            A: { weight: 0, page: "tax-inclusive" },
	            B: { weight: 100, page: "exclusive-gst" },
	          }
	        : isPaywallCosmicBundleTest
	        ? {
	            A: { weight: 100, page: "current-bundles" },
	            B: { weight: 0, page: "cosmic-bundle" },
	          }
	        : {
            A: { weight: 50, page: "step-17" },
            B: { weight: 50, page: "a-step-17" },
          },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const defaultTestInsertRow = {
      id: testId,
      name: defaultTest.name,
      status: defaultTest.status,
      traffic_split: defaultTest.traffic_split,
      variants: defaultTest.variants,
      created_at: defaultTest.created_at,
      updated_at: defaultTest.updated_at,
    };

    const pageForVariant = (variant: string, test: any): string => {
      if (isOnboardingLayoutTest) {
        return "bundle-pricing";
      }
	      if (isPaywallDefaultPlanTest) {
        const configured = test?.variants?.[variant]?.page;
        if (configured && typeof configured === "string") {
          return configured;
        }
	        return variant === "B" ? "default-1599" : "default-839";
	      }
	      if (isPaywallGstTest) {
	        const configured = test?.variants?.[variant]?.page;
	        if (configured && typeof configured === "string") {
	          return configured;
	        }
	        return variant === "B" ? "exclusive-gst" : "tax-inclusive";
	      }
	      if (isPaywallCosmicBundleTest) {
	        const configured = test?.variants?.[variant]?.page;
	        if (configured && typeof configured === "string") {
	          return configured;
	        }
	        return variant === "B" ? "cosmic-bundle" : "current-bundles";
	      }
      const configured = test?.variants?.[variant]?.page;
      if (configured && typeof configured === "string") {
        return configured;
      }
      return variant === "A" ? "step-17" : "a-step-17";
    };

    // Get test configuration
    const { data: testData, error: testDataError } = await supabase
      .from("ab_tests")
      .select("*")
      .eq("id", testId)
      .single();
    if (testDataError && testDataError.code !== "PGRST116") {
      console.error("[ab-test] failed to fetch test config", { testId, error: testDataError });
    }
    
    if (!testData) {
      // Create default test if it doesn't exist
      const { error: insertDefaultTestError } = await supabase.from("ab_tests").insert(defaultTestInsertRow);
      if (insertDefaultTestError) {
        console.error("[ab-test] failed to create default test", {
          testId,
          error: insertDefaultTestError,
        });
      }
      
	      const variant = isOnboardingLayoutTest || isPaywallDefaultPlanTest || isPaywallGstTest
          ? "B"
          : isPaywallCosmicBundleTest
          ? "A"
          : Math.random() < 0.5
          ? "A"
          : "B";
      
      return NextResponse.json({
        testId,
        variant,
        page: pageForVariant(variant, defaultTest),
        test: defaultTest,
      });
    }

    if (isPaywallCosmicBundleTest) {
      const completedTest = await completeCosmicBundleTest(supabase, testData);
      return NextResponse.json({
        testId,
        variant: "A",
        page: pageForVariant("A", completedTest),
        test: completedTest,
        message: "Test is completed, defaulting to winning variant A",
      });
    }

    // Check if test is active
    if (testData.status !== "active") {
      const fallbackVariant = isPaywallDefaultPlanTest || isPaywallGstTest ? "B" : normalizeVariant("A", isOnboardingLayoutTest);
      return NextResponse.json({
        testId,
        variant: fallbackVariant,
        page: pageForVariant(fallbackVariant, testData),
        test: testData,
        message: `Test is not active, defaulting to variant ${fallbackVariant}`,
      });
    }

    // Check if visitor already has an assigned variant
    if (visitorId) {
      const { data: assignment, error: assignmentLookupError } = await supabase
        .from("ab_test_assignments")
        .select("variant")
        .eq("id", `${testId}_${visitorId}`)
        .maybeSingle();
      if (assignmentLookupError && assignmentLookupError.code !== "PGRST116") {
        console.error("[ab-test] failed to read assignment", {
          testId,
          visitorId,
          error: assignmentLookupError,
        });
      }
      
      if (assignment) {
	        const variants = getNormalizedVariants(testData, isOnboardingLayoutTest, isPaywallDefaultPlanTest, isPaywallGstTest);
        const normalizedStoredVariant = normalizeVariant(assignment.variant, isOnboardingLayoutTest);
        const assignmentVariant =
          variants[normalizedStoredVariant]?.weight > 0
            ? normalizedStoredVariant
            : normalizeVariant(chooseWeightedVariant(variants), isOnboardingLayoutTest);

        if (assignmentVariant !== assignment.variant && visitorId) {
          const forcedAssignmentPayload = {
            id: `${testId}_${visitorId}`,
            test_id: testId,
            visitor_id: visitorId,
            variant: assignmentVariant,
            created_at: new Date().toISOString(),
          };
          const { error: forcedAssignmentError } = await supabase
            .from("ab_test_assignments")
            .upsert(forcedAssignmentPayload, { onConflict: "id" });
          if (forcedAssignmentError) {
            console.error("[ab-test] failed to force assignment variant", {
              testId,
              visitorId,
              variant: assignmentVariant,
              error: forcedAssignmentError,
            });
          }
        }

        await persistUserFlowVariant({
          supabase,
          userId: userIdFromQuery || visitorId,
          variant: assignmentVariant,
          isOnboardingLayoutTest,
        });

        return NextResponse.json({
          testId,
          variant: assignmentVariant,
          page: pageForVariant(assignmentVariant, testData),
          test: testData,
          cached: true,
        });
      }
    }

    // Assign variant based on weights
    let assignedVariant = normalizeVariant("A", isOnboardingLayoutTest);
    if (!isOnboardingLayoutTest) {
	      const variants = getNormalizedVariants(testData, isOnboardingLayoutTest, isPaywallDefaultPlanTest, isPaywallGstTest);
      assignedVariant = normalizeVariant(chooseWeightedVariant(variants), isOnboardingLayoutTest);
    }

    // Save assignment if visitor ID provided
    if (visitorId) {
      const assignmentPayload = {
        id: `${testId}_${visitorId}`,
        test_id: testId,
        visitor_id: visitorId,
        variant: assignedVariant,
        created_at: new Date().toISOString(),
      };
      const { error: assignmentUpsertError } = await supabase
        .from("ab_test_assignments")
        .upsert(assignmentPayload, { onConflict: "id" });
      if (assignmentUpsertError) {
        console.error("[ab-test] failed to persist assignment", {
          testId,
          visitorId,
          variant: assignedVariant,
          error: assignmentUpsertError,
        });
      }
    }

    await persistUserFlowVariant({
      supabase,
      userId: userIdFromQuery || visitorId,
      variant: assignedVariant,
      isOnboardingLayoutTest,
    });

    return NextResponse.json({
      testId,
      variant: assignedVariant,
      page: pageForVariant(assignedVariant, testData),
      test: testData,
    });
  } catch (error) {
    console.error("A/B test error:", error);
    return NextResponse.json({
      testId: DEFAULT_LAYOUT_B_CONFIG.testId,
      variant: "B",
      page: "bundle-pricing",
      error: "Failed to get A/B test assignment",
    });
  }
}

// Update test configuration (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, variants, status, name } = body;

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let nextTrafficSplit: number | null = null;
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
      const bWeight = clampPercent(Number((variants as any)?.B?.weight ?? 50));
      nextTrafficSplit = bWeight / 100;
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (nextTrafficSplit !== null) updateData.traffic_split = nextTrafficSplit;
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
    console.error("A/B test update error:", error);
    return NextResponse.json(
      { error: "Failed to update A/B test" },
      { status: 500 }
    );
  }
}
