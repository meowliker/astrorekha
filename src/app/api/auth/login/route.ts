
import { getErrorMessage } from "@/lib/error-message";
import { setReportSession } from "@/lib/report-session";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import bcrypt from "bcryptjs";
import { attemptIpHash, freshGrant, hashSecret, normalizePurchaseCode, sameOrigin, setPasswordGrant } from "@/lib/purchase-access/security";

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
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (userError) return NextResponse.json({ error: "auth/unavailable", message: "Sign-in is temporarily unavailable. Please retry." }, { status: 503 });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "auth/user-not-found", message: "No account found with this email" },
        { status: 404 }
      );
    }

    // A confirmation code is entered in the existing password field. Ordinary
    // passwords retain priority and never consume an access code.
    const isValid = user.password_hash && typeof password === "string"
      ? await bcrypt.compare(password, user.password_hash) : false;
    if (!isValid) {
      const code = normalizePurchaseCode(password);
      if (/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
        if (!sameOrigin(request)) return NextResponse.json({error:"Invalid origin"},{status:403});
        const grant = freshGrant();
        const result = await supabase.rpc("consume_purchase_access_code", {
          p_email: normalizedEmail, p_code_hash: hashSecret(code),
          p_ip_hash: attemptIpHash(request), p_grant_hash: hashSecret(grant),
        });
        if (result.error) return NextResponse.json({error:"auth/unavailable",message:"Sign-in is temporarily unavailable. Please retry."},{status:503});
        if (result.data?.error === "rate_limited") return NextResponse.json({error:"auth/rate-limited",message:"Too many code attempts. Please wait 15 minutes."},{status:429,headers:{"Retry-After":"900"}});
        if (result.data?.userId === user.id) {
          return setPasswordGrant(setReportSession(NextResponse.json({success:true,requiresPasswordSetup:true},{headers:{"Cache-Control":"private, no-store"}}),user.id),grant);
        }
        return NextResponse.json({error:"auth/invalid-code",message:"Incorrect password or access code. A confirmation code works only once; use Sign in with a code if it was already used."},{status:401});
      }
      if (!user.password_hash) return NextResponse.json({success:false,error:"auth/no-password",message:"Use your confirmation code in the password field, or request a fresh sign-in code."},{status:400});
      return NextResponse.json({success:false,error:"auth/wrong-password",message:"Incorrect password or access code."},{status:401});
    }

    // Update last login
    await supabase
      .from("users")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", user.id);

    return setReportSession(NextResponse.json({
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
    }), user.id);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || "Failed to login" },
      { status: 500 }
    );
  }
}
