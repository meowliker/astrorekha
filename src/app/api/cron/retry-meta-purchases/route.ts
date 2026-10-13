import { NextRequest, NextResponse } from "next/server";
import { sendMetaPurchase, type MetaPurchaseOrder } from "@/lib/meta-purchase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_META_PIXEL_ID || !process.env.META_CAPI_ACCESS_TOKEN) {
    return NextResponse.json({ enabled: false, message: "Meta Conversions API is not configured" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from("payments")
      .select("id,payu_txn_id,payment_status,amount,customer_email,user_id,fbc,fbp,bundle_id,feature,type,meta_client_user_agent,fulfilled_at,meta_purchase_sent_at")
      .in("payment_status", ["paid", "success", "captured"])
      .not("meta_purchase_queued_at", "is", null)
      .gte("meta_purchase_queued_at", since)
      .is("meta_purchase_sent_at", null)
      .order("meta_purchase_queued_at", { ascending: true })
      .limit(12);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    const payments = (data || []) as MetaPurchaseOrder[];
    for (let start = 0; start < payments.length; start += 3) {
      const results = await Promise.allSettled(
        payments.slice(start, start + 3).map((payment) => sendMetaPurchase(payment))
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          if (result.value === "sent") sent += 1;
        } else {
          failed += 1;
          console.error("[retry-meta-purchases] delivery failed", {
            orderId: payments[start + index].id,
            error: result.reason,
          });
        }
      });
    }
    return NextResponse.json({ scanned: data?.length || 0, sent, failed });
  } catch (error) {
    console.error("[retry-meta-purchases] query failed", error);
    return NextResponse.json({ error: "Unable to retry Meta purchases" }, { status: 500 });
  }
}
