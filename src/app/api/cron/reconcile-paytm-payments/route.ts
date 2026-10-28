import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { paytmConfig } from "@/lib/paytm-api";
import { reconcilePaytmOrder } from "@/lib/paytm-reconciliation";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.PAYTM_MID) return NextResponse.json({ skipped: "Paytm not configured" });
  try {
    const { mode } = paytmConfig();
    const db = getSupabaseAdmin({ fresh: true });
    const orders = await db.from("payments").select("id").eq("gateway", "paytm").eq("payment_mode", mode)
      .or("payment_status.in.(created,pending,failed),and(payment_status.eq.paid,fulfilled_at.is.null)")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("gateway_checked_at", { ascending: true, nullsFirst: true }).limit(12);
    if (orders.error) throw orders.error;
    const soulmate = await db.from("soulmate_orders").select("id").eq("gateway", "paytm").eq("payment_mode", mode)
      .in("payment_status", ["created", "pending", "failed"]).gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(6);
    if (soulmate.error) throw soulmate.error;
    const candidates = [...orders.data, ...soulmate.data];
    let paid = 0, errors = 0;
    for (let i = 0; i < candidates.length; i += 3) {
      const results = await Promise.allSettled(candidates.slice(i, i + 3).map(row => reconcilePaytmOrder(row.id)));
      results.forEach(result => { if (result.status === "rejected") errors++; else if (result.value.payment_status === "paid") paid++; });
    }
    return NextResponse.json({ scanned: candidates.length, paid, errors }, { status: errors ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Paytm reconciliation needs attention" }, { status: 503 }); }
}
