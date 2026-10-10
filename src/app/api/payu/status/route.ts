import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPayUTransaction } from "@/lib/payu-api";
import { fulfillPayUPayment } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";

const SUCCESS_STATUSES = new Set(["paid", "success", "captured"]);
const PENDING_STATUSES = new Set(["pending", "in progress", "initiated", "queued"]);
const FAILED_STATUSES = new Set(["failed", "failure", "bounced", "cancelled", "usercancelled", "dropped"]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const txnid = request.nextUrl.searchParams.get("txnid")?.trim();
    if (!txnid) {
      return NextResponse.json({ success: false, error: "txnid is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: payment, error: lookupError } = await supabase
      .from("payments")
      .select("id, payu_txn_id, payu_payment_id, user_id, type, bundle_id, feature, coins, customer_email, payment_status, amount")
      .eq("payu_txn_id", txnid)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 });
    }

    if (SUCCESS_STATUSES.has(normalizeStatus(payment?.payment_status))) {
      return NextResponse.json({
        success: true,
        status: "paid",
        userId: payment?.user_id || null,
        type: payment?.type || null,
        bundleId: payment?.bundle_id || null,
        feature: payment?.feature || null,
        payuPaymentId: payment?.payu_payment_id || null,
      });
    }

    const payuTxn = await verifyPayUTransaction(txnid);

    if (!payuTxn) {
      return NextResponse.json({
        success: true,
        status: "pending",
        userId: payment?.user_id || null,
        type: payment?.type || null,
        bundleId: payment?.bundle_id || null,
      });
    }

    const payuStatus = normalizeStatus(payuTxn.status || payuTxn.unmappedstatus || "pending");
    if (PENDING_STATUSES.has(payuStatus) ||
        (!SUCCESS_STATUSES.has(payuStatus) && !FAILED_STATUSES.has(payuStatus))) {
      return NextResponse.json({
        success: true,
        status: "pending",
        userId: payment?.user_id || null,
        type: payment?.type || null,
        bundleId: payment?.bundle_id || null,
        payuPaymentId: payuTxn.mihpayid || null,
      });
    }

    // Never fulfil or fail an order from a gateway response for a different amount.
    const payuAmount = Number(payuTxn.amt ?? payuTxn.transaction_amount);
    if (!Number.isFinite(payuAmount) || Math.round(payuAmount * 100) !== payment.amount) {
      console.error("[payu/status] verified amount mismatch", { txnid });
      return NextResponse.json({ success: false, error: "Payment amount mismatch" }, { status: 502 });
    }

    const result = await fulfillPayUPayment({
      txnid: payuTxn.txnid,
      mihpayid: payuTxn.mihpayid,
      status: payuTxn.status || payuTxn.unmappedstatus || "pending",
      amount: payuAmount.toFixed(2),
      productinfo: payuTxn.productinfo,
      firstname: payuTxn.firstname,
      email: payuTxn.email || payment?.customer_email || undefined,
      phone: payuTxn.phone || undefined,
      udf1: payuTxn.udf1 || payment?.user_id || undefined,
      udf2: payuTxn.udf2 || payment?.type || undefined,
      udf3: payuTxn.udf3 || payment?.bundle_id || undefined,
      udf4: payuTxn.udf4 || payment?.feature || undefined,
      udf5: payuTxn.udf5 || (typeof payment?.coins === "number" ? String(payment.coins) : undefined),
      key: process.env.PAYU_MERCHANT_KEY,
    }, { verifiedByPayUApi: true });

    return NextResponse.json({
      success: true,
      status: result.success ? "paid" : payuStatus,
      userId: result.userId || payment?.user_id || null,
      type: payment.type || null,
      bundleId: payment.bundle_id || null,
      feature: payment.feature || null,
      payuPaymentId: payuTxn.mihpayid || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check PayU status";
    console.error("[payu/status] error", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
