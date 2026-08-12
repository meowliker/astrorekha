import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPayUTransactions } from "@/lib/payu-api";
import { fulfillPayUPayment } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";

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

const DEFAULT_LOOKBACK_DAYS = 2;
const DEFAULT_MAX_ROWS = 100;
const MAX_LOOKBACK_DAYS = 90;
const MAX_ROWS = 2000;
const DEFAULT_RECONCILE_STATUSES = ["created", "pending"];

function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

function parseBooleanFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function parseBoundedInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function runReconciliation(lookbackDays: number, maxRows: number, includeFailed: boolean) {
  try {
    const supabase = getSupabaseAdmin();
    const statuses = includeFailed ? [...DEFAULT_RECONCILE_STATUSES, "failed"] : DEFAULT_RECONCILE_STATUSES;

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingRows, error: pendingError } = await supabase
      .from("payments")
      .select("id, payu_txn_id, user_id, type, bundle_id, feature, coins, customer_email, payment_status, created_at")
      .in("payment_status", statuses)
      .not("payu_txn_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(maxRows);

    if (pendingError) {
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    if (!pendingRows || pendingRows.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        reconciled: 0,
        includeFailed,
        statuses,
        message: "No unresolved PayU payments in lookback window",
      });
    }

    const rowTimestamps = pendingRows
      .map((row) => (row.created_at ? new Date(row.created_at).getTime() : Number.NaN))
      .filter(Number.isFinite);
    const minCreatedAt = rowTimestamps.length
      ? new Date(Math.min(...rowTimestamps))
      : new Date();
    const maxCreatedAt = rowTimestamps.length
      ? new Date(Math.max(...rowTimestamps))
      : new Date();
    const fromDate = toYMD(new Date(minCreatedAt.getTime() - 24 * 60 * 60 * 1000));
    const toDate = toYMD(new Date(Math.max(Date.now(), maxCreatedAt.getTime()) + 24 * 60 * 60 * 1000));

    const payuTxns = (await getPayUTransactions(fromDate, toDate)) as PayUTransaction[];
    const txnMap = new Map<string, PayUTransaction>();
    payuTxns.forEach((txn) => {
      if (txn?.txnid) txnMap.set(txn.txnid, txn);
    });

    let reconciled = 0;
    let alreadyPaid = 0;
    let markedFailed = 0;
    let stillPending = 0;
    let notFoundInPayU = 0;
    let errors = 0;
    const reconciledIds: string[] = [];
    const failedIds: string[] = [];

    for (const row of pendingRows) {
      const txnid = row.payu_txn_id;
      const payuTxn = txnMap.get(txnid);

      if (!payuTxn) {
        notFoundInPayU += 1;
        continue;
      }

      const payuStatus = normalizeStatus(payuTxn.status || payuTxn.unmappedstatus);
      if (!payuStatus || payuStatus === "pending" || payuStatus === "in progress") {
        stillPending += 1;
        continue;
      }

      try {
        const result = await fulfillPayUPayment({
          txnid: payuTxn.txnid,
          mihpayid: payuTxn.mihpayid || payuTxn.id,
          status: payuTxn.status || payuTxn.unmappedstatus,
          amount: String(payuTxn.amount ?? ""),
          productinfo: payuTxn.productinfo,
          firstname: payuTxn.firstname,
          email: payuTxn.email || row.customer_email || undefined,
          phone: payuTxn.phone || payuTxn.phone_number || undefined,
          udf1: payuTxn.udf1 || row.user_id || undefined,
          udf2: payuTxn.udf2 || row.type || undefined,
          udf3: payuTxn.udf3 || row.bundle_id || undefined,
          udf4: payuTxn.udf4 || row.feature || undefined,
          udf5: payuTxn.udf5 || (typeof row.coins === "number" ? String(row.coins) : undefined),
          key: process.env.PAYU_MERCHANT_KEY,
        });

        if (result.success) {
          if (result.alreadyPaid) {
            alreadyPaid += 1;
          } else {
            reconciled += 1;
          }
          reconciledIds.push(row.id);
        } else {
          markedFailed += 1;
          failedIds.push(row.id);
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
      alreadyPaid,
      markedFailed,
      stillPending,
      notFoundInPayU,
      errors,
      lookbackDays,
      maxRows,
      includeFailed,
      statuses,
      fromDate,
      toDate,
      sampleReconciledIds: reconciledIds.slice(0, 50),
      sampleFailedIds: failedIds.slice(0, 50),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reconcile pending PayU payments";
    console.error("[reconcile-payu-payments] error:", error);
    return NextResponse.json(
      { success: false, error: message },
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

  const lookbackDays = parseBoundedInteger(body?.lookbackDays, DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS);
  const maxRows = parseBoundedInteger(body?.maxRows, DEFAULT_MAX_ROWS, 1, MAX_ROWS);
  const includeFailed = parseBooleanFlag(body?.includeFailed);
  return runReconciliation(lookbackDays, maxRows, includeFailed);
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lookbackDays = parseBoundedInteger(
    request.nextUrl.searchParams.get("lookbackDays"),
    DEFAULT_LOOKBACK_DAYS,
    1,
    MAX_LOOKBACK_DAYS
  );
  const maxRows = parseBoundedInteger(request.nextUrl.searchParams.get("maxRows"), DEFAULT_MAX_ROWS, 1, MAX_ROWS);
  const includeFailed = parseBooleanFlag(request.nextUrl.searchParams.get("includeFailed"));
  return runReconciliation(lookbackDays, maxRows, includeFailed);
}
