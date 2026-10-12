import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing } from "@/lib/pricing";
import {
  buildRevenueDashboard,
  istDate,
  resolveRevenueRange,
  shiftDate,
  type OfferEvent,
  type PaymentRow,
} from "@/lib/revenue-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const PAYMENT_FIELDS =
  "id,payu_txn_id,razorpay_order_id,user_id,customer_email,type,bundle_id,feature,amount,currency,payment_status,coins,created_at,fulfilled_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_touch,last_touch";
const EVENT_FIELDS =
  "id,event_name,product_type,product_id,user_id,email,visitor_id,created_at";

/** Keyset pagination avoids PostgREST's default 1,000-row cap. Never return a partial sum. */
async function readPages<T extends { id: string }>(
  page: (
    after: string | null,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ceiling: number,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await page(after);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (rows.length > ceiling)
      throw new Error(
        "Range exceeds the safe read limit. No partial totals returned.",
      );
    const next = data[data.length - 1].id;
    if (next === after)
      throw new Error(
        "Pagination did not advance. No partial totals returned.",
      );
    after = next;
    // Read until an empty page; deployed row caps may be lower than our requested page size.
  }
}

export async function GET(request: NextRequest) {
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
    const today = istDate(generatedAt);
    let range;
    try {
      range = resolveRevenueRange(
        params.get("startDate") || shiftDate(today, -6),
        params.get("endDate") || today,
        generatedAt,
      );
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400, headers },
      );
    }
    const attribution =
      params.get("attribution") === "first" ? "first" : "last";
    const warnings: string[] = [];
    const [paymentResult, eventResult, pricingResult] =
      await Promise.allSettled([
        // Read order history to resolve backfill copies and retain the original checkout date.
        readPages<PaymentRow>((after) => {
          let query = db
            .from("payments")
            .select(PAYMENT_FIELDS)
            .lt("created_at", generatedAt.toISOString())
            .order("id")
            .limit(1000);
          if (after) query = query.gt("id", after);
          return query;
        }, 150000),
        readPages<OfferEvent>((after) => {
          let query = db
            .from("marketing_events")
            .select(EVENT_FIELDS)
            .in("event_name", [
              "product_offer_view",
              "upsell_view",
              "chat_unlimited_offer_shown",
            ])
            .gte("created_at", range.from)
            .lt("created_at", range.to)
            .order("id")
            .limit(1000);
          if (after) query = query.gt("id", after);
          return query;
        }, 30000),
        db.from("settings").select("value").eq("key", "pricing").maybeSingle(),
      ]);
    if (paymentResult.status === "rejected")
      throw new Error(
        `Complete payment data could not be loaded. ${paymentResult.reason instanceof Error ? paymentResult.reason.message : "Please retry."}`,
      );
    let events: OfferEvent[] | null = null;
    if (eventResult.status === "fulfilled") events = eventResult.value;
    else
      warnings.push(
        "Offer tracking could not be fully loaded. Offer conversion is unavailable; payment totals are unaffected.",
      );
    let pricing = DEFAULT_PRICING;
    if (
      pricingResult.status === "fulfilled" &&
      !pricingResult.value.error &&
      pricingResult.value.data?.value
    )
      pricing = normalizePricing(pricingResult.value.data.value);
    else
      warnings.push(
        "Current product catalog unavailable. Default names are used; all revenue still comes from recorded payments.",
      );
    const result = buildRevenueDashboard({
      payments: paymentResult.value,
      events,
      pricing,
      range,
      attribution,
      warnings,
    });
    // Keep payloads bounded without truncating any aggregate. Ledger pages and exports
    // must match the original snapshot; status changes require an explicit refresh.
    const snapshot = createHash("sha256")
      .update(JSON.stringify(result.orders))
      .digest("hex");
    if (params.has("snapshot") && params.get("snapshot") !== snapshot)
      return NextResponse.json(
        {
          error:
            "Payment records changed since this report loaded. Refresh the dashboard before continuing.",
        },
        { status: 409, headers },
      );
    const query = (params.get("orderQuery") || "").trim().toLowerCase();
    const product = params.get("orderProduct");
    const state = params.get("orderState");
    const filtered = result.orders.filter(
      (order) =>
        (!product || order.productKey === product) &&
        (!state || state === "all" || order.state === state) &&
        (!query ||
          `${order.gatewayId} ${order.customer} ${order.product} ${order.campaign}`
            .toLowerCase()
            .includes(query)),
    );
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
            generatedAt: generatedAt.toISOString(),
          }
        : {
            ...result,
            orders,
            orderPage,
            snapshot,
            generatedAt: generatedAt.toISOString(),
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
