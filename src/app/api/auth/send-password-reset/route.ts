import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import nodemailer from "nodemailer";

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
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

    const adminAuth = getAdminAuth();

    // Check if user exists
    try {
      await adminAuth.getUserByEmail(normalizedEmail);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        return NextResponse.json(
          { success: false, error: "USER_NOT_FOUND", message: "No account found with this email" },
          { status: 404 }
        );
      }
      throw err;
    }

    // Generate password reset link
    const resetLink = await adminAuth.generatePasswordResetLink(normalizedEmail, {
      url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`,
    });

    // Send custom email with beautiful design
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      const transporter = createTransporter();
      
      await transporter.sendMail({
        from: `"PalmCosmic" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Reset Your PalmCosmic Password",
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
                              <h2 style="color: #c4b5fd; font-size: 18px; margin: 0 0 8px 0; font-weight: 500;">Reset Your Password</h2>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-bottom: 24px;">
                              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                                We received a request to reset your password.<br>Click the button below to create a new password.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding: 16px 0 24px 0;">
                              <table border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td align="center" bgcolor="#A855F7" style="background-color: #A855F7; border-radius: 12px;">
                                    <a href="${resetLink}" style="display: inline-block; color: #ffffff; text-decoration: none; padding: 16px 40px; font-weight: 600; font-size: 16px;">
                                      Reset Password
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td align="center">
                              <p style="color: #6B7280; font-size: 12px; margin: 0; line-height: 1.5;">
                                This link expires in 1 hour.<br>If you didn't request this, please ignore this email.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding-top: 24px; border-top: 1px solid #2d2640; margin-top: 24px;">
                              <p style="color: #6B7280; font-size: 11px; margin: 16px 0 0 0;">
                                If the button doesn't work, copy and paste this link:
                              </p>
                              <p style="color: #A855F7; font-size: 10px; margin: 8px 0 0 0; word-break: break-all;">
                                ${resetLink}
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
          { success: false, error: "EMAIL_NOT_CONFIGURED" },
          { status: 500 }
        );
      }
      console.log(`Password reset link for ${normalizedEmail}: ${resetLink}`);
    }

    return NextResponse.json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error: any) {
    console.error("Send password reset error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to send password reset email" },
      { status: 500 }
    );
  }
}
