import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING } from "@/lib/pricing";

// GET - Fetch current pricing (public endpoint for frontend)
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "pricing")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: true, pricing: DEFAULT_PRICING });
    }

    return NextResponse.json({ success: true, pricing: data.value });
  } catch (error: any) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json({ success: true, pricing: DEFAULT_PRICING });
  }
}
