import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { reconcileSoulmateOrder, type SoulmateOrder } from "@/lib/soulmate-payu";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const db = getSupabaseAdmin({ fresh: true });
  const token = request.headers.get("x-admin-session");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session, error } = await db.from("admin_sessions").select("expires_at").eq("id", token).maybeSingle();
  if (error || !session || Date.parse(session.expires_at) <= Date.now()) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  if (process.env.VERCEL_ENV !== "production" || process.env.PAYU_MODE !== "live") return NextResponse.json({ checked: 0, recovered: 0, skipped: "Local preview" });
  try {
    const { data, error: queryError } = await db.from("soulmate_orders").select("*")
      .eq("funnel", "soulmate_standalone").eq("payment_mode", "live")
      .eq("attribution->>trackingEnvironment", "production").in("payment_status", ["created", "pending"])
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .lte("created_at", new Date(Date.now() - 30000).toISOString())
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(3);
    if (queryError) throw new Error("Unable to read pending Soulmate payments.");
    let recovered = 0;
    for (const row of data) {
      const order = await reconcileSoulmateOrder(row as SoulmateOrder);
      if (order.payment_status === "paid") recovered++;
    }
    return NextResponse.json({ checked: data.length, recovered }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to verify pending Soulmate payments." }, { status: 503 }); }
}
