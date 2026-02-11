import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json();

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedOtp = typeof otp === "string" ? otp.trim() : String(otp ?? "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      return NextResponse.json(
        { success: false, error: "Email and OTP are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Get stored OTP
    const { data: otpData } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (!otpData) {
      return NextResponse.json(
        { success: false, error: "No OTP found. Please request a new code." },
        { status: 404 }
      );
    }

    // Check if OTP is expired
    if (new Date(otpData.expires_at) < new Date()) {
      await supabase.from("otp_codes").delete().eq("email", normalizedEmail);
      return NextResponse.json(
        { success: false, error: "OTP has expired. Please request a new code." },
        { status: 400 }
      );
    }

    // Verify OTP
    if (String(otpData.otp) !== normalizedOtp) {
      return NextResponse.json(
        { success: false, error: "Invalid OTP. Please try again." },
        { status: 400 }
      );
    }

    // OTP is valid - get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (!userData) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Update last login timestamp
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", userData.id);

    // Delete used OTP
    await supabase.from("otp_codes").delete().eq("email", normalizedEmail);

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
      user: {
        id: userData.id,
        email: normalizedEmail,
        name: userData.name,
        coins: userData.coins,
        onboardingFlow: userData.onboarding_flow,
        purchaseType: userData.purchase_type,
        bundlePurchased: userData.bundle_purchased,
        unlockedFeatures: userData.unlocked_features,
      },
    });
  } catch (error: any) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
