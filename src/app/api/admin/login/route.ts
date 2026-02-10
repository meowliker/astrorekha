import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { adminId, password } = await request.json();

    if (!adminId || !password) {
      return NextResponse.json(
        { error: "Admin ID and password are required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // Look up admin credentials in the 'admins' collection
    const adminDoc = await adminDb.collection("admins").doc(adminId).get();

    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const adminData = adminDoc.data();

    // Check password (stored as plain text for simplicity - you can hash it for production)
    if (adminData?.password !== password) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Generate a session token
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Store the session token in Firebase
    await adminDb.collection("admin_sessions").doc(token).set({
      adminId,
      createdAt: new Date().toISOString(),
      expiresAt: expiry,
    });

    return NextResponse.json({
      success: true,
      token,
      expiry,
      adminName: adminData?.name || adminId,
    });
  } catch (error: any) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
