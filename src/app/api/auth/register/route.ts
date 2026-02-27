import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { email, password, anonId } = await request.json();

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check if user already exists
    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing user:", checkError);
    }

    if (existing) {
      return NextResponse.json(
        { success: false, error: "auth/email-already-in-use", message: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a unique user ID
    const uid = crypto.randomUUID();
    const now = new Date().toISOString();

    // If there's an anonymous user, migrate their data
    let migratedData: Record<string, any> = {};

    if (anonId) {
      const { data: anonUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", anonId)
        .single();

      if (anonUser) {
        migratedData = {
          coins: anonUser.coins || 0,
          unlocked_features: anonUser.unlocked_features || {},
          onboarding_flow: anonUser.onboarding_flow,
          purchase_type: anonUser.purchase_type,
          bundle_purchased: anonUser.bundle_purchased,
          payment_status: anonUser.payment_status,
          razorpay_payment_id: anonUser.razorpay_payment_id,
          razorpay_order_id: anonUser.razorpay_order_id,
          scans_used: anonUser.scans_used,
          scans_allowed: anonUser.scans_allowed,
          birth_chart_timer_active: anonUser.birth_chart_timer_active,
          birth_chart_timer_started_at: anonUser.birth_chart_timer_started_at,
        };
      }

      // Migrate user_profiles
      const { data: anonProfile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", anonId)
        .single();

      if (anonProfile) {
        await supabase
          .from("user_profiles")
          .upsert({ ...anonProfile, id: uid, email: normalizedEmail, updated_at: now }, { onConflict: "id" });
      }
    }

    // Create user record
    const userData: Record<string, any> = {
      id: uid,
      email: normalizedEmail,
      password_hash: passwordHash,
      created_at: now,
      updated_at: now,
      ...migratedData,
    };

    // Remove null/undefined values
    Object.keys(userData).forEach(key => {
      if (userData[key] === null || userData[key] === undefined) {
        delete userData[key];
      }
    });

    const { error: insertError } = await supabase.from("users").upsert(userData, { onConflict: "id" });

    if (insertError) {
      console.error("Failed to create user:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Migrate related tables in background (non-blocking for faster registration)
    if (anonId && anonId !== uid) {
      (async () => {
        try {
          await Promise.all([
            supabase.from("payments").update({ user_id: uid }).eq("user_id", anonId),
            supabase.from("palm_readings").update({ id: uid }).eq("id", anonId),
            supabase.from("chat_messages").update({ user_id: uid }).eq("user_id", anonId),
            supabase.from("daily_insights").update({ id: uid }).eq("id", anonId),
          ]);
          await supabase.from("user_profiles").delete().eq("id", anonId);
          await supabase.from("users").delete().eq("id", anonId);
        } catch (err) {
          console.error("Background migration error:", err);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      user: {
        id: uid,
        email: normalizedEmail,
        coins: migratedData.coins || 0,
        onboardingFlow: migratedData.onboarding_flow || null,
        purchaseType: migratedData.purchase_type || null,
        bundlePurchased: migratedData.bundle_purchased || null,
        unlockedFeatures: migratedData.unlocked_features || {},
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to register" },
      { status: 500 }
    );
  }
}
