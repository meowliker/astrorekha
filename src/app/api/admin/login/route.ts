import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import bcrypt from "bcryptjs";

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

    if (typeof password !== "string" || password.length>256 || !(adminData.password_hash.startsWith("$2") ? await bcrypt.compare(password,adminData.password_hash) : adminData.password_hash === password)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const {data:member,error:accessError}=await supabase.from('admin_workspace_members').select('active').eq('admin_id',adminId).maybeSingle();
    if(accessError)return NextResponse.json({error:'Admin access is not available'},{status:503});
    if(!member?.active)return NextResponse.json({error:'Admin access is disabled'},{status:403});
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const {error:sessionError}=await supabase.from("admin_sessions").insert({
      id: token,
      admin_id: adminId,
      created_at: new Date().toISOString(),
      expires_at: expiry,
    });

    if(sessionError)return NextResponse.json({error:"Unable to sign in"},{status:503});
    return NextResponse.json({
      success: true,
      token,
      expiry,
      adminName: adminData.name || adminId,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
