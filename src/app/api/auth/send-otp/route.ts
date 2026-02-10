import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import nodemailer from "nodemailer";

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create email transporter
function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // App password for Gmail
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    // Check if user exists in Firestore (preferred)
    const querySnapshot = await adminDb
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    let userId: string | null = querySnapshot.empty ? null : querySnapshot.docs[0]!.id;

    // Fallback: user exists in Firebase Auth but Firestore doc missing (common prod issue)
    if (!userId) {
      try {
        const authUser = await adminAuth.getUserByEmail(normalizedEmail);
        userId = authUser.uid;

        const existing = await adminDb.collection("users").doc(userId).get();
        if (!existing.exists) {
          await adminDb.collection("users").doc(userId).set(
            {
              email: normalizedEmail,
              subscriptionPlan: null,
              subscriptionStatus: "none",
              coins: 0,
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } catch {
        // ignore; will return USER_NOT_FOUND below
      }
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "USER_NOT_FOUND", message: "No account found with this email" },
        { status: 404 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in Firebase
    await adminDb.collection("otp_codes").doc(normalizedEmail).set({
      otp,
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      verified: false,
    });

    // Send email with OTP
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      const transporter = createTransporter();
      
      await transporter.sendMail({
        from: `"PalmCosmic" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Your PalmCosmic Verification Code",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body bgcolor="#0f0a1a" style="margin: 0; padding: 0; background: linear-gradient(180deg, #0f0a1a 0%, #1a0f2e 50%, #0f0a1a 100%); background-color: #0f0a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#0f0a1a" style="background: linear-gradient(180deg, #0f0a1a 0%, #1a0f2e 50%, #0f0a1a 100%); background-color: #0f0a1a;">
              <tr>
                <td align="center" valign="top" style="padding: 40px 20px;">
                  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 480px;">
                    <!-- Header -->
                    <tr>
                      <td align="center" style="padding-bottom: 32px;">
                        <table border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center">
                              <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-weight: 600;">✨ PalmCosmic</h1>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-top: 8px;">
                              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">Your Cosmic Journey Awaits</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Main Card -->
                    <tr>
                      <td bgcolor="#1a1525" style="background-color: #1a1525; border-radius: 16px; padding: 32px; border: 1px solid #2d2640;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center">
                              <h2 style="color: #c4b5fd; font-size: 18px; margin: 0 0 8px 0; font-weight: 500;">Your Verification Code</h2>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-bottom: 24px;">
                              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                                Enter this code to sign in to your PalmCosmic account
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding: 16px 0 24px 0;">
                              <table border="0" cellpadding="0" cellspacing="0" bgcolor="#251d35" style="background-color: #251d35; border: 2px solid #A855F7; border-radius: 12px;">
                                <tr>
                                  <td align="center" style="padding: 20px 32px;">
                                    <span style="font-size: 32px; font-weight: bold; color: #A855F7; letter-spacing: 6px; font-family: 'Courier New', monospace;">${otp}</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td align="center">
                              <p style="color: #6B7280; font-size: 12px; margin: 0; line-height: 1.5;">
                                This code expires in 10 minutes.<br>If you didn't request this code, please ignore this email.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td align="center" style="padding-top: 32px;">
                        <p style="color: #4B5563; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} PalmCosmic. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });
    } else {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { success: false, error: "EMAIL_NOT_CONFIGURED", message: "Email sending is not configured" },
          { status: 500 }
        );
      }

      console.log(`OTP for ${normalizedEmail}: ${otp}`);
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      userId,
    });
  } catch (error: any) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to send OTP" },
      { status: 500 }
    );
  }
}
