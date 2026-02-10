import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/restore-session?email=user@example.com
 *
 * Looks up a user by email in Firestore (users + user_profiles collections)
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
    const adminDb = getAdminDb();

    // 1. Look up in users collection by email
    let userId: string | null = null;
    let userData: Record<string, any> | null = null;

    const usersSnap = await adminDb
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      const doc = usersSnap.docs[0];
      userId = doc.id;
      userData = doc.data();
    }

    // 2. Look up in user_profiles collection by email
    let profileData: Record<string, any> | null = null;

    const profilesSnap = await adminDb
      .collection("user_profiles")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!profilesSnap.empty) {
      const doc = profilesSnap.docs[0];
      if (!userId) userId = doc.id;
      profileData = doc.data();
    }

    // If userId found from users but no profile yet, try direct doc lookup
    if (userId && !profileData) {
      const profileDoc = await adminDb.collection("user_profiles").doc(userId).get();
      if (profileDoc.exists) {
        profileData = profileDoc.data() || null;
      }
    }

    if (!userId && !profileData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // 3. Merge data from both collections, profile takes priority
    const merged = { ...userData, ...profileData };

    // 4. Return the session restoration data
    return NextResponse.json({
      success: true,
      userId,
      email: normalizedEmail,
      onboarding: {
        gender: merged.gender || null,
        birthMonth: merged.birthMonth || "January",
        birthDay: merged.birthDay || "1",
        birthYear: merged.birthYear || "2000",
        birthHour: merged.birthHour || "12",
        birthMinute: merged.birthMinute || "00",
        birthPeriod: merged.birthPeriod || "AM",
        birthPlace: merged.birthPlace || "",
        knowsBirthTime: merged.knowsBirthTime ?? true,
        relationshipStatus: merged.relationshipStatus || null,
        goals: merged.goals || [],
        colorPreference: merged.colorPreference || null,
        elementPreference: merged.elementPreference || null,
        sunSign: merged.sunSign || null,
        moonSign: merged.moonSign || null,
        ascendantSign: merged.ascendantSign || null,
      },
      name: merged.name || merged.displayName || "",
    });
  } catch (error: any) {
    console.error("[restore-session] Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to restore session" },
      { status: 500 }
    );
  }
}
