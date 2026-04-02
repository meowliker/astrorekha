import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPayUTransactions } from "@/lib/payu-api";
import { fulfillPayUPayment } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";

function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function runReconciliation(lookbackDays: number, maxRows: number) {
  try {
    const supabase = getSupabaseAdmin();

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingRows, error: pendingError } = await supabase
      .from("payments")
      .select("id, payu_txn_id, user_id, type, bundle_id, feature, coins, customer_email, payment_status, created_at")
      .eq("payment_status", "created")
      .not("payu_txn_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(maxRows);

    if (pendingError) {
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    if (!pendingRows || pendingRows.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        reconciled: 0,
        message: "No pending created payments in lookback window",
      });
    }

    const minCreatedAt = pendingRows[0]?.created_at ? new Date(pendingRows[0].created_at) : new Date();
    const fromDate = toYMD(new Date(minCreatedAt.getTime() - 24 * 60 * 60 * 1000));
    const toDate = toYMD(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const payuTxns: any[] = await getPayUTransactions(fromDate, toDate);
    const txnMap = new Map<string, any>();
    payuTxns.forEach((txn) => {
      if (txn?.txnid) txnMap.set(txn.txnid, txn);
    });

    let reconciled = 0;
    let notFoundInPayU = 0;
    let errors = 0;
    const reconciledIds: string[] = [];

    for (const row of pendingRows) {
      const txnid = row.payu_txn_id;
      const payuTxn = txnMap.get(txnid);

      if (!payuTxn) {
        notFoundInPayU += 1;
        continue;
      }

      try {
        const result = await fulfillPayUPayment({
          txnid: payuTxn.txnid,
          mihpayid: payuTxn.mihpayid || payuTxn.id,
          status: payuTxn.status || "success",
          amount: payuTxn.amount,
          productinfo: payuTxn.productinfo,
          firstname: payuTxn.firstname,
          email: payuTxn.email || row.customer_email || undefined,
          udf1: payuTxn.udf1 || row.user_id || undefined,
          udf2: payuTxn.udf2 || row.type || undefined,
          udf3: payuTxn.udf3 || row.bundle_id || undefined,
          udf4: payuTxn.udf4 || row.feature || undefined,
          udf5: payuTxn.udf5 || (typeof row.coins === "number" ? String(row.coins) : undefined),
          key: process.env.PAYU_MERCHANT_KEY,
        });

        if (result.success) {
          reconciled += 1;
          reconciledIds.push(row.id);
        }
      } catch (error) {
        errors += 1;
        console.error("[reconcile-payu-payments] row reconcile error:", row.id, error);
      }
    }

    return NextResponse.json({
      success: true,
      scanned: pendingRows.length,
      payuMatched: txnMap.size,
      reconciled,
      notFoundInPayU,
      errors,
      fromDate,
      toDate,
      sampleReconciledIds: reconciledIds.slice(0, 50),
    });
  } catch (error: any) {
    console.error("[reconcile-payu-payments] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reconcile pending PayU payments" },
      { status: 500 }
    );
  }
}

function isAuthorized(request: NextRequest, secretFromBodyOrQuery?: string | null): boolean {
  if (secretFromBodyOrQuery) {
    return (
      secretFromBodyOrQuery === process.env.CRON_SECRET ||
      secretFromBodyOrQuery === process.env.ADMIN_SYNC_SECRET
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearer === process.env.CRON_SECRET || bearer === process.env.ADMIN_SYNC_SECRET;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const secret = body?.secret || null;

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lookbackDays = Math.max(1, Math.min(90, Number(body?.lookbackDays || 30)));
  const maxRows = Math.max(1, Math.min(2000, Number(body?.maxRows || 500)));
  return runReconciliation(lookbackDays, maxRows);
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lookbackDays = Math.max(1, Math.min(90, Number(request.nextUrl.searchParams.get("lookbackDays") || 30)));
  const maxRows = Math.max(1, Math.min(2000, Number(request.nextUrl.searchParams.get("maxRows") || 500)));
  return runReconciliation(lookbackDays, maxRows);
}
