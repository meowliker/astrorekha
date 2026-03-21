import { NextRequest, NextResponse } from "next/server";
import { fulfillPayUPayment, type PayUCallbackPayload } from "@/lib/payu-fulfillment";

function toPayloadFromFormData(formData: FormData): PayUCallbackPayload {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };

  return {
    txnid: get("txnid"),
    mihpayid: get("mihpayid"),
    status: get("status") || "success",
    hash: get("hash"),
    amount: get("amount"),
    productinfo: get("productinfo"),
    firstname: get("firstname"),
    email: get("email"),
    udf1: get("udf1"),
    udf2: get("udf2"),
    udf3: get("udf3"),
    udf4: get("udf4"),
    udf5: get("udf5"),
    key: get("key"),
  };
}

async function parsePayUPayload(request: NextRequest): Promise<PayUCallbackPayload> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as PayUCallbackPayload;
  }

  const formData = await request.formData();
  return toPayloadFromFormData(formData);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parsePayUPayload(request);
    await fulfillPayUPayment({
      ...payload,
      status: payload.status || "success",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PayU success callback error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process PayU success callback" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "PayU success callback endpoint is active",
  });
}
