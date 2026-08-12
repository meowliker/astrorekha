import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const email = (request.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
    const userId = (request.nextUrl.searchParams.get("userId") || "").trim();

    if (!email && !userId) {
      return NextResponse.json({ error: "email or userId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let user: { id: string; email: string | null; coins: number | null } | null = null;

    if (email) {
      const { data } = await supabase
        .from("users")
        .select("id, email, coins")
        .eq("email", email)
        .maybeSingle();
      if (data) user = data;
    }

    if (!user && userId) {
      const { data } = await supabase
        .from("users")
        .select("id, email, coins")
        .eq("id", userId)
        .maybeSingle();
      if (data) user = data;
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
      coins: typeof user.coins === "number" ? user.coins : 0,
    });
  } catch (error: any) {
    console.error("[chat-balance] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load chat balance" },
      { status: 500 }
    );
  }
}
