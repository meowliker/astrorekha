import { NextRequest, NextResponse } from "next/server";
import { syncPaytmRefunds } from "@/lib/paytm-refunds";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.PAYTM_MID) return NextResponse.json({ skipped: "Paytm not configured" });
  try { return NextResponse.json(await syncPaytmRefunds()); }
  catch { return NextResponse.json({ error: "Paytm refund reconciliation needs attention" }, { status: 503 }); }
}
