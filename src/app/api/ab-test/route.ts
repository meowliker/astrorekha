import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_LAYOUT_B_CONFIG, normalizeLayoutBConfig } from "@/lib/layout-b-funnel";

// A/B Test configuration API
// Handles getting assigned variant for a user and managing test configs
const SETTINGS_KEY = "funnel_layout_b_config";

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

  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: userId,
    ab_variant: variant,
    updated_at: nowIso,
  };

  if (isOnboardingLayoutTest) {
    payload.onboarding_flow = "flow-b";
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

    const defaultTest = {
      id: testId,
      name: isOnboardingLayoutTest ? "Onboarding Layout A/B (QA)" : "Pricing Page A/B Test",
      status: "active",
      variants: isOnboardingLayoutTest
        ? {
            A: { weight: 50, page: "bundle-pricing" },
            B: { weight: 50, page: "bundle-pricing-b" },
          }
        : {
            A: { weight: 50, page: "step-17" },
            B: { weight: 50, page: "a-step-17" },
          },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const pageForVariant = (variant: string, test: any): string => {
      const configured = test?.variants?.[variant]?.page;
      if (configured && typeof configured === "string") {
        return configured;
      }
      if (isOnboardingLayoutTest) {
        return variant === "A" ? "bundle-pricing" : "bundle-pricing-b";
      }
      return variant === "A" ? "step-17" : "a-step-17";
    };

    // Get test configuration
    const { data: testData } = await supabase.from("ab_tests").select("*").eq("id", testId).single();
    
    if (!testData) {
      // Create default test if it doesn't exist
      await supabase.from("ab_tests").insert(defaultTest);
      
      const variant = Math.random() < 0.5 ? "A" : "B";
      
      return NextResponse.json({
        testId,
        variant,
        page: pageForVariant(variant, defaultTest),
        test: defaultTest,
      });
    }

    // Check if test is active
    if (testData.status !== "active") {
      return NextResponse.json({
        testId,
        variant: "A",
        page: pageForVariant("A", testData),
        test: testData,
        message: "Test is not active, defaulting to variant A",
      });
    }

    // Check if visitor already has an assigned variant
    if (visitorId) {
      const { data: assignment } = await supabase
        .from("ab_test_assignments")
        .select("variant")
        .eq("id", `${testId}_${visitorId}`)
        .single();
      
      if (assignment) {
        await persistUserFlowVariant({
          supabase,
          userId: userIdFromQuery || visitorId,
          variant: assignment.variant,
          isOnboardingLayoutTest,
        });

        return NextResponse.json({
          testId,
          variant: assignment.variant,
          page: pageForVariant(assignment.variant, testData),
          test: testData,
          cached: true,
        });
      }
    }

    // Assign variant based on weights
    const variants = testData.variants || { A: { weight: 50 }, B: { weight: 50 } };
    const totalWeight = Object.values(variants).reduce(
      (sum: number, v: any) => sum + (v.weight || 0),
      0
    );
    
    let random = Math.random() * totalWeight;
    let assignedVariant = "A";
    
    for (const [key, value] of Object.entries(variants)) {
      random -= (value as any).weight || 0;
      if (random <= 0) {
        assignedVariant = key;
        break;
      }
    }

    // Save assignment if visitor ID provided
    if (visitorId) {
      await supabase.from("ab_test_assignments").upsert({
        id: `${testId}_${visitorId}`,
        test_id: testId,
        visitor_id: visitorId,
        variant: assignedVariant,
        assigned_at: new Date().toISOString(),
      }, { onConflict: "id" });
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
      variant: "A",
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
    console.error("A/B test update error:", error);
    return NextResponse.json(
      { error: "Failed to update A/B test" },
      { status: 500 }
    );
  }
}
