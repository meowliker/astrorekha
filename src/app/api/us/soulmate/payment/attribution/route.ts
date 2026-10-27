import { NextRequest, NextResponse } from "next/server";
import { getSoulmateOrder, validReceiptToken, type SoulmateOrder } from "@/lib/us-soulmate-stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { US_SOULMATE_ORDERS_TABLE } from "@/lib/us-soulmate-orders";
import { chooseSoulmateGaIdentity } from "@/lib/us-soulmate-ga-identity";
import { gaSessionCookieName, parseGaClientId, parseGaSessionId } from "@/lib/ga-cookie-parsers";
import { sendSoulmatePurchase } from "@/lib/us-soulmate-purchase-tracking";

/** Recover attribution only for an authenticated receipt; never change payment state. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== (request.headers.get("host") || request.nextUrl.host)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
    const body = await request.json();
    const id = typeof body.orderId === "string" ? body.orderId : "";
    if (!validReceiptToken(id, request.cookies.get(`us_sm_receipt_${id}`)?.value || "")) return NextResponse.json({ error: "Invalid order link" }, { status: 403, headers });
    const order = await getSoulmateOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404, headers });
    if (process.env.VERCEL_ENV !== "production" || order.payment_mode !== "live" || order.attribution?.trackingEnvironment !== "production" ||
        order.payment_status !== "paid" || !order.paid_at || !Number.isFinite(Date.parse(order.paid_at)) || Date.now() - Date.parse(order.paid_at) > 72 * 3600000) return new NextResponse(null, { status: 204, headers });
    let recovered = order;
    if (!order.attribution?.gaClientId) {
      const gaId = process.env.US_SOULMATE_GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID;
      const gaCookie = gaSessionCookieName(gaId);
      const identity = chooseSoulmateGaIdentity(body, {
        gaClientId: parseGaClientId(request.cookies.get("us_soulmate_ga")?.value),
        gaSessionId: gaCookie ? parseGaSessionId(request.cookies.get(`us_soulmate${gaCookie}`)?.value) : null,
      });
      if (!identity.gaClientId) return new NextResponse(null, { status: 204, headers });
      const { data, error } = await getSupabaseAdmin().from(US_SOULMATE_ORDERS_TABLE)
        .update({ attribution: { ...order.attribution, ...identity } })
        .eq("id", id).eq("attribution", JSON.stringify(order.attribution)).is("ga_purchase_sent_at", null)
        .select("*").maybeSingle();
      if (error) throw new Error("Attribution recovery failed");
      if (!data) return new NextResponse(null, { status: 204, headers });
      recovered = data as SoulmateOrder;
    }
    await sendSoulmatePurchase(recovered);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json({ error: "Attribution recovery unavailable" }, { status: 503, headers });
  }
}
