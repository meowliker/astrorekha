import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/restore-session?email=user@example.com
 *
 * Looks up a user by email in Supabase (users + user_profiles tables)
 * and returns their onboarding data so the session can be restored on a
 * different browser/device (e.g. from an abandoned checkout email link).
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "email parameter is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabaseAdmin();

    // 1. Look up in users table by email
    let userId: string | null = null;
    let userData: Record<string, any> | null = null;

    const { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (userRow) {
      userId = userRow.id;
      userData = userRow;
    }

    // 2. Look up in user_profiles table by email
    let profileData: Record<string, any> | null = null;

    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (profileRow) {
      if (!userId) userId = profileRow.id;
      profileData = profileRow;
    }

    // If userId found from users but no profile yet, try direct id lookup
    if (userId && !profileData) {
      const { data: profileById } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (profileById) {
        profileData = profileById;
      }
    }

    if (!userId && !profileData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 3. Return the session restoration data
    return NextResponse.json({
      success: true,
      userId,
      email: normalizedEmail,
      onboarding: {
        gender: profileData?.gender || null,
        birthMonth: profileData?.birth_month || "January",
        birthDay: profileData?.birth_day || "1",
        birthYear: profileData?.birth_year || "2000",
        birthHour: profileData?.birth_hour || "12",
        birthMinute: profileData?.birth_minute || "00",
        birthPeriod: profileData?.birth_period || "AM",
        birthPlace: profileData?.birth_place || "",
        knowsBirthTime: profileData?.knows_birth_time ?? true,
        relationshipStatus: profileData?.relationship_status || null,
        goals: profileData?.goals || [],
        colorPreference: profileData?.color_preference || null,
        elementPreference: profileData?.element_preference || null,
        sunSign: profileData?.sun_sign || null,
        moonSign: profileData?.moon_sign || null,
        ascendantSign: profileData?.ascendant_sign || null,
      },
      name: userData?.name || "",
    });
  } catch (error: any) {
    console.error("[restore-session] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to restore session" },
      { status: 500 }
    );
  }
}
