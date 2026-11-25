import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { shiprocketConfig } from "@/lib/shiprocket-checkout-api";
import { reconcileShiprocketOrder } from "@/lib/shiprocket-reconciliation";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SHIPROCKET_CHECKOUT_API_KEY) return NextResponse.json({ skipped: "Fastrr not configured" });
  try {
    const db = getSupabaseAdmin({ fresh: true }), { mode } = shiprocketConfig();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const reports = await db.from("payments").select("id").eq("gateway", "shiprocket").eq("payment_mode", mode)
      .or("payment_status.in.(created,pending,failed),and(payment_status.eq.paid,fulfilled_at.is.null)").gte("created_at", since)
      .order("gateway_checked_at", { ascending: true, nullsFirst: true }).limit(16);
    const soulmate = await db.from("soulmate_orders").select("id").eq("gateway", "shiprocket").eq("payment_mode", mode)
      .in("payment_status", ["created", "pending", "failed"]).gte("created_at", since)
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(8);
    if (reports.error || soulmate.error) throw new Error("Unable to read Fastrr queue");
    const jobs = [...reports.data, ...soulmate.data]; let cursor = 0, paid = 0, errors = 0;
    const deadline = Date.now() + 45000;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < jobs.length && Date.now() < deadline) {
        const row = jobs[cursor++];
        try { if ((await reconcileShiprocketOrder(row.id)).payment_status === "paid") paid++; } catch { errors++; }
      }
    }));
    return NextResponse.json({ scanned: cursor, deferred: jobs.length - cursor, paid, errors }, { status: errors ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Fastrr recovery needs attention" }, { status: 503 }); }
}
