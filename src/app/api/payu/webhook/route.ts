import { NextRequest, NextResponse } from "next/server";
import { fulfillPayUPayment, type PayUCallbackPayload } from "@/lib/payu-fulfillment";

export const dynamic = "force-dynamic";

async function parsePayload(request: NextRequest): Promise<PayUCallbackPayload> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as PayUCallbackPayload;
  }
  const formData = await request.formData();
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return {
    txnid: get("txnid"), mihpayid: get("mihpayid"), status: get("status"),
    hash: get("hash"), amount: get("amount"), productinfo: get("productinfo"),
    firstname: get("firstname"), email: get("email"), phone: get("phone"),
    udf1: get("udf1"), udf2: get("udf2"), udf3: get("udf3"), udf4: get("udf4"),
    udf5: get("udf5"), key: get("key"),
    additionalCharges: get("additionalCharges"),
    additional_charges: get("additional_charges"),
  };
}

/** PayU Dashboard: Developers > Webhooks > Payments > Successful. */
export async function POST(request: NextRequest) {
  try {
    const payload = await parsePayload(request);
    const result = await fulfillPayUPayment(payload);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, alreadyPaid: result.alreadyPaid });
  } catch (error) {
    console.error("[payu/webhook] failed", error);
    return NextResponse.json({ success: false, error: "Payment notification failed" }, { status: 500 });
  }
}
