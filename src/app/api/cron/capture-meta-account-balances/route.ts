import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  captureMetaAccountBalanceSnapshot,
  isAccountBalanceCaptureWindow,
} from "@/lib/meta-account-balances";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isAccountBalanceCaptureWindow(now)) {
    return jsonNoStore(
      { skipped: true, reason: "Account balances can only be captured from 11:30 AM to 11:34 AM IST." },
      { status: 409 }
    );
  }

  try {
    const result = await captureMetaAccountBalanceSnapshot(getSupabaseAdmin(), now);
    return jsonNoStore({
      success: true,
      status: result.status,
      date: result.date,
      capturedAt: result.snapshot?.fetchedAt,
      totalUSD: result.snapshot?.totalUSD,
      totalINR: result.snapshot?.totalINR,
    });
  } catch (error) {
    console.error("Meta account balance capture failed:", error);
    return jsonNoStore(
      { success: false, error: error instanceof Error ? error.message : "Account balance capture failed." },
      { status: 500 }
    );
  }
}
