import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function readField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

async function extractTxnId(request: NextRequest): Promise<string | null> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return (body?.txnid || "").trim() || null;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return null;
  return (readField(formData, "txnid") || "").trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const txnid = await extractTxnId(request);
    if (txnid) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("payments")
        .update({ payment_status: "failed" })
        .eq("payu_txn_id", txnid)
        .eq("payment_status", "created");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PayU failure callback error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process PayU failure callback" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "PayU failure callback endpoint is active",
  });
}
