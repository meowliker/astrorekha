import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { paytmConfig } from "@/lib/paytm-api";
import { reconcilePaytmOrder } from "@/lib/paytm-reconciliation";
import { selectPaytmReconciliationCandidates } from "@/lib/paytm-reconciliation-queue";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.PAYTM_MID) return NextResponse.json({ skipped: "Paytm not configured" });
  try {
    const { mode } = paytmConfig();
    const db = getSupabaseAdmin({ fresh: true });
    const candidates = await selectPaytmReconciliationCandidates(db, mode, new Date(Date.now()));
    let cursor = 0, scanned = 0, paid = 0, errors = 0;
    const lanes = { fulfillment: 0, recent: 0, aging: 0, recovery: 0 };
    // Bound starts during provider outages; unstarted orders keep their place next run.
    // Existing per-order leases and verified fulfillment remain the only mutation path.
    const startDeadline = Date.now() + 45_000;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < candidates.length && Date.now() < startDeadline) {
        const candidate = candidates[cursor++];
        scanned++;
        lanes[candidate.lane]++;
        try { if ((await reconcilePaytmOrder(candidate.id)).payment_status === "paid") paid++; }
        catch { errors++; }
      }
    }));
    const summary = { queued: candidates.length, scanned, deferred: candidates.length - scanned, paid, errors, lanes };
    console.info("[paytm-reconcile]", summary);
    return NextResponse.json(summary, { status: errors ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Paytm reconciliation needs attention" }, { status: 503 }); }
}
