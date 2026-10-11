import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPayUTransaction } from "@/lib/payu-api";
import { fulfillPayUPayment } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAID_AT_PAYU = new Set(["success", "paid", "captured"]);

/** Recover recent completed PayU payments left in created/pending when a callback was missed. */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const token = request.headers.get("x-admin-session");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: session, error: sessionError } = await supabase.from("admin_sessions")
      .select("id,expires_at").eq("id", token).maybeSingle();
    if (sessionError || !session || new Date(session.expires_at) <= new Date()) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }
    // Local and preview builds may read production data but must not fulfil orders.
    if (process.env.VERCEL_ENV !== "production") {
      return NextResponse.json({ checked: 0, recovered: 0, skipped: "Local preview" });
    }

    const now = Date.now();
    const { data, error } = await supabase.from("payments")
      .select("id,payu_txn_id,amount,user_id,type,bundle_id,feature,coins,customer_email")
      .in("payment_status", ["created", "pending"])
      .not("payu_txn_id", "is", null)
      .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString())
      .lte("created_at", new Date(now - 30_000).toISOString())
      .order("created_at", { ascending: false }).limit(3);
    if (error) throw error;

    let recovered = 0;
    for (const payment of data || []) {
      try {
        const verified = await verifyPayUTransaction(payment.payu_txn_id);
        if (!verified || !PAID_AT_PAYU.has(String(verified.status || verified.unmappedstatus || "").toLowerCase())) continue;
        const verifiedAmount = Number(verified.amt ?? verified.transaction_amount);
        if (!Number.isFinite(verifiedAmount) || Math.round(verifiedAmount * 100) !== payment.amount) {
          console.warn("[admin/tracking/reconcile] PayU amount mismatch", { paymentId: payment.id });
          continue;
        }
        // Fulfilment verifies the saved order and updates access, analytics, and payment status.
        const result = await fulfillPayUPayment({
          txnid: payment.payu_txn_id,
          mihpayid: verified.mihpayid,
          status: verified.status || verified.unmappedstatus,
          amount: verifiedAmount.toFixed(2),
          productinfo: verified.productinfo,
          firstname: verified.firstname,
          email: verified.email || payment.customer_email || undefined,
          phone: verified.phone,
          udf1: verified.udf1 || payment.user_id || undefined,
          udf2: verified.udf2 || payment.type || undefined,
          udf3: verified.udf3 || payment.bundle_id || undefined,
          udf4: verified.udf4 || payment.feature || undefined,
          udf5: verified.udf5 || (typeof payment.coins === "number" ? String(payment.coins) : undefined),
          key: process.env.PAYU_MERCHANT_KEY,
        }, { verifiedByPayUApi: true });
        if (result.success && !result.alreadyPaid) recovered++;
      } catch (cause) {
        console.error("[admin/tracking/reconcile] PayU verification failed", { paymentId: payment.id, cause });
      }
    }
    return NextResponse.json({ checked: data?.length || 0, recovered }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("[admin/tracking/reconcile]", cause);
    return NextResponse.json({ error: "Unable to verify pending payments" }, { status: 500 });
  }
}
