import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Look up user by email
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "auth/user-not-found", message: "No account found with this email" },
        { status: 404 }
      );
    }

    // Verify password
    if (!user.password_hash) {
      return NextResponse.json(
        { success: false, error: "auth/no-password", message: "This account uses OTP login. Please use the OTP option." },
        { status: 400 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "auth/wrong-password", message: "Incorrect password" },
        { status: 401 }
      );
    }

    // Update last login
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        coins: user.coins,
        onboardingFlow: user.onboarding_flow,
        purchaseType: user.purchase_type,
        bundlePurchased: user.bundle_purchased,
        unlockedFeatures: user.unlocked_features,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to login" },
      { status: 500 }
    );
  }
}
