import { readGoogleSpend, googleSpendForDay } from "@/lib/google-ads-reporting";
import { parseAdSource } from "@/lib/admin-acquisition";
import { readAdSourceFinance } from "@/lib/admin-source-finance";
import {withAdminAccess} from "@/lib/admin-access";
import { NextRequest, NextResponse } from "next/server";
import { soulmateAdmin } from "@/lib/us-main-admin";
import { DAY_MS, US_MAIN_PROFIT_START, latestSoulmateProfitRange, profitDay, validProfitDate } from "@/lib/us-main-profit";
import { readSoulmateProfitLedger, syncSoulmateProfitLedger } from "@/lib/us-main-profit-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function handleGET(request: NextRequest) {
  const db = await soulmateAdmin(request);
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const start = request.nextUrl.searchParams.get("start") || US_MAIN_PROFIT_START;
  const end = request.nextUrl.searchParams.get("end") || profitDay(Date.now());
  if (!validProfitDate(start) || !validProfitDate(end) || start < US_MAIN_PROFIT_START || end > profitDay(Date.now()) || end < start || Date.parse(end) - Date.parse(start) >= 366 * DAY_MS) return json({ error: "Choose valid dates from 12 November 2026, up to 366 days at a time." }, 400);
  try {
    const result = await readSoulmateProfitLedger(db, start, end);
    const adSource = parseAdSource(request.nextUrl.searchParams);
    const google = adSource === "meta" ? null : await readGoogleSpend("us-main", start, end, "business_1130_ist", Number(result.exchangeRate));
    if (adSource === "all") {
      const rows = result.rows.map(saved => {
        const cost = google ? googleSpendForDay(google, saved.date) : null;
        const adsInr = cost && saved.adsInr !== null && !saved.stale ? saved.adsInr + Math.round(cost.total * 100) : null;
        const extraTax = cost ? Math.round(cost.indian * 18) : null;
        const adGst = extraTax !== null && saved.adGst !== null && !saved.stale ? saved.adGst + extraTax : null;
        return { ...saved, adsInr, adsUsd: cost && saved.adsUsd !== null ? saved.adsUsd + Math.round(cost.total * 100 / 1) : null, adGst,
          profit: adsInr === null || adGst === null || saved.revenue === null ? null : saved.revenue - saved.salesGst - adsInr - adGst,
          roas: adsInr && saved.revenue !== null ? saved.revenue / adsInr : null };
      });
      return json({ ...result, rows, warnings: google?.warnings || [] });
    }
    const finance = await readAdSourceFinance(db, "us-main", adSource, start, end);
    const rows = finance.map((day) => {
      const saved = result.rows.find((row) => row.date === day.date);
      const cost = google ? googleSpendForDay(google, day.date) : null;
      const known = adSource === "meta" ? !!saved && !saved.stale : cost !== null;
      const adsInr = adSource === "google" ? cost ? Math.round(cost.total * 100) : null : known ? saved!.adsInr : null;
      const adGst = adSource === "google" ? cost ? Math.round(cost.indian * 18) : null : known ? saved!.adGst : null;
      const revenue = day.received - day.refund;
      return { ...saved, date: day.date, orders: day.orders, received: day.received, refund: day.refund, revenue,
        salesGst: day.salesTax, adsUsd: adSource === "google" ? cost ? Math.round(cost.total * 100 / 1) : null : known ? saved!.adsUsd : null, adsInr, adGst, balance: null, balanceCapturedAt: null,
        profit: adsInr === null || adGst === null ? null : revenue - day.salesTax - adsInr - adGst,
        roas: adsInr ? revenue / adsInr : null, accounts: adSource === "meta" && known ? saved!.accounts : [], stale: false };
    });
    return json({ ...result, rows, adSource, missing: [], warnings: google?.warnings || [] });
  } catch { return json({ error: "Unable to load saved US AstroRekha profit rows." }, 503); }
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
