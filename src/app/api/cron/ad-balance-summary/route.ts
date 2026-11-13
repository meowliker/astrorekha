import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runDailyBalanceDigest } from "@/lib/monitoring-balance-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDailyBalanceDigest(getSupabaseAdmin()), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Daily balance summary failed" }, { status: 500 });
  }
}
