import { processAirpayEvent } from "@/lib/airpay-notification";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { airpayConfig } from "@/lib/airpay-api";
import { reconcileAirpayOrder } from "@/lib/airpay-reconciliation";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.AIRPAY_CLIENT_ID) return NextResponse.json({ skipped: "Airpay not configured" });
  try {
    const { mode } = airpayConfig();
    if (mode !== "live") return NextResponse.json({ skipped: "Airpay verification requires live MID" });
    const db = getSupabaseAdmin({ fresh: true });
    const orders = await db.from("payments").select("id").eq("gateway", "airpay").eq("payment_mode", mode)
      .or("payment_status.in.(created,pending,failed),and(payment_status.eq.paid,fulfilled_at.is.null)")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("gateway_checked_at", { ascending: true, nullsFirst: true }).limit(12);
    if (orders.error) throw orders.error;
    const soulmate = await db.from("soulmate_orders").select("id").eq("gateway", "airpay").eq("payment_mode", mode)
      .in("payment_status", ["created", "pending", "failed"]).gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(6);
    if (soulmate.error) throw soulmate.error;
    const candidates = [...orders.data, ...soulmate.data];
    const events = await db.from("airpay_webhook_events").select("*").eq("payment_mode", mode).eq("event_type", "payment").is("processed_at", null)
      .order("checked_at", { ascending: true, nullsFirst: true }).limit(6);
    if (events.error) throw events.error;
    // Four workers and a start deadline bound work during provider outages. Unstarted
    // records retain their check timestamp and remain first in line on the next run.
    const jobs: { event: boolean; run: () => Promise<boolean> }[] = [];
    for (let i = 0; i < Math.max(candidates.length, events.data.length); i++) {
      if (candidates[i]) { const row = candidates[i]; jobs.push({ event: false, run: async () => (await reconcileAirpayOrder(row.id)).payment_status === "paid" }); }
      if (events.data[i]) { const event = events.data[i]; jobs.push({ event: true, run: async () => { await processAirpayEvent(event); return false; } }); }
    }
    let cursor = 0, paid = 0, errors = 0, scanned = 0, eventCount = 0;
    const startDeadline = Date.now() + 45000;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < jobs.length && Date.now() < startDeadline) {
        const job = jobs[cursor++];
        if (job.event) eventCount++; else scanned++;
        try { if (await job.run()) paid++; } catch { errors++; }
      }
    }));
    return NextResponse.json({ events: eventCount, scanned, deferred: jobs.length - cursor, paid, errors }, { status: errors ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Airpay reconciliation needs attention" }, { status: 503 }); }
}
