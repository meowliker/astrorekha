import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Default pricing configuration
const DEFAULT_PRICING = {
  bundles: [
    {
      id: "palm-reading",
      name: "Palm Reading",
      price: 559,
      originalPrice: 699,
      discount: "20% OFF",
      description: "Personalized palm reading report delivered instantly.",
      features: ["palmReading"],
      featureList: [
        "Complete palm line analysis",
        "Life, heart, head line insights",
        "Personality traits revealed",
      ],
      popular: false,
      limitedOffer: false,
      active: true,
    },
    {
      id: "palm-birth",
      name: "Palm + Birth Chart",
      price: 839,
      originalPrice: 1199,
      discount: "30% OFF",
      description: "Deep palm insights plus your full zodiac reading.",
      features: ["palmReading", "birthChart"],
      featureList: [
        "Everything in Palm Reading",
        "Complete birth chart analysis",
        "Planetary positions & houses",
      ],
      popular: true,
      limitedOffer: false,
      active: true,
    },
    {
      id: "palm-birth-compat",
      name: "Palm + Birth Chart + Compatibility Report",
      price: 1599,
      originalPrice: 3199,
      discount: "50% OFF",
      description: "Complete cosmic package with all reports included.",
      features: ["palmReading", "birthChart", "compatibilityTest"],
      featureList: [
        "Everything in Palm + Birth Chart",
        "Full compatibility analysis",
        "Partner matching report",
      ],
      popular: false,
      limitedOffer: true,
      active: true,
    },
  ],
  upsells: [
    {
      id: "2026-predictions",
      name: "2026 Future Predictions",
      price: 499,
      originalPrice: 999,
      discount: "50% OFF",
      description: "Detailed predictions for your 2026 journey.",
      feature: "prediction2026",
      active: true,
    },
  ],
  reports: [
    {
      id: "report-2026",
      name: "2026 Future Predictions",
      price: 582,
      originalPrice: 999,
      feature: "prediction2026",
      active: true,
    },
    {
      id: "report-birth-chart",
      name: "Birth Chart Report",
      price: 582,
      originalPrice: 999,
      feature: "birthChart",
      active: true,
    },
    {
      id: "report-compatibility",
      name: "Compatibility Report",
      price: 582,
      originalPrice: 999,
      feature: "compatibilityTest",
      active: true,
    },
  ],
  coinPackages: [
    { id: "coins-50", coins: 50, price: 416, originalPrice: 500, active: true },
    { id: "coins-150", coins: 150, price: 1082, originalPrice: 1500, active: true },
    { id: "coins-300", coins: 300, price: 1666, originalPrice: 2500, active: true },
    { id: "coins-500", coins: 500, price: 2499, originalPrice: 3500, active: true },
  ],
};

// GET - Fetch current pricing
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "pricing")
      .single();

    if (error || !data) {
      // Return default pricing if not set
      return NextResponse.json({ success: true, pricing: DEFAULT_PRICING });
    }

    return NextResponse.json({ success: true, pricing: data.value });
  } catch (error: any) {
    console.error("Error fetching pricing:", error);
    // Return default pricing on error
    return NextResponse.json({ success: true, pricing: DEFAULT_PRICING });
  }
}

// POST - Update pricing
export async function POST(request: NextRequest) {
  try {
    const { pricing } = await request.json();

    if (!pricing) {
      return NextResponse.json(
        { success: false, error: "Pricing data required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("settings")
      .upsert(
        {
          key: "pricing",
          value: pricing,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      console.error("Error saving pricing:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save pricing" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating pricing:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update pricing" },
      { status: 500 }
    );
  }
}
