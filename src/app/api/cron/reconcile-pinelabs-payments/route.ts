import { processPineLabsEvent } from "@/lib/pinelabs-notification";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { pineLabsConfig } from "@/lib/pinelabs-api";
import { reconcilePineLabsOrder } from "@/lib/pinelabs-reconciliation";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.PINELABS_CLIENT_ID) return NextResponse.json({ skipped: "Pine Labs not configured" });
  try {
    const { mode } = pineLabsConfig();
    const db = getSupabaseAdmin({ fresh: true });
    const orders = await db.from("payments").select("id").eq("gateway", "pinelabs").eq("payment_mode", mode)
      .or("payment_status.in.(created,pending,failed),and(payment_status.eq.paid,fulfilled_at.is.null)")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("gateway_checked_at", { ascending: true, nullsFirst: true }).limit(12);
    if (orders.error) throw orders.error;
    const soulmate = await db.from("soulmate_orders").select("id").eq("gateway", "pinelabs").eq("payment_mode", mode)
      .in("payment_status", ["created", "pending", "failed"]).gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(6);
    if (soulmate.error) throw soulmate.error;
    const candidates = [...orders.data, ...soulmate.data];
    const events = await db.from("pinelabs_webhook_events").select("*").eq("payment_mode", mode).is("processed_at", null)
      .order("checked_at", { ascending: true, nullsFirst: true }).limit(6);
    if (events.error) throw events.error;
    // Four workers and a start deadline bound work during provider outages. Unstarted
    // records retain their check timestamp and remain first in line on the next run.
    const jobs: { event: boolean; run: () => Promise<boolean> }[] = [];
    for (let i = 0; i < Math.max(candidates.length, events.data.length); i++) {
      if (candidates[i]) { const row = candidates[i]; jobs.push({ event: false, run: async () => (await reconcilePineLabsOrder(row.id)).payment_status === "paid" }); }
      if (events.data[i]) { const event = events.data[i]; jobs.push({ event: true, run: async () => { await processPineLabsEvent(event); return false; } }); }
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
  } catch { return NextResponse.json({ error: "Pine Labs reconciliation needs attention" }, { status: 503 }); }
}
