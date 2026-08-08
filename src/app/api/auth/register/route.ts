import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import { reconcilePaidPaymentsForEmail } from "@/lib/payment-reconciliation";

type MigratedData = {
  coins?: number;
  unlocked_features?: unknown;
  onboarding_flow?: string | null;
  purchase_type?: string | null;
  bundle_purchased?: string | null;
  payment_status?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  payu_payment_id?: string | null;
  payu_txn_id?: string | null;
  scans_used?: number | null;
  scans_allowed?: number | null;
  birth_chart_timer_active?: boolean | null;
  birth_chart_timer_started_at?: string | null;
  whatsapp_number?: string | null;
  whatsapp_opt_in?: boolean | null;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_source?: string | null;
};

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password))
    return "Password must contain at least one special character.";
  return null;
}

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

    const passwordValidationError = validatePassword(String(password));
    if (passwordValidationError) {
      return NextResponse.json(
        { success: false, error: "auth/weak-password", message: passwordValidationError },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const normalizedAnonId = typeof anonId === "string" ? anonId.trim() : "";

    // Check if user already exists
    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("id, password_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing user:", checkError);
    }

    const canCompleteExistingAnonAccount =
      !!existing?.id &&
      !existing.password_hash &&
      !!normalizedAnonId &&
      existing.id === normalizedAnonId;

    if (existing && !canCompleteExistingAnonAccount) {
      return NextResponse.json(
        { success: false, error: "auth/email-already-in-use", message: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a unique user ID, or complete the paid anonymous account
    // that was created before checkout finished.
    const uid = canCompleteExistingAnonAccount ? existing.id : crypto.randomUUID();
    const now = new Date().toISOString();

    // If there's an anonymous user, migrate their data
    let migratedData: MigratedData = {};

    if (normalizedAnonId) {
      const { data: anonUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", normalizedAnonId)
        .maybeSingle();

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
          payu_payment_id: anonUser.payu_payment_id,
          payu_txn_id: anonUser.payu_txn_id,
          scans_used: anonUser.scans_used,
          scans_allowed: anonUser.scans_allowed,
          birth_chart_timer_active: anonUser.birth_chart_timer_active,
          birth_chart_timer_started_at: anonUser.birth_chart_timer_started_at,
          whatsapp_number: anonUser.whatsapp_number,
          whatsapp_opt_in: anonUser.whatsapp_opt_in,
          whatsapp_opt_in_at: anonUser.whatsapp_opt_in_at,
          whatsapp_opt_in_source: anonUser.whatsapp_opt_in_source,
        };
      }

      // Migrate user_profiles
      const { data: anonProfile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", normalizedAnonId)
        .single();

      if (anonProfile) {
        await supabase
          .from("user_profiles")
          .upsert({ ...anonProfile, id: uid, email: normalizedEmail, updated_at: now }, { onConflict: "id" });
      }
    }

    // Create user record
    const userData: Record<string, unknown> = {
      id: uid,
      email: normalizedEmail,
      password_hash: passwordHash,
      updated_at: now,
      ...migratedData,
    };

    if (!canCompleteExistingAnonAccount) {
      userData.created_at = now;
    }

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

    // Re-link and reconcile any successful payments for this email.
    // This recovers users who paid but dropped before finishing registration.
    try {
      await reconcilePaidPaymentsForEmail({
        supabase,
        userId: uid,
        email: normalizedEmail,
      });
    } catch (reconcileError) {
      console.error("Payment reconciliation error during register:", reconcileError);
    }

    // Migrate related tables in background (non-blocking for faster registration)
    if (normalizedAnonId && normalizedAnonId !== uid) {
      (async () => {
        try {
          await Promise.all([
            supabase.from("payments").update({ user_id: uid }).eq("user_id", normalizedAnonId),
            supabase.from("palm_readings").update({ id: uid }).eq("id", normalizedAnonId),
            supabase.from("daily_insights").update({ id: uid }).eq("id", normalizedAnonId),
            supabase.from("soulmate_sketches").update({ user_id: uid }).eq("user_id", normalizedAnonId),
          ]);

          // Migrate chat history from anon id -> registered uid.
          // chat_messages schema uses `id` as the user key.
          const { data: anonChat } = await supabase
            .from("chat_messages")
            .select("messages, created_at, updated_at")
            .eq("id", normalizedAnonId)
            .maybeSingle();

          if (anonChat?.messages?.length) {
            const { data: existingUidChat } = await supabase
              .from("chat_messages")
              .select("messages, created_at, updated_at")
              .eq("id", uid)
              .maybeSingle();

            const mergedMessages = Array.isArray(existingUidChat?.messages)
              ? [...existingUidChat.messages, ...anonChat.messages]
              : anonChat.messages;

            await supabase.from("chat_messages").upsert(
              {
                id: uid,
                messages: mergedMessages,
                created_at: existingUidChat?.created_at || anonChat.created_at || now,
                updated_at: now,
              },
              { onConflict: "id" }
            );

            await supabase.from("chat_messages").delete().eq("id", normalizedAnonId);
          }

          await supabase.from("user_profiles").delete().eq("id", normalizedAnonId);
          await supabase.from("users").delete().eq("id", normalizedAnonId);
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
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to register";
    console.error("Register error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
