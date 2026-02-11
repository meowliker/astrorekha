import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Promo code is required" },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();
    const supabase = getSupabaseAdmin();

    // Try exact match, then uppercase, then lowercase
    let promoData: any = null;
    let foundCode = "";

    for (const variant of [trimmedCode, trimmedCode.toUpperCase(), trimmedCode.toLowerCase()]) {
      const { data } = await supabase.from("promo_codes").select("*").eq("id", variant).single();
      if (data) {
        promoData = data;
        foundCode = variant;
        break;
      }
    }

    if (!promoData) {
      return NextResponse.json(
        { success: false, error: "Invalid promo code" },
        { status: 404 }
      );
    }

    // Check if code is active
    if (!promoData.active) {
      return NextResponse.json(
        { success: false, error: "This promo code is no longer active" },
        { status: 400 }
      );
    }

    // Check if code has expired
    if (promoData.expires_at && new Date(promoData.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: "This promo code has expired" },
        { status: 400 }
      );
    }

    // Check usage limit
    if (promoData.max_uses && promoData.used_count >= promoData.max_uses) {
      return NextResponse.json(
        { success: false, error: "This promo code has reached its usage limit" },
        { status: 400 }
      );
    }

    // Increment usage count
    await supabase.from("promo_codes").update({
      used_count: (promoData.used_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq("id", foundCode);

    return NextResponse.json({
      success: true,
      data: {
        code: foundCode,
        discount: promoData.discount || 100,
        type: promoData.type || "percent",
        coins: promoData.coins || 100,
        plan: promoData.plan || "yearly",
        unlockAll: promoData.unlock_all !== false,
      },
    });
  } catch (error: any) {
    console.error("Promo validation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
