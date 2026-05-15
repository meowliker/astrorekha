import { NextRequest, NextResponse } from "next/server";
import { buildOrderInvoice, generateOrderInvoicePdf } from "@/lib/order-invoice";

export const dynamic = "force-dynamic";

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const txnId = request.nextUrl.searchParams.get("txnid")?.trim() || "";
    const userId = request.nextUrl.searchParams.get("userId")?.trim() || "";
    const email = normalize(request.nextUrl.searchParams.get("email"));

    if (!txnId) {
      return NextResponse.json({ error: "txnid is required" }, { status: 400 });
    }

    if (!userId && !email) {
      return NextResponse.json({ error: "userId or email is required" }, { status: 400 });
    }

    const invoice = await buildOrderInvoice(txnId);
    const invoiceUserId = invoice.customer.userId;
    const invoiceEmail = normalize(invoice.customer.email);
    const ownsInvoice =
      (!!userId && userId === invoiceUserId) ||
      (!!email && email === invoiceEmail);

    if (!ownsInvoice) {
      return NextResponse.json({ error: "Invoice not found for this customer" }, { status: 404 });
    }

    const pdf = generateOrderInvoicePdf(invoice);
    const body = Uint8Array.from(pdf).buffer as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate invoice";
    console.error("[invoice/download] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
