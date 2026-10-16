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
    phone: get("phone"),
    udf1: get("udf1"),
    udf2: get("udf2"),
    udf3: get("udf3"),
    udf4: get("udf4"),
    udf5: get("udf5"),
    key: get("key"),
    additionalCharges: get("additionalCharges"),
    additional_charges: get("additional_charges"),
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
  let payload: PayUCallbackPayload | undefined;
  try {
    payload = await parsePayUPayload(request);
    const result = await fulfillPayUPayment({
      ...payload,
      status: payload.status || "success",
    });
    if (!result.success) console.warn("PayU browser return needs server verification", { txnid: payload.txnid });

    const txnid = payload.txnid || "";
    const redirectUrl = new URL("/payment/processing", request.url);
    if (txnid) redirectUrl.searchParams.set("txnid", txnid);
    redirectUrl.searchParams.set("source", "payu_success");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error: unknown) {
    console.error("PayU success callback error:", error);
    if (payload?.txnid) {
      const recovery = new URL("/payment/processing", request.url);
      recovery.searchParams.set("txnid", payload.txnid);
      return NextResponse.redirect(recovery, { status: 303 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process PayU success callback" },
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
