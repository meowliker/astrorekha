import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPayUTransactions } from "@/lib/payu-api";
import { fulfillPayUPayment } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";

const SUCCESS_STATUSES = new Set(["paid", "success", "captured"]);
const PENDING_STATUSES = new Set(["pending", "in progress", "initiated", "queued"]);

type PayUTransaction = {
  txnid?: string;
  mihpayid?: string;
  id?: string;
  status?: string;
  unmappedstatus?: string;
  amount?: string | number;
  productinfo?: string;
  firstname?: string;
  email?: string;
  phone?: string;
  phone_number?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
};

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: NextRequest) {
  try {
    const txnid = request.nextUrl.searchParams.get("txnid")?.trim();
    if (!txnid) {
      return NextResponse.json({ success: false, error: "txnid is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: payment } = await supabase
      .from("payments")
      .select("id, payu_txn_id, payu_payment_id, user_id, type, bundle_id, feature, coins, customer_email, payment_status, created_at")
      .eq("payu_txn_id", txnid)
      .maybeSingle();

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

    const createdAt = payment?.created_at ? new Date(payment.created_at) : new Date();
    const fromDate = toYMD(new Date(createdAt.getTime() - 24 * 60 * 60 * 1000));
    const toDate = toYMD(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const payuTxns = (await getPayUTransactions(fromDate, toDate)) as PayUTransaction[];
    const payuTxn = payuTxns.find((txn) => String(txn?.txnid || "").trim() === txnid);

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
    if (PENDING_STATUSES.has(payuStatus)) {
      return NextResponse.json({
        success: true,
        status: "pending",
        userId: payment?.user_id || null,
        type: payment?.type || null,
        bundleId: payment?.bundle_id || null,
        payuPaymentId: payuTxn.mihpayid || payuTxn.id || null,
      });
    }

    const result = await fulfillPayUPayment({
      txnid: payuTxn.txnid,
      mihpayid: payuTxn.mihpayid || payuTxn.id,
      status: payuTxn.status || payuTxn.unmappedstatus || "pending",
      amount: String(payuTxn.amount ?? ""),
      productinfo: payuTxn.productinfo,
      firstname: payuTxn.firstname,
      email: payuTxn.email || payment?.customer_email || undefined,
      phone: payuTxn.phone || payuTxn.phone_number || undefined,
      udf1: payuTxn.udf1 || payment?.user_id || undefined,
      udf2: payuTxn.udf2 || payment?.type || undefined,
      udf3: payuTxn.udf3 || payment?.bundle_id || undefined,
      udf4: payuTxn.udf4 || payment?.feature || undefined,
      udf5: payuTxn.udf5 || (typeof payment?.coins === "number" ? String(payment.coins) : undefined),
      key: process.env.PAYU_MERCHANT_KEY,
    });

    return NextResponse.json({
      success: true,
      status: result.success ? "paid" : payuStatus,
      userId: result.userId || payment?.user_id || null,
      type: payment?.type || payuTxn.udf2 || null,
      bundleId: payment?.bundle_id || payuTxn.udf3 || null,
      feature: payment?.feature || payuTxn.udf4 || null,
      payuPaymentId: payuTxn.mihpayid || payuTxn.id || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check PayU status";
    console.error("[payu/status] error", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
