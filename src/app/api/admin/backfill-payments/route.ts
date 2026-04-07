import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_LAUNCH_DATE, getPayUTransactions } from "@/lib/payu-api";

export const dynamic = "force-dynamic";

// Fallback bundle prices in paise (only used if PayU row is unavailable)
const BUNDLE_PRICES: Record<string, number> = {
  "palm-reading": 55900,
  "palm-birth": 83900,
  "palm-birth-compat": 159900,
  "palm-birth-sketch": 159900,
};

type BackfillUserRow = {
  id: string;
  email: string | null;
  payu_txn_id: string | null;
  payu_payment_id: string | null;
  bundle_purchased: string | null;
  payment_status: string | null;
  created_at: string | null;
};

type ExistingPaymentRow = {
  id: string;
  payu_txn_id: string | null;
};

function toYmdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parsePayUAddedOnToIso(addedon?: string): string | null {
  if (!addedon) return null;
  // PayU addedon is IST-like text: "YYYY-MM-DD HH:mm:ss"
  const dt = new Date(addedon.replace(" ", "T") + "+05:30");
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function parsePayUAmountToPaise(amount?: string): number {
  const parsed = Number.parseFloat(amount || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function toPaidStatus(status?: string, fallback?: string | null): string {
  const normalized = String(status || "").toLowerCase().trim();
  if (normalized === "success" || normalized === "captured" || normalized === "paid") {
    return "paid";
  }
  if (normalized) return normalized;
  return (fallback || "paid").toLowerCase().trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sessionData } = await supabase
      .from("admin_sessions")
      .select("id, expires_at")
      .eq("id", token)
      .single();

    if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const lookbackDays = clamp(Number(body?.lookbackDays || 90), 1, 365);
    const maxUsers = clamp(Number(body?.maxUsers || 10000), 1, 50000);

    const today = new Date();
    const launchYmd = toYmdUtc(APP_LAUNCH_DATE);
    const defaultFrom = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    let fromDate = String(body?.fromDate || toYmdUtc(defaultFrom));
    let toDate = String(body?.toDate || toYmdUtc(today));

    if (fromDate < launchYmd) fromDate = launchYmd;
    if (toDate < fromDate) toDate = fromDate;

    const fromIso = `${fromDate}T00:00:00.000Z`;
    const toIso = `${toDate}T23:59:59.999Z`;

    const { data: usersWithPayu, error: usersError } = await supabase
      .from("users")
      .select("id, email, payu_txn_id, payu_payment_id, bundle_purchased, payment_status, created_at")
      .not("payu_txn_id", "is", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(maxUsers);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const users = (usersWithPayu || []) as BackfillUserRow[];
    if (!users.length) {
      return NextResponse.json({
        success: true,
        summary: {
          fromDate,
          toDate,
          usersScanned: 0,
          payuFetched: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          fallbackCreated: 0,
          errors: 0,
        },
        message: "No users with payu_txn_id found in selected window",
      });
    }

    const txnIds = Array.from(
      new Set(
        users
          .map((u) => (u.payu_txn_id || "").trim())
          .filter(Boolean)
      )
    );

    const existingByTxn = new Map<string, ExistingPaymentRow>();
    for (const ids of chunk(txnIds, 500)) {
      const { data: existingRows, error: existingError } = await supabase
        .from("payments")
        .select("id, payu_txn_id")
        .in("payu_txn_id", ids);
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      for (const row of (existingRows || []) as ExistingPaymentRow[]) {
        if (row.payu_txn_id) existingByTxn.set(row.payu_txn_id, row);
      }
    }

    const payuTxns = await getPayUTransactions(fromDate, toDate);
    const payuByTxn = new Map<string, any>();
    for (const txn of payuTxns || []) {
      if (txn?.txnid) payuByTxn.set(String(txn.txnid), txn);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let fallbackCreated = 0;
    let errors = 0;
    const sampleResults: Array<Record<string, unknown>> = [];
    const handledTxnIds = new Set<string>();

    for (const user of users) {
      const txnid = (user.payu_txn_id || "").trim();
      if (!txnid) {
        skipped += 1;
        continue;
      }
      if (handledTxnIds.has(txnid)) {
        skipped += 1;
        sampleResults.push({ userId: user.id, txnid, action: "skipped_duplicate_txnid" });
        continue;
      }
      handledTxnIds.add(txnid);

      const payuTxn = payuByTxn.get(txnid);
      const existing = existingByTxn.get(txnid);

      const createdAtFromPayu = parsePayUAddedOnToIso(payuTxn?.addedon);
      const createdAt = createdAtFromPayu || user.created_at || new Date().toISOString();
      const amountPaiseFromPayu = parsePayUAmountToPaise(payuTxn?.amount);
      const fallbackBundle = user.bundle_purchased || "palm-birth";
      const fallbackAmount = BUNDLE_PRICES[fallbackBundle] || 0;
      const amount = amountPaiseFromPayu > 0 ? amountPaiseFromPayu : fallbackAmount;

      const payload = {
        payu_txn_id: txnid,
        payu_payment_id: (payuTxn?.mihpayid || user.payu_payment_id || null) as string | null,
        user_id: user.id,
        type: (payuTxn?.udf2 || "bundle") as string,
        bundle_id: (payuTxn?.udf3 || user.bundle_purchased || null) as string | null,
        feature: (payuTxn?.udf4 || null) as string | null,
        coins: (() => {
          const parsed = Number.parseInt(String(payuTxn?.udf5 || ""), 10);
          return Number.isFinite(parsed) ? parsed : null;
        })(),
        customer_email: (user.email || payuTxn?.email || null) as string | null,
        amount,
        currency: "INR",
        payment_status: toPaidStatus(payuTxn?.status, user.payment_status),
        fulfilled_at: createdAt,
        created_at: createdAt, // Key for 11:30 IST -> 11:30 IST business day grouping in reports
      };

      try {
        if (existing) {
          const { error: updateError } = await supabase
            .from("payments")
            .update(payload)
            .eq("id", existing.id);

          if (updateError) {
            errors += 1;
            sampleResults.push({ userId: user.id, txnid, action: "update", error: updateError.message });
          } else {
            updated += 1;
            sampleResults.push({
              userId: user.id,
              txnid,
              action: "updated",
              created_at: createdAt,
              source: createdAtFromPayu ? "payu_addedon" : "fallback_user_created_at",
            });
          }
        } else {
          const { error: insertError } = await supabase.from("payments").insert({
            id: `pay_${txnid}`,
            ...payload,
          });

          if (insertError) {
            errors += 1;
            sampleResults.push({ userId: user.id, txnid, action: "insert", error: insertError.message });
          } else {
            created += 1;
            if (!createdAtFromPayu) fallbackCreated += 1;
            sampleResults.push({
              userId: user.id,
              txnid,
              action: "created",
              created_at: createdAt,
              source: createdAtFromPayu ? "payu_addedon" : "fallback_user_created_at",
            });
          }
        }
      } catch (error: any) {
        errors += 1;
        sampleResults.push({ userId: user.id, txnid, action: "exception", error: error?.message || String(error) });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        fromDate,
        toDate,
        usersScanned: users.length,
        payuFetched: payuByTxn.size,
        created,
        updated,
        skipped,
        fallbackCreated,
        errors,
      },
      note:
        "payments.created_at is synced from PayU addedon (IST) when available, so 11:30 IST business-day reporting remains consistent.",
      sampleResults: sampleResults.slice(0, 200),
    });
  } catch (error: any) {
    console.error("Backfill payments error:", error);
    return NextResponse.json({ error: error.message || "Backfill failed" }, { status: 500 });
  }
}
