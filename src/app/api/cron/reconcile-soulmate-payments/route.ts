import { retrySoulmateConfirmations } from "@/lib/soulmate-invoice";
import { sendSoulmatePurchase } from "@/lib/soulmate-purchase-tracking";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SOULMATE_ORDERS_TABLE } from "@/lib/soulmate-orders";
import { payuConfig, reconcileSoulmateOrder, type SoulmateOrder } from "@/lib/soulmate-payu";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reconcile abandoned browsers and missed redirects without touching the main app ledger. */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { mode } = payuConfig();
    const { data, error } = await getSupabaseAdmin().from(SOULMATE_ORDERS_TABLE).select("*")
      .or("gateway.is.null,gateway.eq.payu").eq("payment_mode", mode).in("payment_status", ["created", "pending", "failed"])
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("last_verified_at", { ascending: true, nullsFirst: true }).limit(6);
    if (error) throw new Error("Unable to read pending orders");
    let paid = 0;
    let errors = 0;
    // Bounded concurrency keeps each run within its duration and PayU's rate limits.
    for (let i = 0; i < (data || []).length; i += 3) {
      const results = await Promise.allSettled(data!.slice(i, i + 3).map((order) => reconcileSoulmateOrder(order as SoulmateOrder)));
      for (const result of results) {
        if (result.status === "rejected") errors++;
        else if (result.value.payment_status === "paid") paid++;
      }
    }
    // Retry confirmed purchases even when the browser never returns from PayU.
    const retryFilters = [];
    if (process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN) retryFilters.push("meta_purchase_sent_at.is.null");
    if ((process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID) && process.env.GA4_API_SECRET) retryFilters.push("and(ga_purchase_sent_at.is.null,attribution->>gaClientId.not.is.null)");
    if (process.env.VERCEL_ENV === "production" && retryFilters.length) {
      const pendingEvents = await getSupabaseAdmin().from(SOULMATE_ORDERS_TABLE).select("*")
        .eq("payment_status", "paid").eq("payment_mode", "live")
        .eq("attribution->>trackingEnvironment", "production")
        .gte("paid_at", new Date(Date.now() - 48 * 3600000).toISOString())
        .or(retryFilters.join(","))
        .order("paid_at", { ascending: true }).limit(6);
      if (pendingEvents.error) errors++;
      else {
        for (let i = 0; i < (pendingEvents.data || []).length; i += 3) {
          await Promise.allSettled(pendingEvents.data!.slice(i, i + 3).map((row) => sendSoulmatePurchase(row as SoulmateOrder)));
        }
      }
    }
    const confirmations = await retrySoulmateConfirmations();
    errors += confirmations.failures;
    return NextResponse.json({ confirmations, scanned: data?.length || 0, paid, errors }, { status: errors ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "Unable to reconcile soulmate orders" }, { status: 503 });
  }
}
