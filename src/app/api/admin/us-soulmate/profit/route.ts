import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/us-soulmate-admin";
import { DAY_MS, US_SOULMATE_PROFIT_START, latestSoulmateProfitRange, profitDay, validProfitDate } from "@/lib/us-soulmate-profit";
import { readSoulmateProfitLedger, syncSoulmateProfitLedger } from "@/lib/us-soulmate-profit-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const start = request.nextUrl.searchParams.get("start") || US_SOULMATE_PROFIT_START;
  const end = request.nextUrl.searchParams.get("end") || profitDay(Date.now());
  if (!validProfitDate(start) || !validProfitDate(end) || start < US_SOULMATE_PROFIT_START || end > profitDay(Date.now()) || end < start || Date.parse(end) - Date.parse(start) >= 366 * DAY_MS) return json({ error: "Choose valid dates from 28 October 2026, up to 366 days at a time." }, 400);
  try {
    return json(await readSoulmateProfitLedger(db, start, end));
  } catch { return json({ error: "Unable to load saved Soulmate profit rows." }, 503); }
}
export async function POST(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json();
    let selected = latestSoulmateProfitRange();
    if (body.mode === "range") {
      if (!validProfitDate(body.start) || !validProfitDate(body.end)) return json({ error: "Choose valid backfill dates." }, 400);
      selected = { start: body.start, end: body.end };
    } else if (body.mode !== "last2") return json({ error: "Choose a valid refresh mode." }, 400);
    return json({ syncedRange: await syncSoulmateProfitLedger(db, selected.start, selected.end) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to refresh. Saved figures have been kept." }, 503); }
}
