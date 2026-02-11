import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const email = searchParams.get("email");

    if (!userId && !email) {
      return NextResponse.json(
        { error: "User ID or email is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    let userData: any = null;

    if (userId) {
      const { data } = await supabase.from("users").select("*").eq("id", userId).single();
      if (data) userData = data;
    }

    if (!userData && email) {
      const { data } = await supabase.from("users").select("*").eq("email", email.toLowerCase()).limit(1).single();
      if (data) userData = data;
    }

    if (!userData) {
      return NextResponse.json({
        trialCompleted: false,
        hasSubscription: false,
        subscriptionStatus: null,
      });
    }

    return NextResponse.json({
      trialCompleted: userData.trial_completed || false,
      trialEndedAt: userData.trial_ended_at || null,
      hasSubscription: !!userData.subscription_plan,
      subscriptionStatus: userData.subscription_status || null,
      subscriptionCancelled: userData.subscription_cancelled || false,
      paymentStatus: userData.payment_status || null,
    });
  } catch (error: any) {
    console.error("Check trial status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check trial status" },
      { status: 500 }
    );
  }
}
