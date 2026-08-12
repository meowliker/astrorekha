import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  CHAT_UNLIMITED_OFFER_EVENT_NAMES,
  CHAT_UNLIMITED_PASS_ID,
  CHAT_UNLIMITED_PASS_TYPE,
  getChatUnlimitedPassEndsAt,
  getChatUnlimitedRemainingSeconds,
} from "@/lib/chat-unlimited-pass";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUCCESS_STATUSES = ["paid", "success", "captured"];

function normalizeId(value: string | null): string {
  return String(value || "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = normalizeId(searchParams.get("userId"));

    if (!userId) {
      return NextResponse.json({ active: false, shown: false, remainingSeconds: 0 });
    }

    const supabase = getSupabaseAdmin();
    const [{ data: passRows, error: passError }, { data: shownRows, error: shownError }] = await Promise.all([
      supabase
        .from("payments")
        .select("id, payu_txn_id, fulfilled_at, created_at")
        .eq("user_id", userId)
        .eq("type", CHAT_UNLIMITED_PASS_TYPE)
        .eq("bundle_id", CHAT_UNLIMITED_PASS_ID)
        .in("payment_status", SUCCESS_STATUSES)
        .order("fulfilled_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("marketing_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", CHAT_UNLIMITED_OFFER_EVENT_NAMES.shown)
        .limit(1),
    ]);

    if (passError) {
      console.warn("[chat/unlimited-pass/status] pass lookup failed", passError.message);
    }
    if (shownError) {
      console.warn("[chat/unlimited-pass/status] shown lookup failed", shownError.message);
    }

    const activePass = (passRows || [])
      .map((row: any) => {
        const startedAt = row.fulfilled_at || row.created_at || null;
        const endsAt = getChatUnlimitedPassEndsAt(startedAt);
        return {
          id: row.id,
          payuTxnId: row.payu_txn_id || null,
          startedAt,
          endsAt: endsAt?.toISOString() || null,
          remainingSeconds: getChatUnlimitedRemainingSeconds(endsAt),
        };
      })
      .find((row) => row.remainingSeconds > 0);

    return NextResponse.json({
      active: !!activePass,
      shown: !!shownRows?.length,
      remainingSeconds: activePass?.remainingSeconds || 0,
      pass: activePass || null,
    });
  } catch (error) {
    console.error("[chat/unlimited-pass/status] failed", error);
    return NextResponse.json({ active: false, shown: false, remainingSeconds: 0 }, { status: 200 });
  }
}
