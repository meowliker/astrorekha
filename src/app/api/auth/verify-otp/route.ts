import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

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

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    // Get stored OTP
    const otpDoc = await adminDb.collection("otp_codes").doc(normalizedEmail).get();

    if (!otpDoc.exists) {
      return NextResponse.json(
        { success: false, error: "No OTP found. Please request a new code." },
        { status: 404 }
      );
    }

    const otpData: any = otpDoc.data();

    // Check if OTP is expired
    if (new Date(otpData.expiresAt) < new Date()) {
      await adminDb.collection("otp_codes").doc(normalizedEmail).delete();
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
    const querySnapshot = await adminDb
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    // Determine canonical uid (Firebase Auth uid)
    let uid: string | null = null;
    try {
      const authUser = await adminAuth.getUserByEmail(normalizedEmail);
      uid = authUser.uid;
    } catch {
      // If user exists in Firestore but not in Auth (legacy), create an Auth user.
      const created = await adminAuth.createUser({ email: normalizedEmail });
      uid = created.uid;
    }

    // Ensure there is a users/{uid} doc. If legacy doc id differs, copy/migrate.
    if (uid && uid !== userDoc.id) {
      await adminDb.collection("users").doc(uid).set(
        {
          ...userData,
          email: normalizedEmail,
          migratedFromUserId: userDoc.id,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } else if (uid) {
      await adminDb.collection("users").doc(uid).set(
        {
          email: normalizedEmail,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    const customToken = uid ? await adminAuth.createCustomToken(uid) : null;

    // Delete used OTP
    await adminDb.collection("otp_codes").doc(normalizedEmail).delete();

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
      customToken,
      user: {
        id: uid || userDoc.id,
        email: normalizedEmail,
        name: userData.name,
        subscriptionPlan: userData.subscriptionPlan,
        coins: userData.coins,
        onboardingFlow: userData.onboardingFlow,
        purchaseType: userData.purchaseType,
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
