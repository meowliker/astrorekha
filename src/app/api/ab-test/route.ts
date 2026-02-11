import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// A/B Test configuration API
// Handles getting assigned variant for a user and managing test configs

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("testId") || "pricing-test-1";
    const visitorId = searchParams.get("visitorId");

    const supabase = getSupabaseAdmin();

    // Get test configuration
    const { data: testData } = await supabase.from("ab_tests").select("*").eq("id", testId).single();
    
    if (!testData) {
      // Create default test if it doesn't exist
      const defaultTest = {
        id: testId,
        name: "Pricing Page A/B Test",
        status: "active",
        variants: {
          A: { weight: 50, page: "step-17" },
          B: { weight: 50, page: "a-step-17" },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      await supabase.from("ab_tests").insert(defaultTest);
      
      const variant = Math.random() < 0.5 ? "A" : "B";
      
      return NextResponse.json({
        testId,
        variant,
        page: variant === "A" ? "step-17" : "a-step-17",
        test: defaultTest,
      });
    }

    // Check if test is active
    if (testData.status !== "active") {
      return NextResponse.json({
        testId,
        variant: "A",
        page: "step-17",
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
        return NextResponse.json({
          testId,
          variant: assignment.variant,
          page: assignment.variant === "A" ? "step-17" : "a-step-17",
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

    return NextResponse.json({
      testId,
      variant: assignedVariant,
      page: assignedVariant === "A" ? "step-17" : "a-step-17",
      test: testData,
    });
  } catch (error) {
    console.error("A/B test error:", error);
    return NextResponse.json({
      testId: "pricing-test-1",
      variant: "A",
      page: "step-17",
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
