import { NextRequest, NextResponse } from "next/server";
import { fulfillPayUPayment, type PayUCallbackPayload } from "@/lib/payu-fulfillment";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PayUCallbackPayload;

    const result = await fulfillPayUPayment(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.reason || "Payment was not successful" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      userId: result.userId,
    });
  } catch (error: any) {
    console.error("PayU verify error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
