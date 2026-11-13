import {withAdminAccess} from "@/lib/admin-access";
import { parseAdSource } from "@/lib/admin-acquisition";
import { readAdSourceFinance } from "@/lib/admin-source-finance";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/soulmate-admin";
import { DAY_MS, SOULMATE_PROFIT_START, latestSoulmateProfitRange, profitDay, validProfitDate } from "@/lib/soulmate-profit";
import { readSoulmateProfitLedger, syncSoulmateProfitLedger } from "@/lib/soulmate-profit-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function handleGET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const start = request.nextUrl.searchParams.get("start") || SOULMATE_PROFIT_START;
  const end = request.nextUrl.searchParams.get("end") || profitDay(Date.now());
  if (!validProfitDate(start) || !validProfitDate(end) || start < SOULMATE_PROFIT_START || end > profitDay(Date.now()) || end < start || Date.parse(end) - Date.parse(start) >= 366 * DAY_MS) return json({ error: "Choose valid dates from 15 October 2026, up to 366 days at a time." }, 400);
  try {
    const result = await readSoulmateProfitLedger(db, start, end);
    const adSource = parseAdSource(request.nextUrl.searchParams);
    if (adSource === "all") return json(result);
    const finance = await readAdSourceFinance(db, "soulmate", adSource, start, end);
    const rows = finance.map((day) => {
      const saved = result.rows.find((row) => row.date === day.date);
      const known = adSource === "meta" && !!saved && !saved.stale;
      const adsInr = known ? saved!.adsInr : null, adGst = known ? saved!.adGst : null;
      const revenue = day.received - day.refund;
      return { ...saved, date: day.date, orders: day.orders, received: day.received, refund: day.refund, revenue,
        salesGst: day.salesTax, adsUsd: known ? saved!.adsUsd : null, adsInr, adGst, balance: null, balanceCapturedAt: null,
        profit: adsInr === null || adGst === null ? null : revenue - day.salesTax - adsInr - adGst,
        roas: adsInr ? revenue / adsInr : null, accounts: known ? saved!.accounts : [], stale: false };
    });
    return json({ ...result, rows, adSource, missing: [] });
  } catch { return json({ error: "Unable to load saved Soulmate profit rows." }, 503); }
}
async function handlePOST(request: NextRequest) {
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

export const GET=withAdminAccess(handleGET);
export const POST=withAdminAccess(handlePOST);
