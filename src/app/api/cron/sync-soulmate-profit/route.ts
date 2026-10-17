import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { latestSoulmateProfitRange } from "@/lib/soulmate-profit";
import { syncSoulmateProfitLedger } from "@/lib/soulmate-profit-ledger";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { start, end } = latestSoulmateProfitRange();
    return NextResponse.json({ syncedRange: await syncSoulmateProfitLedger(getSupabaseAdmin({ fresh: true }), start, end) });
  } catch { return NextResponse.json({ error: "Soulmate profit refresh failed; saved figures were retained." }, { status: 503 }); }
}
