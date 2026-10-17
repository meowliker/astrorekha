import { NextRequest, NextResponse } from "next/server";
import { runAutomaticSoulmateReports } from "@/lib/us-soulmate-report-worker";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runAutomaticSoulmateReports();
    return NextResponse.json(result, { status: result.needsReview || result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Soulmate report worker unavailable" }, { status: 503 });
  }
}
