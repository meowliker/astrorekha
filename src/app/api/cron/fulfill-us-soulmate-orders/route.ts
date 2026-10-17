import { NextRequest, NextResponse } from "next/server";
import { runSoulmateFulfillment } from "@/lib/us-soulmate-fulfillment";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!process.env.US_SOULMATE_CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.US_SOULMATE_CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runSoulmateFulfillment();
    return NextResponse.json(result, { status: result.failures || result.needsReview ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Soulmate delivery worker unavailable" }, { status: 503 });
  }
}
