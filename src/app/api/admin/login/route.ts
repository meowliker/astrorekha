import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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

    const supabase = getSupabaseAdmin();

    const { data: adminData } = await supabase.from("admins").select("*").eq("id", adminId).single();

    if (!adminData) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (adminData.password_hash !== password) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("admin_sessions").insert({
      id: token,
      admin_id: adminId,
      created_at: new Date().toISOString(),
      expires_at: expiry,
    });

    return NextResponse.json({
      success: true,
      token,
      expiry,
      adminName: adminData.name || adminId,
    });
  } catch (error: any) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
