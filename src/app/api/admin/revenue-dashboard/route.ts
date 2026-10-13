import { savedRevenueReport } from "@/lib/revenue-cache";
import { filterAndSortOrders } from "@/lib/revenue-table";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  istDate,
  resolveRevenueRange,
  shiftDate,
} from "@/lib/revenue-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// A manual refresh paginates the complete payment, account and retained-usage history.
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
async function handle(request: NextRequest, refresh = false) {
  try {
    const db = getSupabaseAdmin();
    const token =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      request.nextUrl.searchParams.get("token");
    if (!token)
      return NextResponse.json(
        { error: "Please sign in as an administrator." },
        { status: 401, headers },
      );
    const { data: session, error: sessionError } = await db
      .from("admin_sessions")
      .select("id,expires_at")
      .eq("id", token)
      .maybeSingle();
    if (sessionError)
      throw new Error("Unable to verify administrator session.");
    if (
      !session ||
      !session.expires_at ||
      !Number.isFinite(Date.parse(session.expires_at)) ||
      Date.parse(session.expires_at) <= Date.now()
    )
      return NextResponse.json(
        { error: "Your admin session has expired. Please sign in again." },
        { status: 401, headers },
      );
    const params = request.nextUrl.searchParams;
    const generatedAt = params.has("asOf")
      ? new Date(params.get("asOf")!)
      : new Date();
    if (
      !Number.isFinite(generatedAt.getTime()) ||
      generatedAt.getTime() > Date.now()
    )
      return NextResponse.json(
        { error: "Invalid report snapshot date." },
        { status: 400, headers },
      );
    const today = istDate(new Date());
    let range;
    try {
      range = resolveRevenueRange(
        params.get("startDate") || shiftDate(today, -6),
        params.get("endDate") || today,
        new Date(),
      );
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400, headers },
      );
    }
    const attribution =
      params.get("attribution") === "first" ? "first" : "last";
    const result = await savedRevenueReport(db, range, attribution, refresh);
    const snapshot = result.snapshot;
    if (params.has("snapshot") && params.get("snapshot") !== snapshot)
      return NextResponse.json(
        {
          error:
            "Payment records changed since this report loaded. Refresh the dashboard before continuing.",
        },
        { status: 409, headers },
      );
    const filtered = filterAndSortOrders(result.orders, params);
    const limit = Math.max(
      1,
      Math.min(2000, Number(params.get("orderLimit")) || 50),
    );
    const offset = Math.max(
      0,
      Math.floor(Number(params.get("orderOffset")) || 0),
    );
    const orders = filtered.slice(offset, offset + limit);
    const orderPage = { total: filtered.length, offset, limit };
    return NextResponse.json(
      params.get("view") === "orders"
        ? {
            orders,
            orderPage,
            snapshot,
            generatedAt: result.generatedAt,
          }
        : {
            ...result,
            orders,
            orderPage,
            snapshot,
            generatedAt: result.generatedAt,
          },
      { headers },
    );
  } catch (error) {
    console.error(
      "[admin/revenue] Complete report failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "Unable to load a complete revenue report. Please retry. No partial financial totals are shown.",
      },
      { status: 503, headers },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request, true);
}
